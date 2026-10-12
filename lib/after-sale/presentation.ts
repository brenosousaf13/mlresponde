/** Como cada conversa de pós-venda aparece no painel (puro: usado nas telas e testado). */

import { AFTER_SALE_REVIEW_LABELS, type AfterSaleReviewReason } from "@/lib/after-sale/decision"
import { TONE_STYLES } from "@/lib/questions/presentation"

export type ConversationTone = "open" | "queue" | "ai" | "manual" | "external" | "blocked" | "archived"

export function conversationTone(status: string, lastAnswerSource: string | null): ConversationTone {
  switch (status) {
    case "needs_review":
    case "failed":
      return "open"
    case "pending":
    case "processing":
      return "queue"
    case "answered":
      if (lastAnswerSource === "ai") return "ai"
      if (lastAnswerSource === "manual") return "manual"
      return "external"
    case "blocked":
      return "blocked"
    default:
      return "archived"
  }
}

type ToneStyle = { label: string; dot: string; text: string; bubble: string; soft: string }

export const CONVERSATION_TONE_STYLES: Record<ConversationTone, ToneStyle> = {
  open: TONE_STYLES.open,
  queue: { ...TONE_STYLES.queue, label: "Agente analisando" },
  ai: { ...TONE_STYLES.ai, label: "Respondida pelo agente" },
  manual: TONE_STYLES.manual,
  external: TONE_STYLES.external,
  blocked: {
    label: "Conversa fechada pelo Mercado Livre",
    dot: "bg-rose-400",
    text: "text-rose-700 dark:text-rose-400",
    bubble: "",
    soft: "bg-rose-50 border-rose-200 text-rose-950 dark:bg-rose-950/30 dark:border-rose-900 dark:text-rose-100",
  },
  archived: TONE_STYLES.archived,
}

export const CONVERSATION_TABS = {
  responder: { label: "Para responder" },
  agente: { label: "Respondidas pelo agente" },
  voce: { label: "Respondidas por você" },
  todas: { label: "Todas" },
} as const

export type ConversationTab = keyof typeof CONVERSATION_TABS

export function parseConversationTab(value: unknown): ConversationTab {
  return typeof value === "string" && value in CONVERSATION_TABS ? (value as ConversationTab) : "responder"
}

/** Filtro de status de cada aba (usado na lista e nos contadores). */
export const TAB_FILTERS: Record<ConversationTab, { statuses?: string[]; sources?: string[] }> = {
  responder: { statuses: ["needs_review", "failed"] },
  agente: { statuses: ["answered"], sources: ["ai"] },
  voce: { statuses: ["answered"], sources: ["manual", "external"] },
  todas: {},
}

/** Resumo de uma linha: rótulo colorido + prévia da última mensagem. */
export function conversationSummary(row: {
  status: string
  last_answer_source: string | null
  review_reason: string | null
  last_message_text: string | null
  last_message_from: string | null
  pending_count: number
}): { tone: ConversationTone; label: string; preview: string | null } {
  const tone = conversationTone(row.status, row.last_answer_source)
  const text = row.last_message_text?.replace(/\s+/g, " ").trim() || null
  const preview = text ? `${row.last_message_from === "seller" ? "Você: " : ""}${text}` : null
  switch (tone) {
    case "open": {
      const reason = row.review_reason ? AFTER_SALE_REVIEW_LABELS[row.review_reason as AfterSaleReviewReason] : null
      return { tone, label: reason ?? CONVERSATION_TONE_STYLES.open.label, preview }
    }
    case "ai":
      return { tone, label: "Agente", preview }
    case "manual":
      return { tone, label: "Você", preview }
    case "external":
      return { tone, label: "No Mercado Livre", preview }
    case "blocked":
      return { tone, label: "Fechada pelo ML", preview }
    default:
      return { tone, label: CONVERSATION_TONE_STYLES[tone].label, preview }
  }
}

/** Estado da caixa de entrada do pós-venda que vive na URL de /pos-venda. */
export type ConversationInboxState = {
  tab: ConversationTab
  account: string | null
  search: string
  page: number
  conversation: string | null
}

export function conversationHref(state: ConversationInboxState): string {
  const query = new URLSearchParams()
  if (state.tab !== "responder") query.set("aba", state.tab)
  if (state.account) query.set("conta", state.account)
  if (state.search) query.set("busca", state.search)
  if (state.page > 1) query.set("pagina", String(state.page))
  if (state.conversation) query.set("c", state.conversation)
  const value = query.toString()
  return value ? `/pos-venda?${value}` : "/pos-venda"
}

/**
 * Filtro `or` do PostgREST para a busca: número da venda (exato) ou texto em comprador, produto e última mensagem.
 * O texto já deve vir limpo por sanitizeSearch.
 */
export function conversationSearchFilter(search: string): string | null {
  const text = search.trim()
  if (!text) return null
  if (/^\d{6,30}$/.test(text)) return `pack_id.eq.${text},order_ids.cs.{${text}}`
  return `buyer_nickname.ilike.%${text}%,item_title.ilike.%${text}%,last_message_text.ilike.%${text}%`
}

/** Link da venda no Mercado Livre (área do vendedor). */
export function saleUrl(orderId: string | null | undefined, packId: string): string {
  return `https://www.mercadolivre.com.br/vendas/${encodeURIComponent(orderId || packId)}/detalhe`
}

/** Envio atrasado: ainda não entregue e a previsão já passou. */
export function isShippingLate(row: { shipping_status: string | null; estimated_delivery_at: string | null }, now: Date = new Date()): boolean {
  if (!row.estimated_delivery_at || !row.shipping_status) return false
  if (["delivered", "cancelled", "not_delivered"].includes(row.shipping_status)) return false
  return new Date(row.estimated_delivery_at).getTime() < now.getTime() - 24 * 60 * 60 * 1000
}
