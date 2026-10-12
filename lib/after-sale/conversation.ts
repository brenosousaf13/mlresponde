/** Leitura das conversas de pós-venda do Mercado Livre (puro, testado). Docs: developers.mercadolivre.com.br/pt_br/mensagens-post-venda */

import { normalizeForMatch } from "@/lib/after-sale/text"

/**
 * Agentes de mensageria do ML ("nova arquitetura", desde 02/02/2026 no Brasil e no Chile): nessas conversas as
 * mensagens do comprador chegam com o id do agente em `from` e as do vendedor devem ir com o id do agente em `to`.
 */
export const ML_MESSAGE_AGENTS: Record<string, number> = {
  MLB: 3037675074,
  MLC: 3020819166,
  MCO: 3037204123,
  MLM: 3037204279,
  MLA: 3037674934,
  MLU: 3037204685,
}

/** Sites em que o ML pede o agente como destinatário de toda mensagem do vendedor. */
const AGENT_FIRST_SITES = new Set(["MLB", "MLC"])

type IdLike = number | string | null | undefined

export type MlRawAttachment = {
  filename?: string | null
  original_filename?: string | null
  id?: string | null
  key?: string | null
  name?: string | null
  type?: string | null
  size?: number | null
}

export type MlRawMessage = {
  id?: string | null
  message_id?: string | null
  from?: { user_id?: IdLike } | null
  to?: { user_id?: IdLike } | null
  text?: string | { plain?: string | null } | null
  plain?: string | null
  status?: string | null
  message_date?: { created?: string | null; received?: string | null; available?: string | null } | null
  date_created?: string | null
  date_received?: string | null
  date?: string | null
  message_moderation?: { status?: string | null; reason?: string | null } | null
  moderation?: { status?: string | null; reason?: string | null } | null
  message_attachments?: MlRawAttachment[] | null
  attachments?: (MlRawAttachment | string)[] | null
  message_resources?: { id?: IdLike; name?: string | null }[] | null
  resource?: string | null
  resource_id?: IdLike
}

export type MlConversationStatus = {
  path?: string | null
  status?: string | null
  substatus?: string | null
  claim_id?: IdLike
  claim_ids?: IdLike[] | null
}

export type MlConversationPage = {
  paging?: { limit?: number | null; offset?: number | null; total?: number | null } | null
  conversation_status?: MlConversationStatus | null
  messages?: MlRawMessage[] | null
  seller_max_message_length?: number | null
}

export type MessageAttachment = { id: string; name: string; type: string | null; size: number | null }

export type NormalizedMessage = {
  mlId: string
  sender: "buyer" | "seller"
  fromUserId: number | null
  toUserId: number | null
  text: string
  sentAt: string
  status: string | null
  moderationStatus: string | null
  moderationReason: string | null
  attachments: MessageAttachment[]
}

export type ConversationState = {
  blocked: boolean
  substatus: string | null
  path: string | null
  claimOpen: boolean
  maxLength: number
}

function toNumber(value: IdLike): number | null {
  if (value === null || value === undefined || value === "") return null
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : null
}

function isoDate(value: string | null | undefined): string | null {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}

function messageText(raw: MlRawMessage): string {
  if (typeof raw.text === "string") return raw.text
  if (raw.text && typeof raw.text === "object" && typeof raw.text.plain === "string") return raw.text.plain
  return typeof raw.plain === "string" ? raw.plain : ""
}

function attachmentsOf(raw: MlRawMessage): MessageAttachment[] {
  const list = raw.message_attachments ?? raw.attachments ?? []
  if (!Array.isArray(list)) return []
  const result: MessageAttachment[] = []
  for (const entry of list) {
    if (typeof entry === "string") {
      if (entry.trim()) result.push({ id: entry.trim(), name: entry.trim(), type: null, size: null })
      continue
    }
    if (!entry || typeof entry !== "object") continue
    const id = (entry.filename ?? entry.id ?? entry.key ?? "").trim()
    if (!id) continue
    result.push({
      id,
      name: (entry.original_filename ?? entry.name ?? id).trim() || id,
      type: entry.type ?? null,
      size: typeof entry.size === "number" ? entry.size : null,
    })
  }
  return result.slice(0, 25)
}

/** Uma mensagem do ML no formato da plataforma. Sem id ou sem data válida: ignorada. */
export function normalizeMessage(raw: MlRawMessage, sellerId: number): NormalizedMessage | null {
  const mlId = String(raw.id ?? raw.message_id ?? "").trim()
  if (!mlId || mlId.length > 120) return null
  const sentAt = isoDate(raw.message_date?.created ?? raw.message_date?.received ?? raw.message_date?.available ?? raw.date_created ?? raw.date_received ?? raw.date)
  if (!sentAt) return null
  const fromUserId = toNumber(raw.from?.user_id)
  const moderation = raw.message_moderation ?? raw.moderation ?? null
  return {
    mlId,
    sender: fromUserId === sellerId ? "seller" : "buyer",
    fromUserId,
    toUserId: toNumber(raw.to?.user_id),
    text: messageText(raw).replace(/\r\n?/g, "\n").trim(),
    sentAt,
    status: raw.status ?? null,
    moderationStatus: moderation?.status ?? null,
    moderationReason: moderation?.reason ?? null,
    attachments: attachmentsOf(raw),
  }
}

const MEDIATION_SUBSTATUS = new Set(["blocked_by_mediation", "blocked_by_mediation_fbm"])

/** Junta as páginas da conversa: mensagens em ordem cronológica (sem repetidas) + situação da conversa. */
export function normalizeConversation(pages: MlConversationPage[], sellerId: number) {
  const byId = new Map<string, NormalizedMessage>()
  for (const page of pages) {
    for (const raw of page.messages ?? []) {
      const message = normalizeMessage(raw, sellerId)
      if (message) byId.set(message.mlId, message)
    }
  }
  const messages = [...byId.values()].sort((a, b) => a.sentAt.localeCompare(b.sentAt) || a.mlId.localeCompare(b.mlId))
  const status = pages.find((page) => page.conversation_status)?.conversation_status ?? null
  const maxLengthRaw = pages.find((page) => typeof page.seller_max_message_length === "number")?.seller_max_message_length
  const substatus = status?.substatus ?? null
  const claimIds = (status?.claim_ids ?? []).filter((id) => toNumber(id) !== null)
  const state: ConversationState = {
    blocked: status?.status === "blocked",
    substatus,
    path: status?.path ?? null,
    claimOpen: toNumber(status?.claim_id) !== null || claimIds.length > 0 || (substatus !== null && MEDIATION_SUBSTATUS.has(substatus)),
    maxLength: maxLengthRaw && maxLengthRaw > 0 ? Math.min(maxLengthRaw, 5000) : 350,
  }
  return { messages, state }
}

/** Mensagem recusada/moderada pelo ML: o destinatário não recebeu. */
export function isRejectedMessage(message: { ml_status?: string | null; moderation_status?: string | null }): boolean {
  return message.ml_status === "rejected" || message.moderation_status === "rejected"
}

/**
 * Mensagens do comprador que ainda não tiveram resposta (depois da última mensagem da loja que chegou a ele).
 * Mensagens da loja recusadas pelo ML não contam como resposta.
 */
export function pendingBuyerMessages<T extends { sender: string; ml_status?: string | null; moderation_status?: string | null }>(
  messages: T[]
): T[] {
  let lastSeller = -1
  messages.forEach((message, index) => {
    if (message.sender === "seller" && !isRejectedMessage(message)) lastSeller = index
  })
  return messages.slice(lastSeller + 1).filter((message) => message.sender === "buyer")
}

const PACK_ID = /^[0-9]{1,30}$/

/** Pack (ou venda, quando não há pack) de uma mensagem: formato novo (message_resources) ou antigo (resource_id). */
export function extractPackId(detail: unknown): string | null {
  if (!detail || typeof detail !== "object") return null
  const data = detail as { messages?: MlRawMessage[] | null } & MlRawMessage
  const candidates: MlRawMessage[] = [...(Array.isArray(data.messages) ? data.messages : []), data]
  for (const message of candidates) {
    const resources = Array.isArray(message.message_resources) ? message.message_resources : []
    const pack = resources.find((resource) => resource?.name === "packs") ?? resources.find((resource) => resource?.name === "orders")
    const fromResources = pack ? String(pack.id ?? "").trim() : ""
    if (PACK_ID.test(fromResources)) return fromResources
    if (message.resource === "orders" || message.resource === "packs") {
      const legacy = String(message.resource_id ?? "").trim()
      if (PACK_ID.test(legacy)) return legacy
    }
  }
  return null
}

/** Packs com mensagens não lidas (GET /messages/unread): "/packs/{pack}/sellers/{vendedor}". */
export function parseUnreadPacks(body: unknown): string[] {
  if (!body || typeof body !== "object") return []
  const results = (body as { results?: { resource?: string | null }[] | null }).results
  if (!Array.isArray(results)) return []
  const packs = new Set<string>()
  for (const result of results) {
    const match = typeof result?.resource === "string" ? /\/(?:packs|orders)\/(\d{1,30})(?:\/|$)/.exec(result.resource) : null
    if (match) packs.add(match[1])
  }
  return [...packs]
}

/**
 * Para quem enviar a mensagem do vendedor, em ordem de tentativa. No Brasil o ML pede o agente de mensageria;
 * se ele recusar o destinatário, o motor tenta o próximo (o comprador da venda).
 */
export function recipientCandidates(params: {
  siteId: string | null
  conversationPath: string | null
  messages: { fromUserId: number | null; toUserId: number | null }[]
  buyerId: number | null
  sellerId: number
}): number[] {
  const site = (params.siteId ?? "MLB").toUpperCase()
  const agent = ML_MESSAGE_AGENTS[site] ?? null
  const viaAgent =
    agent !== null &&
    ((params.conversationPath ?? "").includes("/conversations/") ||
      params.messages.some((message) => message.fromUserId === agent || message.toUserId === agent))
  const ordered: (number | null)[] =
    viaAgent || AGENT_FIRST_SITES.has(site) ? [agent, params.buyerId] : [params.buyerId, agent]
  return [...new Set(ordered.filter((id): id is number => id !== null && id !== params.sellerId))]
}

/** O ML recusou o destinatário (vale tentar o outro). */
export function isRecipientError(status: number, message: string): boolean {
  return (status === 400 || status === 403) && /receiver|to\.user_id|invalid 'to'|does not belong|destinat/i.test(message)
}

/** O ML não deixa enviar nesta conversa agora (bloqueio, mediação, Full ainda não entregue...). */
export function isBlockedSendError(status: number, message: string): boolean {
  return status === 403 && /blocked|mediation|fulfillment|not been yet delivered|forbidden/i.test(message)
}

export function isTooLongError(status: number, message: string): boolean {
  return status === 400 && /too long|max characters|limit_exceeded|caracteres/i.test(message)
}

/** Id e situação da mensagem criada (resposta do POST; formatos antigo e novo). */
export function postedMessageInfo(body: unknown): { id: string | null; status: string | null } {
  if (!body || typeof body !== "object") return { id: null, status: null }
  const data = body as MlRawMessage & { messages?: MlRawMessage[] | null }
  const message = Array.isArray(data.messages) && data.messages[0] ? data.messages[0] : data
  const id = String(message.id ?? message.message_id ?? "").trim()
  return { id: id && id.length <= 120 ? id : null, status: message.status ?? null }
}

/** Procura, entre as mensagens que enviamos e ainda não têm id do ML, a que corresponde a esta. */
export function matchLocalMessage<T extends { text: string; sent_at: string }>(
  locals: T[],
  message: { text: string; sentAt: string },
  windowMs = 30 * 60 * 1000
): T | null {
  const target = normalizeForMatch(message.text)
  if (!target) return null
  const time = new Date(message.sentAt).getTime()
  return (
    locals.find(
      (local) => normalizeForMatch(local.text) === target && Math.abs(new Date(local.sent_at).getTime() - time) <= windowMs
    ) ?? null
  )
}

/** Por que o ML bloqueou a conversa, em linguagem do vendedor. */
export const BLOCK_REASON_LABELS: Record<string, string> = {
  blocked_by_time: "Passaram 30 dias desde a última mensagem; só reabre se o comprador escrever.",
  blocked_by_buyer: "O comprador bloqueou as mensagens.",
  blocked_by_mediation: "Há uma mediação em andamento. Responda pela reclamação no Mercado Livre.",
  blocked_by_mediation_fbm: "Há uma mediação em andamento (Full). Responda pela reclamação no Mercado Livre.",
  blocked_by_fulfillment: "Venda Full: as mensagens liberam quando o pacote for entregue.",
  blocked_by_payment: "O pagamento ainda não foi confirmado.",
  blocked_by_cancelled_order: "A venda foi cancelada.",
  blocked_by_cancelled_order_by_fraud: "A venda foi cancelada por comportamento irregular.",
  blocked_by_cancelled_order_hidden: "A compra não foi processada e foi cancelada.",
  blocked_by_conversation_expired: "Passaram 18 meses desde a compra.",
  blocked_by_refund: "Houve reembolso; só reabre se o comprador escrever.",
  blocked_by_claim_change_open: "Há uma troca em andamento para esta venda.",
  blocked_by_claim_change_closed: "Há uma troca associada a esta venda.",
  blocked_by_deactivated_account: "O comprador ou o vendedor excluiu a conta.",
  blocked_by_restrictions: "Há uma restrição na conta do comprador ou do vendedor.",
  blocked_by_message_pending_review: "A conversa está em revisão pelo Mercado Livre.",
  blocked_by_ai_assistant: "Venda Full atendida pelo assistente de IA do Mercado Livre.",
  blocked_by_ai_assistant_expired: "A conversa com o assistente do Mercado Livre expirou.",
  blocked_by_ai_assistant_contact_closed: "O assistente do Mercado Livre encerrou a consulta.",
  block_by_ai_assistant_initiated_by_seller_expired: "A conversa iniciada pelo vendedor expirou.",
  blocked_by_resale: "A venda tem produto de revenda.",
  blocked_by_proximity_groceries: "Compra de supermercado com entrega imediata.",
  blocked_by_return_to_buyer_fulfillment: "Devolução do Full recusada e reenviada ao comprador.",
  blocked_by_conversation_initiated_by_seller: "Compra de supermercado iniciada pelo vendedor.",
  blocked_by_conversation_initiated_by_seller_limited: "Use um motivo de contato do Mercado Livre para escrever.",
  blocked_by_conversation_use_message_api: "O comprador já iniciou a conversa.",
}

export function blockReasonLabel(substatus: string | null | undefined): string {
  if (!substatus) return "O Mercado Livre fechou esta conversa para novas mensagens."
  return BLOCK_REASON_LABELS[substatus] ?? "O Mercado Livre fechou esta conversa para novas mensagens."
}
