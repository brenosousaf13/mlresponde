import "server-only"

import { PlatformAiPausedError, type AiUsageContext } from "@/lib/ai/usage"
import { rowReviewMode } from "@/lib/recovery/returns"
import { PHOTO_GUIDE, checkLabels, validatePhotos } from "@/lib/recovery/review"
import { runPhotoReviewModel, fileToImageDataUrl } from "@/lib/recovery/photo-review-model"
import type { PhotoReview } from "@/lib/recovery/photo-review"
import { suggestActionByRules, suggestInputFromRows, type ReturnSuggestion } from "@/lib/recovery/suggest"
import { runSuggestActionModel } from "@/lib/recovery/suggest-model"
import { createServiceClient } from "@/lib/supabase/admin"

// IA do Recuperador além do relato (engine.ts → draftReturnMessage): "Sugerir ação" e "Ver as fotos". Lê as linhas
// recovery_returns/reputation_claims com a chave de serviço (a organização já foi conferida na Server Action), nunca fala
// com o Mercado Livre e nunca envia nada: o dono decide e confirma no fluxo de revisão. Uso registrado em ai_usage_events
// como recovery_suggest_action e recovery_photo_review (não contam nas respostas do plano).

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

const RETURN_COLUMNS =
  "id, ml_account_id, claim_row_id, phase, item_title, orders, order_id, can_review_ok, can_review_fail, destination, shipment_status, return_status, reviews, status_money, amount, currency_id, deadline_at, is_cart"

async function loadForAssist(organizationId: string, returnRowId: string) {
  const admin = createServiceClient()
  const { data: row, error } = await admin
    .from("recovery_returns")
    .select(RETURN_COLUMNS)
    .eq("id", returnRowId)
    .eq("organization_id", organizationId)
    .maybeSingle()
  if (error) throw error
  if (!row) return null
  const [{ data: organization }, { data: claim }] = await Promise.all([
    admin.from("organizations").select("name").eq("id", organizationId).single(),
    admin.from("reputation_claims").select("reason_detail, affects_reputation").eq("id", row.claim_row_id).maybeSingle(),
  ])
  return { row, claim: claim ?? null, storeName: organization?.name ?? "sua loja" }
}

// ---------------------------------------------------------------------------------------------- limite de uso

/** Teto de chamadas por organização e hora (a conferência de fotos custa mais e pode ser acionada sem querer). */
const HOURLY_LIMITS = { recovery_suggest_action: 120, recovery_photo_review: 40 } as const

/** true = passou do teto. Se a consulta falhar, deixa passar (o limite é proteção, não regra de negócio). */
async function overHourlyLimit(organizationId: string, feature: keyof typeof HOURLY_LIMITS): Promise<boolean> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count, error } = await createServiceClient()
    .from("ai_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("feature", feature)
    .gte("created_at", since)
  if (error) return false
  return (count ?? 0) >= HOURLY_LIMITS[feature]
}

// ---------------------------------------------------------------------------------------------- sugerir ação

const SUGGESTION_TTL_MS = 15 * 60 * 1000
const SUGGESTION_CACHE_MAX = 200
// Só nesta instância do servidor (melhor esforço): evita pagar a IA de novo a cada vez que a página é aberta.
const suggestionCache = new Map<string, { at: number; suggestion: ReturnSuggestion }>()

export type SuggestResult = { ok: true; suggestion: ReturnSuggestion } | { ok: false; message: string }

/**
 * Sugestão de ação para uma devolução que espera o dono. Regras + IA (JSON estrito); se a IA falhar, estiver pausada ou
 * passar do limite, devolve as regras (source = "rules"). Devolução sem revisão liberada → ok:false.
 */
export async function suggestReturnAction(organizationId: string, returnRowId: string): Promise<SuggestResult> {
  const loaded = await loadForAssist(organizationId, returnRowId)
  if (!loaded) return { ok: false, message: "Devolução não encontrada." }
  const { row, claim, storeName } = loaded
  const mode = row.phase === "needs_review" ? rowReviewMode(row) : null
  if (!mode) return { ok: false, message: "Esta devolução não espera a sua revisão agora." }

  const input = suggestInputFromRows(row, claim, mode)
  const baseline = suggestActionByRules(input)
  const key = organizationId + ":" + returnRowId + ":" + JSON.stringify(input)
  const cached = suggestionCache.get(key)
  if (cached && Date.now() - cached.at < SUGGESTION_TTL_MS) return { ok: true, suggestion: cached.suggestion }

  try {
    if (await overHourlyLimit(organizationId, "recovery_suggest_action")) return { ok: true, suggestion: baseline }
    const usage: AiUsageContext = { feature: "recovery_suggest_action", organizationId, mlAccountId: row.ml_account_id }
    const suggestion = await runSuggestActionModel(input, baseline, { storeName, itemTitle: row.item_title }, usage)
    if (suggestion.source === "ai") {
      if (suggestionCache.size >= SUGGESTION_CACHE_MAX) suggestionCache.delete(suggestionCache.keys().next().value as string)
      suggestionCache.set(key, { at: Date.now(), suggestion })
    }
    return { ok: true, suggestion }
  } catch (error) {
    if (!(error instanceof PlatformAiPausedError)) console.error("[recuperador] sugestão da IA:", errorMessage(error))
    return { ok: true, suggestion: baseline }
  }
}

// ---------------------------------------------------------------------------------------------- ver as fotos

export type PhotoReviewResult =
  | { ok: true; review: PhotoReview }
  | { ok: false; message: string; /** A conferência não pôde rodar (IA pausada, falha ou limite): a tela NÃO trava o envio. */ unavailable: boolean }

export type PhotoReviewRequest = { reasonId: string; reasonLabel: string; checks: string[]; photos: File[] }

/**
 * Conferência das fotos com visão. Valida as fotos como no envio (tipo, tamanho, quantidade) e manda as imagens ao
 * modelo; nada é enviado ao Mercado Livre e as fotos não são guardadas.
 */
export async function reviewReturnPhotos(
  organizationId: string,
  returnRowId: string,
  request: PhotoReviewRequest
): Promise<PhotoReviewResult> {
  const loaded = await loadForAssist(organizationId, returnRowId)
  if (!loaded) return { ok: false, message: "Devolução não encontrada.", unavailable: false }
  const { row } = loaded
  if (!request.photos.length) return { ok: false, message: "Adicione pelo menos uma foto para a IA conferir.", unavailable: false }
  const invalid = validatePhotos(request.photos, request.reasonId)
  if (invalid) return { ok: false, message: invalid, unavailable: false }
  const guide = PHOTO_GUIDE[request.reasonId] ?? []
  const mode = row.phase === "needs_review" ? rowReviewMode(row) : null

  try {
    if (await overHourlyLimit(organizationId, "recovery_photo_review")) {
      return { ok: false, message: "Muitas conferências de fotos na última hora. Envie assim mesmo ou tente mais tarde.", unavailable: true }
    }
    const images = await Promise.all(request.photos.map((photo) => fileToImageDataUrl(photo)))
    const review = await runPhotoReviewModel(
      {
        reasonId: request.reasonId,
        reasonLabel: request.reasonLabel,
        checks: checkLabels(request.reasonId, request.checks),
        guide,
        appeal: mode === "appeal",
        itemTitle: row.item_title,
        photoCount: images.length,
      },
      images,
      { feature: "recovery_photo_review", organizationId, mlAccountId: row.ml_account_id }
    )
    if (!review) return { ok: false, message: "A IA não conseguiu conferir as fotos agora.", unavailable: true }
    return { ok: true, review }
  } catch (error) {
    if (!(error instanceof PlatformAiPausedError)) console.error("[recuperador] conferência das fotos:", errorMessage(error))
    return { ok: false, message: "A IA não conseguiu conferir as fotos agora. Você pode enviar mesmo assim.", unavailable: true }
  }
}