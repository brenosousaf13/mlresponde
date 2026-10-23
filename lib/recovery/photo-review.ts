import type { ChatCompletionContentPart, ChatCompletionMessageParam } from "openai/resources/chat/completions"

import { DEFAULT_ANSWER_MODEL } from "@/lib/answers/model"

/**
 * Conferência das fotos da revisão pela IA com visão (puro, testado em tests/unit/recovery-ai.test.ts). Antes de liberar
 * o envio, a IA olha as fotos que o dono anexou e diz: o que cada foto mostra, quais itens do guia do motivo
 * (PHOTO_GUIDE em review.ts) estão cobertos, o que falta e se as fotos sustentam o motivo e o que ele marcou. Ela não
 * decide o caso nem acusa ninguém. O dono pode enviar mesmo assim (decisão humana, 1 clique); nada vai ao ML sozinho.
 */

export const PHOTO_REVIEW_VERDICTS = ["ok", "needs_more", "unusable"] as const
export type PhotoReviewVerdict = (typeof PHOTO_REVIEW_VERDICTS)[number]
export type PhotoSupport = "yes" | "partial" | "no" | "unclear"

export type PhotoReview = {
  /** ok = pode enviar; needs_more = faltam ângulos ou o dano não aparece; unusable = nenhuma foto serve. */
  verdict: PhotoReviewVerdict
  /** Resumo curto em PT-BR. */
  summary: string
  /** O guia de fotos do motivo, item a item (vazio se o motivo não tem guia). */
  guide: { item: string; covered: boolean }[]
  /** Itens do guia que faltam + outros pontos (ex.: "foto mais nítida do dano"). */
  missing: string[]
  /** As fotos confirmam o motivo e o que o dono marcou? */
  supportsReason: PhotoSupport
  /** index começa em 1 ("Foto 1"). */
  photos: { index: number; shows: string; usable: boolean; issue: string | null }[]
}

export type PhotoReviewInput = {
  reasonId: string
  reasonLabel: string
  /** Rótulos do que o dono marcou no checklist. */
  checks: string[]
  /** PHOTO_GUIDE do motivo. */
  guide: readonly string[]
  appeal: boolean
  itemTitle: string | null
  photoCount: number
}

export const PHOTO_REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    verdict: { type: "string", enum: [...PHOTO_REVIEW_VERDICTS] },
    summary: { type: "string" },
    covered_guide: { type: "array", items: { type: "integer" } },
    extra_missing: { type: "array", items: { type: "string" } },
    supports_reason: { type: "string", enum: ["yes", "partial", "no", "unclear"] },
    photos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          index: { type: "integer" },
          shows: { type: "string" },
          usable: { type: "boolean" },
          issue: { type: ["string", "null"] },
        },
        required: ["index", "shows", "usable", "issue"],
      },
    },
  },
  required: ["verdict", "summary", "covered_guide", "extra_missing", "supports_reason", "photos"],
} as const

/** Modelo que enxerga imagens: o mesmo do projeto (GPT-6 Luna aceita texto e imagem); só o gpt-3.5 não, e então usa o padrão. */
export function visionModelFor(model: string): string {
  return /^gpt-3\.5/i.test(model.trim()) ? DEFAULT_ANSWER_MODEL : model
}

export function buildPhotoReviewSystemPrompt(): string {
  return [
    "Você confere as fotos que o dono de uma loja do Mercado Livre (Brasil) vai anexar à revisão de uma devolução, ANTES de enviar. Você diz se as fotos mostram o que o motivo exige e o que falta. Você não decide o caso e não acusa ninguém.",
    "",
    "Regras:",
    "- Descreva só o que se vê. Nunca invente dano, marca, número de série ou texto que não esteja legível na foto.",
    "- covered_guide: os números dos itens do guia que pelo menos uma foto mostra com clareza (nítida, bem enquadrada, legível). Na dúvida, não marque.",
    "- extra_missing: até 3 pontos curtos que ainda faltam para sustentar o relato (ex.: \"foto mais nítida do dano\", \"etiqueta ilegível\"). Não repita itens do guia. Se aparecer rosto, documento ou endereço de pessoa, peça para refazer a foto sem isso.",
    "- supports_reason: yes se as fotos confirmam o motivo e o que o vendedor marcou; partial se confirmam só parte; no se mostram o contrário ou nada relacionado; unclear se não dá para concluir.",
    "- photos: uma entrada por foto (index começa em 1). shows = o que aparece (até 100 caracteres). usable = false se estiver escura, borrada, cortada, sem relação com o produto ou for captura de tela. issue = o problema da foto, ou null.",
    "- verdict: ok se as fotos cobrem o guia e sustentam o motivo; needs_more se faltam ângulos ou o dano não aparece; unusable se nenhuma foto serve.",
    "- Português do Brasil, segunda pessoa (\"você\"), tom curto e objetivo. summary: até 200 caracteres.",
  ].join("\n")
}

export function buildPhotoReviewUserPrompt(input: PhotoReviewInput): string {
  return [
    "Produto: " + (input.itemTitle?.trim() ? input.itemTitle.trim().slice(0, 120) : "(não informado)"),
    "Motivo escolhido: " + input.reasonId + " — " + input.reasonLabel,
    "Contexto: " + (input.appeal ? "contestação da revisão feita pelo armazém do Mercado Livre" : "revisão do pacote devolvido que chegou ao vendedor"),
    "O que o vendedor marcou ao conferir: " + (input.checks.length ? input.checks.join("; ") : "(nada marcado)"),
    "Guia de fotos esperado:",
    ...(input.guide.length
      ? input.guide.map((item, index) => index + 1 + ". " + item)
      : ["(sem guia fixo para este motivo: avalie se as fotos sustentam o motivo)"]),
    "Fotos anexadas: " + input.photoCount,
  ].join("\n")
}

/** Mensagens da chamada com visão: o texto e cada foto (data URL) logo depois do seu número. */
export function buildPhotoReviewMessages(input: PhotoReviewInput, imageUrls: readonly string[]): ChatCompletionMessageParam[] {
  const parts: ChatCompletionContentPart[] = [{ type: "text", text: buildPhotoReviewUserPrompt(input) }]
  imageUrls.forEach((url, index) => {
    parts.push({ type: "text", text: "Foto " + (index + 1) + ":" })
    parts.push({ type: "image_url", image_url: { url, detail: "auto" } })
  })
  return [
    { role: "system", content: buildPhotoReviewSystemPrompt() },
    { role: "user", content: parts },
  ]
}

function clip(value: unknown, max: number): string {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text
}

const VERDICT_ORDER: Record<PhotoReviewVerdict, number> = { ok: 0, needs_more: 1, unusable: 2 }

/**
 * Valida a resposta da IA e fecha o veredito com regras: o modelo só pode PIORAR o que os fatos mostram (itens do guia sem
 * cobertura ou fotos que não sustentam o motivo = needs_more; nenhuma foto utilizável = unusable). Resposta malformada → null
 * (a tela segue sem a conferência).
 */
export function normalizePhotoReview(raw: unknown, input: Pick<PhotoReviewInput, "guide" | "photoCount">): PhotoReview | null {
  if (!raw || typeof raw !== "object") return null
  const data = raw as {
    verdict?: unknown
    summary?: unknown
    covered_guide?: unknown
    extra_missing?: unknown
    supports_reason?: unknown
    photos?: unknown
  }
  const modelVerdict = PHOTO_REVIEW_VERDICTS.find((item) => item === data.verdict)
  const supports = (["yes", "partial", "no", "unclear"] as const).find((item) => item === data.supports_reason)
  if (!modelVerdict || !supports || !Array.isArray(data.photos)) return null

  const coveredIds = new Set(
    (Array.isArray(data.covered_guide) ? data.covered_guide : []).filter((value): value is number => Number.isInteger(value))
  )
  const guide = input.guide.map((item, index) => ({ item, covered: coveredIds.has(index + 1) }))
  const extra = (Array.isArray(data.extra_missing) ? data.extra_missing : [])
    .map((value) => clip(value, 100))
    .filter(Boolean)
    .slice(0, 3)
  const missing = [...guide.filter((entry) => !entry.covered).map((entry) => entry.item), ...extra]

  const seen = new Set<number>()
  const photos = data.photos
    .flatMap((entry: { index?: unknown; shows?: unknown; usable?: unknown; issue?: unknown }) => {
      const index = Number(entry?.index)
      if (!Number.isInteger(index) || index < 1 || index > input.photoCount || seen.has(index)) return []
      seen.add(index)
      return [{ index, shows: clip(entry.shows, 100), usable: entry.usable !== false, issue: clip(entry.issue, 140) || null }]
    })
    .sort((a, b) => a.index - b.index)

  const noneUsable = photos.length > 0 && photos.every((photo) => !photo.usable)
  const computed: PhotoReviewVerdict = noneUsable ? "unusable" : missing.length > 0 || supports === "no" ? "needs_more" : "ok"
  const verdict = VERDICT_ORDER[modelVerdict] > VERDICT_ORDER[computed] ? modelVerdict : computed

  const summary =
    clip(data.summary, 240) ||
    (verdict === "ok"
      ? "As fotos mostram o que o Mercado Livre costuma pedir para este motivo."
      : verdict === "unusable"
        ? "Nenhuma foto está boa o bastante para servir de prova."
        : "Faltam fotos para sustentar o relato.")
  return { verdict, summary, guide, missing, supportsReason: supports, photos }
}

// ---------------------------------------------------------------------------------------------- liberação do envio

export type PhotoReviewState = "idle" | "running" | "done" | "unavailable"

/**
 * O que a tela faz com o botão de enviar: sem fotos, não interfere (a validação do relato cuida das obrigatórias); com
 * fotos, espera a conferência. Se a conferência apontar falta, o envio só libera depois do "enviar mesmo assim" do dono.
 * Conferência indisponível (IA pausada ou falha) nunca trava o envio.
 */
export function photoReviewGate(input: {
  photoCount: number
  state: PhotoReviewState
  verdict: PhotoReviewVerdict | null
  acknowledged: boolean
}): { blocked: boolean; reason: string | null } {
  if (input.photoCount <= 0 || input.state === "unavailable") return { blocked: false, reason: null }
  if (input.state === "running") return { blocked: true, reason: "A IA está conferindo as fotos..." }
  if (input.state === "idle" || !input.verdict) return { blocked: true, reason: "Aguarde a conferência das fotos." }
  if (input.verdict === "ok" || input.acknowledged) return { blocked: false, reason: null }
  return {
    blocked: true,
    reason:
      input.verdict === "unusable"
        ? "As fotos não servem de prova. Tire outras ou escolha enviar mesmo assim."
        : "Faltam fotos para sustentar o relato. Adicione mais ou escolha enviar mesmo assim.",
  }
}

/** Identifica o conjunto de fotos + motivo (a conferência só roda de novo quando isso muda). */
export function photoFingerprint(reasonId: string, photos: readonly { name: string; size: number }[]): string {
  return reasonId + "|" + photos.map((photo) => photo.name + ":" + photo.size).join(",")
}
