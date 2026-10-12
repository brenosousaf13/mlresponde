import "server-only"

import type { MlConversationPage, MlRawMessage } from "@/lib/after-sale/conversation"
import type { MlOrder, MlShipment } from "@/lib/after-sale/order"
import { MlApiError } from "@/lib/mercadolivre/api"
import { mlFetchRaw, mlRequest } from "@/lib/mercadolivre/client"

// Mensagens pós-venda, vendas e envios. Docs: developers.mercadolivre.com.br/pt_br/mensagens-post-venda,
// /gerenciamento-de-vendas, /gerenciamento-de-envios, /mensagens-pendentes.

const MAX_PAGES = 15

function isPermanent(error: unknown) {
  return error instanceof MlApiError && error.status >= 400 && error.status < 500 && error.status !== 429
}

function conversationPath(packId: string, sellerId: number, params: Record<string, string>) {
  const query = new URLSearchParams({ tag: "post_sale", mark_as_read: "false", ...params })
  return `/messages/packs/${encodeURIComponent(packId)}/sellers/${sellerId}?${query}`
}

/**
 * Todas as páginas da conversa de uma venda, sem marcar como lida (o vendedor continua vendo como não lida no ML
 * enquanto ninguém responder). Se o ML não aceitar o tamanho de página pedido, usa o padrão dele.
 */
export async function fetchConversationPages(accountId: string, packId: string, sellerId: number): Promise<MlConversationPage[]> {
  let limit: number | null = 50
  const pages: MlConversationPage[] = []
  let offset = 0
  for (let index = 0; index < MAX_PAGES; index++) {
    const params: Record<string, string> = { offset: String(offset) }
    if (limit) params.limit = String(limit)
    let page: MlConversationPage
    try {
      page = await mlRequest<MlConversationPage>(accountId, conversationPath(packId, sellerId, params))
    } catch (error) {
      if (limit && error instanceof MlApiError && error.status === 400 && /limit/i.test(error.message)) {
        limit = null
        index--
        continue
      }
      throw error
    }
    pages.push(page)
    const received = page.messages?.length ?? 0
    const pageSize = page.paging?.limit ?? limit ?? received
    const total = page.paging?.total ?? received
    offset += received
    if (!received || offset >= total || received < pageSize) break
  }
  return pages
}

/** Detalhe de uma mensagem (usado pela notificação do tópico messages, que só traz o id da mensagem). */
export function fetchMessageDetail(accountId: string, messageId: string) {
  return mlRequest<MlRawMessage & { messages?: MlRawMessage[] | null }>(
    accountId,
    `/messages/${encodeURIComponent(messageId)}?tag=post_sale`
  )
}

/** Conversas com mensagens não lidas pelo vendedor (redundância das notificações). */
export function fetchUnreadConversations(accountId: string) {
  return mlRequest<unknown>(accountId, "/messages/unread?role=seller&tag=post_sale")
}

export function sendConversationMessage(params: {
  accountId: string
  packId: string
  sellerId: number
  toUserId: number
  text: string
  attachments?: string[]
}) {
  const body: Record<string, unknown> = {
    from: { user_id: String(params.sellerId) },
    to: { user_id: String(params.toUserId) },
    text: params.text,
  }
  if (params.attachments?.length) body.attachments = params.attachments
  return mlRequest<unknown>(
    params.accountId,
    `/messages/packs/${encodeURIComponent(params.packId)}/sellers/${params.sellerId}?tag=post_sale`,
    { method: "POST", body: JSON.stringify(body) }
  )
}

/** Envia um arquivo (JPG, PNG, PDF ou TXT, até 25 MB) e devolve o id do anexo (vale 48 h até ser usado). */
export async function uploadMessageAttachment(accountId: string, file: File, siteId: string) {
  const form = new FormData()
  form.append("file", file, file.name)
  const data = await mlRequest<{ id?: string }>(
    accountId,
    `/messages/attachments?tag=post_sale&site_id=${encodeURIComponent(siteId)}`,
    { method: "POST", body: form }
  )
  if (!data.id) throw new MlApiError("O Mercado Livre não devolveu o anexo.", 500)
  return data.id
}

/** Arquivo de um anexo da conversa (resposta bruta para repassar ao navegador). */
export function fetchMessageAttachment(accountId: string, attachmentId: string, siteId: string) {
  return mlFetchRaw(
    accountId,
    `/messages/attachments/${encodeURIComponent(attachmentId)}?tag=post_sale&site_id=${encodeURIComponent(siteId)}`
  )
}

type MlPack = { id?: number | string; orders?: { id?: number | string }[] | null; shipment?: { id?: number | string } | null }

/** Vendas de um pack. Sem pack (venda avulsa), o próprio id é o da venda. Erros passageiros sobem (a fila tenta de novo). */
export async function fetchSaleOrders(accountId: string, packId: string): Promise<{ orders: MlOrder[]; shipmentId: number | null }> {
  let orderIds: string[] = []
  let shipmentId: number | null = null
  try {
    const pack = await mlRequest<MlPack>(accountId, `/packs/${encodeURIComponent(packId)}`)
    orderIds = (pack.orders ?? []).map((order) => String(order.id ?? "")).filter((id) => /^\d+$/.test(id))
    shipmentId = Number(pack.shipment?.id) || null
  } catch (error) {
    if (!isPermanent(error)) throw error
  }
  if (!orderIds.length) orderIds = [packId]

  const orders: MlOrder[] = []
  for (const orderId of orderIds.slice(0, 10)) {
    try {
      orders.push(await mlRequest<MlOrder>(accountId, `/orders/${encodeURIComponent(orderId)}`))
    } catch (error) {
      if (!isPermanent(error)) throw error
    }
  }
  shipmentId ??= orders.map((order) => Number(order.shipping?.id) || null).find((id) => id !== null) ?? null
  return { orders, shipmentId }
}

/** Envio da venda (formato novo do ML). Complemento: qualquer falha vira null. */
export async function fetchShipment(accountId: string, shipmentId: number): Promise<MlShipment | null> {
  try {
    return await mlRequest<MlShipment>(accountId, `/shipments/${shipmentId}`, { headers: { "x-format-new": "true" } })
  } catch (error) {
    console.warn(`[ml] envio ${shipmentId}:`, error instanceof Error ? error.message : error)
    return null
  }
}

/** Apelido público do comprador (só para exibir no painel). */
export async function fetchUserNickname(accountId: string, userId: number): Promise<string | null> {
  try {
    const user = await mlRequest<{ nickname?: string }>(accountId, `/users/${userId}`)
    return user.nickname?.trim() || null
  } catch {
    return null
  }
}
