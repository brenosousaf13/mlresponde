/**
 * Vendas do Mercado Livre → linhas da aba Clientes (puro, testado em tests/unit/customers.test.ts).
 *
 * Dados mínimos do comprador (decisão do Breno, 2026-10-19): apelido, nome e sobrenome. E-mail, telefone, documento e
 * endereço NUNCA são lidos daqui. Do envio só saem cidade e UF (shipmentLocation).
 */

type IdLike = number | string | null | undefined

export type MlSearchOrderItem = {
  item?: {
    id?: string | null
    title?: string | null
    variation_attributes?: { name?: string | null; value_name?: string | null }[] | null
  } | null
  quantity?: number | null
  unit_price?: number | null
}

/** Venda como o ML devolve em /orders/search e /orders/{id} (só os campos que a maanu usa). */
export type MlSearchOrder = {
  id?: IdLike
  status?: string | null
  date_created?: string | null
  date_closed?: string | null
  last_updated?: string | null
  pack_id?: IdLike
  total_amount?: number | null
  paid_amount?: number | null
  currency_id?: string | null
  order_items?: MlSearchOrderItem[] | null
  shipping?: { id?: IdLike } | null
  buyer?: { id?: IdLike; nickname?: string | null; first_name?: string | null; last_name?: string | null } | null
  seller?: { id?: IdLike } | null
  mediations?: unknown[] | null
}

export type MlOrderSearchPage = {
  results?: MlSearchOrder[] | null
  paging?: { total?: number | null; offset?: number | null; limit?: number | null } | null
}

export type IngestOrderItem = {
  id: string | null
  title: string
  variation: string | null
  quantity: number
  unit_price: number | null
}

/** Formato que a função ingest_ml_orders (migração 20261019120000_clientes.sql) recebe. */
export type IngestOrder = {
  ml_order_id: number
  pack_id: number | null
  buyer_id: number
  buyer_nickname: string | null
  buyer_first_name: string | null
  buyer_last_name: string | null
  status: string
  ordered_at: string | null
  closed_at: string | null
  ml_last_updated: string | null
  total_amount: number | null
  paid_amount: number | null
  currency_id: string | null
  shipment_id: number | null
  mediations_count: number
  items: IngestOrderItem[]
}

/** Situações que contam como compra. Espelho de public.ml_order_is_purchase (mudar nos dois lugares). */
export const PURCHASE_STATUSES = ["paid", "partially_paid", "partially_refunded"] as const

export function isPurchase(status: string | null | undefined): boolean {
  return (PURCHASE_STATUSES as readonly string[]).includes(status ?? "")
}

export const MAX_ORDER_ITEMS = 10

/** Id numérico positivo do ML (número ou texto só com dígitos); qualquer outra coisa vira null. */
export function mlId(value: IdLike): number | null {
  const number =
    typeof value === "string" ? (/^\d{1,19}$/.test(value.trim()) ? Number(value.trim()) : Number.NaN) : value
  return typeof number === "number" && Number.isSafeInteger(number) && number > 0 ? number : null
}

function isoDate(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !value.trim()) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? new Date(time).toISOString() : null
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null
  const text = value.replace(/\s+/g, " ").trim()
  return text ? text.slice(0, max) : null
}

function money(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 : null
}

function itemOf(entry: MlSearchOrderItem): IngestOrderItem {
  const variation = (entry.item?.variation_attributes ?? [])
    .map((attribute) => {
      const name = cleanText(attribute?.name, 40)
      const value = cleanText(attribute?.value_name, 60)
      return name && value ? name + ": " + value : value
    })
    .filter(Boolean)
    .join(" · ")
  const quantity = typeof entry.quantity === "number" && Number.isFinite(entry.quantity) ? Math.max(0, Math.round(entry.quantity)) : 1
  return {
    id: cleanText(entry.item?.id, 30),
    title: cleanText(entry.item?.title, 120) ?? "Produto",
    variation: variation ? variation.slice(0, 100) : null,
    quantity,
    unit_price: money(entry.unit_price),
  }
}

/**
 * Nome e sobrenome do comprador. O ML às vezes repete o nome inteiro nos dois campos (visto em 2026-10-19): o sobrenome
 * repetido é descartado. Só /orders/{id} traz esses campos (a busca /orders/search manda só id e apelido).
 */
export function buyerName(first: unknown, last: unknown): { first: string | null; last: string | null } {
  const firstName = cleanText(first, 120)
  let lastName = cleanText(last, 120)
  if (firstName && lastName) {
    const a = firstName.toLocaleLowerCase("pt-BR")
    const b = lastName.toLocaleLowerCase("pt-BR")
    if (a === b || a.endsWith(" " + b)) lastName = null
  }
  return { first: firstName, last: lastName }
}

/** Uma venda do ML no formato do banco. Sem id da venda, comprador ou situação (ex.: resposta 206 sem buyer) = null. */
export function toIngestOrder(order: MlSearchOrder): IngestOrder | null {
  const orderId = mlId(order.id)
  const buyerId = mlId(order.buyer?.id)
  const status = cleanText(order.status, 40)
  if (!orderId || !buyerId || !status) return null
  const name = buyerName(order.buyer?.first_name, order.buyer?.last_name)
  return {
    ml_order_id: orderId,
    pack_id: mlId(order.pack_id),
    buyer_id: buyerId,
    buyer_nickname: cleanText(order.buyer?.nickname, 120),
    buyer_first_name: name.first,
    buyer_last_name: name.last,
    status,
    ordered_at: isoDate(order.date_created),
    closed_at: isoDate(order.date_closed),
    ml_last_updated: isoDate(order.last_updated),
    total_amount: money(order.total_amount),
    paid_amount: money(order.paid_amount),
    currency_id: cleanText(order.currency_id, 10),
    shipment_id: mlId(order.shipping?.id),
    mediations_count: Array.isArray(order.mediations) ? order.mediations.length : 0,
    items: (order.order_items ?? []).slice(0, MAX_ORDER_ITEMS).map(itemOf),
  }
}

export function toIngestOrders(orders: readonly MlSearchOrder[] | null | undefined): IngestOrder[] {
  return (orders ?? []).map(toIngestOrder).filter((order): order is IngestOrder => order !== null)
}

type MlShipmentAddress = {
  city?: { name?: string | null } | null
  state?: { id?: string | null } | null
} | null

/** Envio do ML (formato novo, header x-format-new; o formato antigo também é aceito). Só cidade e UF são lidas. */
export type MlShipmentLocation = {
  destination?: { shipping_address?: MlShipmentAddress } | null
  receiver_address?: MlShipmentAddress
}

/** "BR-MG" → "MG". Qualquer outra coisa → null. */
export function stateCode(id: string | null | undefined): string | null {
  const match = /^(?:[A-Z]{2}-)?([A-Z]{2})$/.exec((id ?? "").trim().toUpperCase())
  return match ? match[1] : null
}

/** Cidade e UF do destino do envio (o resto do endereço é ignorado de propósito). */
export function shipmentLocation(shipment: MlShipmentLocation | null | undefined): { city: string | null; state: string | null } {
  const address = shipment?.destination?.shipping_address ?? shipment?.receiver_address ?? null
  return { city: cleanText(address?.city?.name, 120), state: stateCode(address?.state?.id) }
}
