import "server-only"

import { PlatformAiPausedError } from "@/lib/ai/usage"
import type { AppContext } from "@/lib/dal/app-context"
import { countListingImprovements } from "@/lib/dal/plan"
import { runImprovementModel } from "@/lib/listing-improvements/ai"
import { serializeImprovementResult } from "@/lib/listing-improvements/parse"
import { IMPROVEMENT_PERIOD_DAYS } from "@/lib/listing-improvements/presentation"
import {
  MAX_ANALYZED_QUESTIONS,
  MIN_ANALYZED_QUESTIONS,
  type ImprovementQuestion,
} from "@/lib/listing-improvements/prompt"
import { MlAccountUnavailableError } from "@/lib/mercadolivre/accounts"
import { MlApiError } from "@/lib/mercadolivre/api"
import { mlImageUrl } from "@/lib/mercadolivre/images"
import { summarizeItem } from "@/lib/mercadolivre/item"
import { fetchItemContext } from "@/lib/mercadolivre/questions"
import { hasQuotaLeft, usagePeriod } from "@/lib/plans/usage"
import { createServiceClient } from "@/lib/supabase/admin"

export const ITEM_ID_PATTERN = /^[A-Z]{3}\d{6,15}$/

export type ImprovementErrorCode = "plan" | "quota" | "few_questions" | "account" | "busy" | "item" | "ai_paused" | "failed"

export class ListingImprovementError extends Error {
  constructor(
    readonly code: ImprovementErrorCode,
    message: string
  ) {
    super(message)
    this.name = "ListingImprovementError"
  }
}

/** Análise em andamento há mais tempo que isso foi abandonada (servidor caiu): pode ser refeita e não conta na cota. */
const STALE_PROCESSING_MS = 10 * 60 * 1000

/**
 * Gera as sugestões de melhoria de um anúncio: confere plano e cota, lê as perguntas do anúncio (com as respostas),
 * lê o anúncio no Mercado Livre, chama a IA e grava o resultado. Se algo falhar, a reserva é apagada e a cota não
 * é gasta.
 */
export async function generateListingImprovement(
  context: AppContext,
  params: { accountId: string; itemId: string }
): Promise<{ id: string }> {
  if (!ITEM_ID_PATTERN.test(params.itemId)) throw new ListingImprovementError("item", "Anúncio inválido.")
  const organizationId = context.organization.id

  const limit = context.profile.isPlatformAdmin ? null : context.plan.limits.listingImprovementsPerMonth
  if (!context.features.melhorias_anuncio || limit === 0) {
    throw new ListingImprovementError("plan", "As melhorias de anúncio estão disponíveis a partir do plano Pro.")
  }

  const admin = createServiceClient()
  const period = usagePeriod(context.plan, {
    createdAt: context.organization.createdAt,
    trialEndsAt: context.organization.trialEndsAt,
  })
  const used = await countListingImprovements(admin, organizationId, period)
  if (!hasQuotaLeft(used, limit)) {
    throw new ListingImprovementError(
      "quota",
      period.kind === "trial"
        ? `Você já usou as ${limit} análises do teste grátis. Assine um plano para continuar.`
        : `Você já usou as ${limit} análises deste mês. A cota renova no dia 1º.`
    )
  }

  const { data: account, error: accountError } = await admin
    .from("ml_accounts")
    .select("id, status, token_status, nickname")
    .eq("id", params.accountId)
    .eq("organization_id", organizationId)
    .maybeSingle()
  if (accountError) throw accountError
  if (!account) throw new ListingImprovementError("account", "Conta do Mercado Livre não encontrada.")
  if (account.status === "disconnected" || account.token_status === "invalid") {
    throw new ListingImprovementError("account", "Reconecte esta conta do Mercado Livre para analisar os anúncios dela.")
  }

  const since = new Date(Date.now() - IMPROVEMENT_PERIOD_DAYS * 24 * 60 * 60 * 1000)
  const { data: rows, error: questionsError } = await admin
    .from("ml_questions")
    .select("question_text, answer_text, status, question_created_at, created_at, item_title, item_permalink, item_thumbnail")
    .eq("organization_id", organizationId)
    .eq("ml_account_id", account.id)
    .eq("item_id", params.itemId)
    .neq("question_text", "")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(MAX_ANALYZED_QUESTIONS)
  if (questionsError) throw questionsError
  if (rows.length < MIN_ANALYZED_QUESTIONS) {
    throw new ListingImprovementError(
      "few_questions",
      `Este anúncio precisa de pelo menos ${MIN_ANALYZED_QUESTIONS} perguntas nos últimos ${IMPROVEMENT_PERIOD_DAYS} dias para a análise.`
    )
  }

  const questions: ImprovementQuestion[] = rows.map((row) => ({
    text: row.question_text,
    // Só respostas que chegaram ao comprador (a da IA, a do vendedor ou a de fora): são o que falta no anúncio.
    answer: row.status === "answered" || row.status === "answered_outside" ? row.answer_text : null,
    askedAt: row.question_created_at ?? row.created_at,
  }))
  const dates = questions.map((question) => new Date(question.askedAt ?? 0).getTime()).filter((value) => value > 0)
  const latest = rows.find((row) => row.item_title) ?? rows[0]

  // Reserva: no máximo uma análise em andamento por anúncio (índice único). Reservas abandonadas são liberadas.
  await admin
    .from("listing_improvements")
    .delete()
    .eq("ml_account_id", account.id)
    .eq("item_id", params.itemId)
    .eq("status", "processing")
    .lt("created_at", new Date(Date.now() - STALE_PROCESSING_MS).toISOString())
  const { data: reserved, error: reserveError } = await admin
    .from("listing_improvements")
    .insert({
      organization_id: organizationId,
      ml_account_id: account.id,
      item_id: params.itemId,
      item_title: latest.item_title?.slice(0, 300) ?? null,
      item_permalink: latest.item_permalink?.slice(0, 500) ?? null,
      item_thumbnail: latest.item_thumbnail?.slice(0, 500) ?? null,
      created_by: context.user.id,
    })
    .select("id")
    .single()
  if (reserveError) {
    if (reserveError.code === "23505") {
      throw new ListingImprovementError("busy", "Este anúncio já está sendo analisado. Aguarde alguns segundos.")
    }
    throw reserveError
  }

  try {
    const { item, description, extras } = await fetchItemContext(account.id, params.itemId)
    const run = await runImprovementModel(
      {
        storeName: context.organization.name,
        itemSummary: summarizeItem(item, description, extras),
        isCatalog: Boolean(item.catalog_product_id),
        periodDays: IMPROVEMENT_PERIOD_DAYS,
        questions,
      },
      { feature: "listing_improvement", organizationId, mlAccountId: account.id }
    )

    const { error: saveError } = await admin
      .from("listing_improvements")
      .update({
        status: "ready",
        result: serializeImprovementResult(run.result),
        questions_analyzed: questions.length,
        questions_from: dates.length ? new Date(Math.min(...dates)).toISOString() : null,
        questions_to: dates.length ? new Date(Math.max(...dates)).toISOString() : null,
        item_title: item.title?.slice(0, 300) ?? latest.item_title,
        item_permalink: item.permalink?.slice(0, 500) ?? latest.item_permalink,
        item_thumbnail: mlImageUrl(item.secure_thumbnail ?? item.thumbnail ?? latest.item_thumbnail)?.slice(0, 500) ?? null,
        model: run.model.slice(0, 100),
      })
      .eq("id", reserved.id)
    if (saveError) throw saveError
    return { id: reserved.id }
  } catch (error) {
    await admin.from("listing_improvements").delete().eq("id", reserved.id).eq("status", "processing")
    if (error instanceof PlatformAiPausedError) throw new ListingImprovementError("ai_paused", error.message)
    if (error instanceof MlAccountUnavailableError) throw new ListingImprovementError("account", error.message)
    if (error instanceof MlApiError) {
      throw new ListingImprovementError(
        "item",
        error.status === 404
          ? "O Mercado Livre não encontrou este anúncio (pode ter sido excluído)."
          : "O Mercado Livre não respondeu agora. Tente de novo em instantes."
      )
    }
    console.error("[melhorias] análise:", error instanceof Error ? error.message : error)
    throw new ListingImprovementError("failed", "Não foi possível analisar agora. Tente de novo em instantes.")
  }
}
