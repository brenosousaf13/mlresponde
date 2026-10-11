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

export type AnswerDecision =
  | { kind: "answer"; text: string }
  | { kind: "review"; reason: ReviewReason }

export function decideAnswer(
  result: AiResult,
  settings: { threshold: number; greeting: string; signature: string }
): AnswerDecision {
  const body = result.answer.trim()
  if (result.action !== "answer" || !body) return { kind: "review", reason: "ai_escalated" }
  if (!(result.confidence >= settings.threshold)) return { kind: "review", reason: "low_confidence" }
  if (containsExternalContact(body)) return { kind: "review", reason: "unsafe_answer" }

  const text = composeAnswer({ greeting: settings.greeting, body, signature: settings.signature })
  if (text.length > ML_ANSWER_LIMIT) return { kind: "review", reason: "answer_too_long" }
  return { kind: "answer", text }
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
}

export const CONFIDENCE_PRESETS = [
  { value: "0.85", label: "Cautelosa", description: "Responde só quando tem muita certeza. Mais perguntas ficam para você." },
  { value: "0.75", label: "Equilibrada", description: "Recomendado. Bom equilíbrio entre rapidez e segurança." },
  { value: "0.6", label: "Ousada", description: "Responde mais perguntas sozinha. Revise o histórico com frequência." },
] as const

export const TONE_OPTIONS = [
  { value: "cordial", label: "Cordial", instruction: "cordial e simpático, próximo do cliente, sem exageros" },
  { value: "profissional", label: "Profissional", instruction: "profissional, objetivo e educado" },
  { value: "descontraido", label: "Descontraído", instruction: "leve e descontraído, mas respeitoso" },
] as const

export type AnswerTone = (typeof TONE_OPTIONS)[number]["value"]
