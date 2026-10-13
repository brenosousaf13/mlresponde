/** Quando o agente de pós-venda pode enviar a resposta dele sozinho (puro, testado). */

import { composeAfterSaleMessage } from "@/lib/after-sale/text"
import { containsExternalContact } from "@/lib/answers/compose"

export const AFTER_SALE_TOPICS = [
  "tracking",
  "invoice",
  "usage",
  "change_order",
  "return",
  "problem",
  "cancel",
  "thanks",
  "other",
] as const

export type AfterSaleTopic = (typeof AFTER_SALE_TOPICS)[number]

export const TOPIC_LABELS: Record<AfterSaleTopic, string> = {
  tracking: "Entrega e rastreio",
  invoice: "Nota fiscal",
  usage: "Uso do produto",
  change_order: "Mudança no pedido",
  return: "Troca ou devolução",
  problem: "Problema com o pedido",
  cancel: "Cancelamento ou reembolso",
  thanks: "Agradecimento",
  other: "Outro assunto",
}

/** Assuntos delicados: por padrão ficam com o vendedor (a loja pode deixar o agente acolher e orientar). */
export const SENSITIVE_TOPICS: readonly AfterSaleTopic[] = ["change_order", "return", "problem", "cancel"]

/** Mudança no pedido sempre depende de alguém da loja fazer algo: nunca sai sozinha. */
export const ALWAYS_REVIEW_TOPICS: readonly AfterSaleTopic[] = ["change_order"]

export function parseTopic(value: unknown): AfterSaleTopic {
  return AFTER_SALE_TOPICS.includes(value as AfterSaleTopic) ? (value as AfterSaleTopic) : "other"
}

export type SensitivePolicy = "review" | "guide"

export const SENSITIVE_POLICIES: readonly { value: SensitivePolicy; label: string; description: string }[] = [
  {
    value: "review",
    label: "Ficam para você",
    description:
      "Problemas, trocas, devoluções e cancelamentos vão para \"Para responder\" com um rascunho pronto. Mais seguro para a reputação.",
  },
  {
    value: "guide",
    label: "O agente acolhe e orienta",
    description:
      "O agente pede desculpas quando há problema e explica o caminho certo em \"Minhas compras\", seguindo as suas políticas. Nunca promete reembolso, troca ou prazo.",
  },
]

export function parseSensitivePolicy(value: unknown): SensitivePolicy {
  return value === "guide" ? "guide" : "review"
}

export const AFTER_SALE_CONFIDENCE_PRESETS = [
  {
    value: "0.85",
    label: "Cautelosa",
    description: "Só responde sozinho quando tem muita certeza. Mais conversas ficam para você.",
  },
  { value: "0.75", label: "Equilibrada", description: "Bom equilíbrio entre rapidez e segurança." },
  { value: "0.6", label: "Ousada", description: "Responde mais sozinho. Acompanhe as conversas com frequência." },
] as const

export const DEFAULT_AFTER_SALE_THRESHOLD = "0.85"

export function afterSalePresetFor(threshold: number): string {
  return (
    [...AFTER_SALE_CONFIDENCE_PRESETS].sort(
      (a, b) => Math.abs(Number(a.value) - threshold) - Math.abs(Number(b.value) - threshold)
    )[0]?.value ?? DEFAULT_AFTER_SALE_THRESHOLD
  )
}

export type AfterSaleAiResult = {
  action: "answer" | "escalate"
  answer: string
  confidence: number
  reason: string
  topic: AfterSaleTopic
}

export type AfterSaleReviewReason =
  | "ai_escalated"
  | "low_confidence"
  | "sensitive_topic"
  | "unsafe_answer"
  | "answer_too_long"
  | "auto_reply_off"
  | "account_inactive"
  | "access_blocked"
  | "plan_inactive"
  | "claim_open"
  | "send_rejected"
  | "processing_error"
  | "answers_limit"

export const AFTER_SALE_REVIEW_LABELS: Record<AfterSaleReviewReason, string> = {
  ai_escalated: "O agente preferiu deixar para você",
  low_confidence: "O agente não teve certeza suficiente",
  sensitive_topic: "Assunto delicado: fica com você",
  unsafe_answer: "A resposta citava contato externo",
  answer_too_long: "A resposta passou do limite do Mercado Livre",
  auto_reply_off: "Agente de pós-venda pausado",
  account_inactive: "Conta desativada ou desconectada",
  access_blocked: "Assinatura inativa",
  plan_inactive: "O plano atual não inclui o pós-venda",
  claim_open: "Reclamação ou mediação aberta",
  send_rejected: "O Mercado Livre recusou a mensagem",
  processing_error: "Erro ao processar",
  answers_limit: "Limite de respostas automáticas do plano atingido",
}

export type AfterSaleSettings = {
  threshold: number
  signature: string
  sensitivePolicy: SensitivePolicy
  /** Limite de caracteres do ML para esta conversa (seller_max_message_length). */
  maxLength: number
}

export type AfterSaleDecision = { kind: "send"; text: string } | { kind: "review"; reason: AfterSaleReviewReason }

export function decideAfterSale(result: AfterSaleAiResult, settings: AfterSaleSettings): AfterSaleDecision {
  const body = result.answer.trim()
  // Assunto delicado vem antes: mesmo quando a IA já escalou, o vendedor vê o motivo certo.
  if (ALWAYS_REVIEW_TOPICS.includes(result.topic)) return { kind: "review", reason: "sensitive_topic" }
  if (SENSITIVE_TOPICS.includes(result.topic) && settings.sensitivePolicy !== "guide") {
    return { kind: "review", reason: "sensitive_topic" }
  }
  if (result.action !== "answer" || !body) return { kind: "review", reason: "ai_escalated" }
  if (!(result.confidence >= settings.threshold)) return { kind: "review", reason: "low_confidence" }
  if (containsExternalContact(body)) return { kind: "review", reason: "unsafe_answer" }
  const text = composeAfterSaleMessage(body, settings.signature)
  if (!text) return { kind: "review", reason: "ai_escalated" }
  if (text.length > settings.maxLength) return { kind: "review", reason: "answer_too_long" }
  return { kind: "send", text }
}
