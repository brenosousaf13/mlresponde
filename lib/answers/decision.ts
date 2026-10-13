import { ML_ANSWER_LIMIT, composeAnswer, containsExternalContact } from "@/lib/answers/compose"

export type AiResult = {
  action: "answer" | "escalate"
  answer: string
  confidence: number
  reason: string
}

export type ReviewReason =
  | "ai_escalated"
  | "low_confidence"
  | "unsafe_answer"
  | "answer_too_long"
  | "auto_reply_off"
  | "blacklisted"
  | "account_inactive"
  | "access_blocked"
  | "processing_error"
  | "answers_limit"

/**
 * careful = o que a IA não tiver certeza fica para o vendedor (padrão).
 * always = a IA sempre responde; quando não souber, envia a mensagem padrão da loja.
 */
export type AnswerMode = "careful" | "always"

export const ANSWER_MODES: readonly AnswerMode[] = ["careful", "always"]

export function parseAnswerMode(value: unknown): AnswerMode {
  return value === "always" ? "always" : "careful"
}

/** Por que a IA não respondeu de verdade e, no modo "sempre", mandou a mensagem padrão. */
export type FallbackReason = Extract<ReviewReason, "ai_escalated" | "low_confidence" | "unsafe_answer" | "answer_too_long">

export const FALLBACK_ANSWER_LIMIT = 1000

/** Mensagem padrão do modo "sempre" quando o vendedor não escreveu a dele. */
export const DEFAULT_FALLBACK_ANSWER =
  "Infelizmente não temos essa informação confirmada para te responder com segurança. Os detalhes que temos do produto estão na descrição e na ficha técnica do anúncio."

/** Texto da mensagem padrão (sem saudação nem assinatura): a do vendedor ou a do sistema. */
export function fallbackBody(custom: string | null | undefined): string {
  const text = (custom ?? "").replace(/\s+/g, " ").trim()
  return text || DEFAULT_FALLBACK_ANSWER
}

export type AnswerDecision =
  | { kind: "answer"; text: string; fallbackReason: FallbackReason | null }
  | { kind: "review"; reason: ReviewReason }

export type DecisionSettings = {
  threshold: number
  greeting: string
  signature: string
  /** Padrão: "careful". */
  mode?: AnswerMode
  /** Mensagem padrão do modo "sempre" (vazia = texto do sistema). */
  fallback?: string
}

type Check = { ok: true; text: string } | { ok: false; reason: FallbackReason }

/** A resposta da própria IA pode ir para o comprador? */
function checkAiAnswer(result: AiResult, settings: DecisionSettings): Check {
  const body = result.answer.trim()
  if (result.action !== "answer" || !body) return { ok: false, reason: "ai_escalated" }
  if (!(result.confidence >= settings.threshold)) return { ok: false, reason: "low_confidence" }
  if (containsExternalContact(body)) return { ok: false, reason: "unsafe_answer" }
  const text = composeAnswer({ greeting: settings.greeting, body, signature: settings.signature })
  if (text.length > ML_ANSWER_LIMIT) return { ok: false, reason: "answer_too_long" }
  return { ok: true, text }
}

/** Mensagem padrão com saudação e assinatura (com os limites dos campos, sempre cabe no ML). */
export function composeFallback(settings: Pick<DecisionSettings, "greeting" | "signature" | "fallback">): string {
  const body = fallbackBody(settings.fallback)
  const text = composeAnswer({ greeting: settings.greeting, body, signature: settings.signature })
  if (text.length <= ML_ANSWER_LIMIT) return text
  // Defesa extra: se um dia não couber, vai só o corpo.
  return composeAnswer({ body })
}

export function decideAnswer(result: AiResult, settings: DecisionSettings): AnswerDecision {
  const check = checkAiAnswer(result, settings)
  if (check.ok) return { kind: "answer", text: check.text, fallbackReason: null }
  if (settings.mode !== "always") return { kind: "review", reason: check.reason }
  return { kind: "answer", text: composeFallback(settings), fallbackReason: check.reason }
}

export const RETRY_LIMIT = 5

/** Espera antes da próxima tentativa: 1, 2, 4, 8, 16 minutos. */
export function retryDelayMs(attempts: number): number {
  const exponent = Math.min(Math.max(attempts - 1, 0), 4)
  return 60_000 * 2 ** exponent
}

export const REVIEW_REASON_LABELS: Record<ReviewReason, string> = {
  ai_escalated: "A IA preferiu deixar para você",
  low_confidence: "A IA não teve certeza suficiente",
  unsafe_answer: "A resposta citava contato externo",
  answer_too_long: "A resposta passou do limite do Mercado Livre",
  auto_reply_off: "Respostas automáticas pausadas",
  blacklisted: "Anúncio na lista \"não responder\"",
  account_inactive: "Conta desativada ou desconectada",
  access_blocked: "Assinatura inativa",
  processing_error: "Erro ao processar",
  answers_limit: "Limite de respostas automáticas do plano atingido",
}

/** Por que a mensagem padrão foi enviada (modo "sempre"), em linguagem do vendedor. */
export const FALLBACK_REASON_LABELS: Record<FallbackReason, string> = {
  ai_escalated: "A IA não encontrou essa informação no anúncio nem nas informações da loja",
  low_confidence: "A IA não teve certeza suficiente da resposta",
  unsafe_answer: "A resposta da IA citava contato externo",
  answer_too_long: "A resposta da IA passou do limite do Mercado Livre",
}

export const CONFIDENCE_PRESETS = [
  {
    value: "0.85",
    label: "Cautelosa",
    description: "Responde só quando tem muita certeza. Mais perguntas ficam para você.",
    alwaysDescription: "Só usa a resposta dela quando tem muita certeza. Mais perguntas recebem a mensagem padrão.",
  },
  {
    value: "0.75",
    label: "Equilibrada",
    description: "Bom equilíbrio entre rapidez e segurança.",
    alwaysDescription: "Bom equilíbrio entre respostas completas e segurança.",
  },
  {
    value: "0.6",
    label: "Ousada",
    description: "Responde mais perguntas sozinha. Revise o histórico com frequência.",
    alwaysDescription: "Usa a resposta dela mais vezes. Revise o histórico com frequência.",
  },
] as const

export const TONE_OPTIONS = [
  { value: "cordial", label: "Cordial", instruction: "cordial e simpático, próximo do cliente, sem exageros" },
  { value: "profissional", label: "Profissional", instruction: "profissional, objetivo e educado" },
  { value: "descontraido", label: "Descontraído", instruction: "leve e descontraído, mas respeitoso" },
] as const

export type AnswerTone = (typeof TONE_OPTIONS)[number]["value"]
