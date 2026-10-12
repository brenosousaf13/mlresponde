/** Pedido e envio de uma conversa de pós-venda: o que a IA lê e o que a tela mostra (puro, testado). */

type IdLike = number | string | null | undefined

export type MlOrderItem = {
  item?: {
    id?: string | null
    title?: string | null
    variation_attributes?: { name?: string | null; value_name?: string | null }[] | null
    seller_sku?: string | null
    warranty?: string | null
  } | null
  quantity?: number | null
  unit_price?: number | null
  currency_id?: string | null
}

export type MlOrder = {
  id?: IdLike
  status?: string | null
  date_created?: string | null
  date_closed?: string | null
  pack_id?: IdLike
  total_amount?: number | null
  paid_amount?: number | null
  currency_id?: string | null
  order_items?: MlOrderItem[] | null
  payments?: { status?: string | null; status_detail?: string | null; date_approved?: string | null }[] | null
  shipping?: { id?: IdLike } | null
  buyer?: { id?: IdLike; nickname?: string | null } | null
  seller?: { id?: IdLike } | null
  tags?: string[] | null
  cancel_detail?: { description?: string | null; requested_by?: string | null; date?: string | null } | null
  manufacturing_ending_date?: string | null
}

type MaybeDate = { date?: string | null } | null | undefined

export type MlShipment = {
  id?: IdLike
  status?: string | null
  substatus?: string | null
  tracking_number?: string | null
  tracking_method?: string | null
  logistic?: { mode?: string | null; type?: string | null } | null
  logistic_type?: string | null
  mode?: string | null
  lead_time?: {
    estimated_delivery_time?: MaybeDate
    estimated_delivery_limit?: MaybeDate
    estimated_delivery_final?: MaybeDate
    shipping_method?: { name?: string | null } | null
  } | null
  shipping_option?: {
    name?: string | null
    estimated_delivery_time?: MaybeDate
    estimated_delivery_limit?: MaybeDate
    estimated_delivery_final?: MaybeDate
  } | null
  status_history?: { date_shipped?: string | null; date_delivered?: string | null; date_not_delivered?: string | null } | null
}

export type ShipmentSnapshot = {
  id: number | null
  status: string | null
  substatus: string | null
  trackingNumber: string | null
  trackingMethod: string | null
  logisticType: string | null
  mode: string | null
  methodName: string | null
  estimatedDelivery: string | null
  estimatedDeliveryLimit: string | null
  shippedAt: string | null
  deliveredAt: string | null
}

export type OrderItemSnapshot = {
  itemId: string | null
  title: string
  quantity: number
  unitPrice: number | null
  variation: string | null
  sku: string | null
}

export type OrderSnapshot = {
  orderIds: string[]
  buyerId: number | null
  buyerNickname: string | null
  items: OrderItemSnapshot[]
  total: number | null
  currency: string
  orderedAt: string | null
  orderStatus: string | null
  paymentStatus: string | null
  cancelDetail: string | null
  tags: string[]
  manufacturingEndingDate: string | null
  shipment: ShipmentSnapshot | null
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

export function buildShipmentSnapshot(shipment: MlShipment | null | undefined): ShipmentSnapshot | null {
  if (!shipment) return null
  const lead = shipment.lead_time ?? null
  const option = shipment.shipping_option ?? null
  return {
    id: toNumber(shipment.id),
    status: shipment.status ?? null,
    substatus: shipment.substatus ?? null,
    trackingNumber: shipment.tracking_number?.trim() || null,
    trackingMethod: shipment.tracking_method?.trim() || null,
    logisticType: shipment.logistic?.type ?? shipment.logistic_type ?? null,
    mode: shipment.logistic?.mode ?? shipment.mode ?? null,
    methodName: lead?.shipping_method?.name ?? option?.name ?? null,
    estimatedDelivery: isoDate(
      lead?.estimated_delivery_time?.date ?? lead?.estimated_delivery_final?.date ?? option?.estimated_delivery_time?.date ?? option?.estimated_delivery_final?.date
    ),
    estimatedDeliveryLimit: isoDate(lead?.estimated_delivery_limit?.date ?? option?.estimated_delivery_limit?.date),
    shippedAt: isoDate(shipment.status_history?.date_shipped),
    deliveredAt: isoDate(shipment.status_history?.date_delivered),
  }
}

function variationText(item: MlOrderItem["item"]): string | null {
  const parts = (item?.variation_attributes ?? [])
    .map((attribute) => [attribute?.name, attribute?.value_name].filter(Boolean).join(": "))
    .filter(Boolean)
  return parts.length ? parts.join("; ") : null
}

/** Situação "principal" de várias vendas do mesmo pack: a mais comum entre as não canceladas. */
function mainStatus(statuses: (string | null | undefined)[]): string | null {
  const valid = statuses.filter((status): status is string => Boolean(status))
  if (!valid.length) return null
  const active = valid.filter((status) => status !== "cancelled")
  return (active.length ? active : valid)[0]
}

export function buildOrderSnapshot(orders: MlOrder[], shipment: MlShipment | null | undefined): OrderSnapshot {
  const first = orders[0] ?? null
  const items: OrderItemSnapshot[] = []
  for (const order of orders) {
    for (const orderItem of order.order_items ?? []) {
      items.push({
        itemId: orderItem.item?.id ?? null,
        title: orderItem.item?.title?.trim() || "Produto",
        quantity: orderItem.quantity && orderItem.quantity > 0 ? orderItem.quantity : 1,
        unitPrice: typeof orderItem.unit_price === "number" ? orderItem.unit_price : null,
        variation: variationText(orderItem.item),
        sku: orderItem.item?.seller_sku?.trim() || null,
      })
    }
  }
  const totals = orders.map((order) => order.total_amount).filter((value): value is number => typeof value === "number")
  const payments = orders.flatMap((order) => order.payments ?? [])
  const dates = orders.map((order) => isoDate(order.date_created ?? order.date_closed)).filter((date): date is string => Boolean(date))
  const cancel = orders.find((order) => order.cancel_detail?.description)?.cancel_detail ?? null
  return {
    orderIds: orders.map((order) => toNumber(order.id)).filter((id): id is number => id !== null).map(String),
    buyerId: toNumber(first?.buyer?.id),
    buyerNickname: first?.buyer?.nickname?.trim() || null,
    items,
    total: totals.length ? Math.round(totals.reduce((sum, value) => sum + value, 0) * 100) / 100 : null,
    currency: first?.currency_id ?? "BRL",
    orderedAt: dates.sort()[0] ?? null,
    orderStatus: mainStatus(orders.map((order) => order.status)),
    paymentStatus: mainStatus(payments.map((payment) => payment.status)),
    cancelDetail: cancel?.description?.trim() || null,
    tags: [...new Set(orders.flatMap((order) => order.tags ?? []))],
    manufacturingEndingDate: isoDate(orders.find((order) => order.manufacturing_ending_date)?.manufacturing_ending_date),
    shipment: buildShipmentSnapshot(shipment),
  }
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmado",
  payment_required: "Aguardando pagamento",
  payment_in_process: "Pagamento em análise",
  partially_paid: "Pago em parte",
  paid: "Pago",
  partially_refunded: "Reembolsado em parte",
  pending_cancel: "Cancelamento em andamento",
  cancelled: "Cancelado",
  invalid: "Inválido",
}

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  approved: "aprovado",
  pending: "pendente",
  in_process: "em análise",
  authorized: "autorizado",
  rejected: "recusado",
  cancelled: "cancelado",
  refunded: "reembolsado",
  charged_back: "estornado",
  in_mediation: "em mediação",
}

export const SHIPPING_STATUS_LABELS: Record<string, string> = {
  pending: "Envio pendente",
  handling: "Em preparação",
  ready_to_ship: "Pronto para envio",
  shipped: "A caminho",
  delivered: "Entregue",
  not_delivered: "Não entregue",
  cancelled: "Envio cancelado",
  to_be_agreed: "Envio a combinar",
}

export const SHIPPING_SUBSTATUS_LABELS: Record<string, string> = {
  ready_to_print: "etiqueta pronta para imprimir",
  printed: "etiqueta impressa",
  in_packing_list: "em separação",
  ready_for_pickup: "aguardando coleta",
  ready_for_dropoff: "aguardando postagem",
  picked_up: "coletado pela transportadora",
  dropped_off: "postado",
  in_hub: "no centro de distribuição",
  in_warehouse: "no centro de distribuição",
  in_transit: "em trânsito",
  out_for_delivery: "saiu para entrega",
  soon_deliver: "chega em breve",
  delayed: "com atraso",
  waiting_for_withdrawal: "aguardando retirada na agência",
  receiver_absent: "destinatário ausente",
  bad_address: "problema com o endereço",
  returning_to_sender: "voltando para o vendedor",
  returning_to_hub: "voltando ao centro de distribuição",
  returned: "devolvido",
  lost: "extraviado",
  damaged: "danificado",
  stolen: "roubado",
  confiscated: "retido",
  claimed_me: "em reclamação",
  fulfilled_feedback: "entregue (confirmado pelo comprador)",
  no_action_taken: "entregue",
}

export const LOGISTIC_LABELS: Record<string, string> = {
  fulfillment: "Full (o Mercado Livre armazena e envia)",
  cross_docking: "Mercado Envios com coleta",
  xd_drop_off: "Mercado Envios com postagem em ponto parceiro",
  drop_off: "Mercado Envios com postagem em agência",
  self_service: "Flex (entrega feita pela loja)",
  default: "Mercado Envios",
}

const MODE_LABELS: Record<string, string> = {
  me1: "Mercado Envios 1 (a loja contrata o envio)",
  custom: "Envio próprio da loja",
  not_specified: "Envio a combinar",
}

export function shippingLabel(status: string | null | undefined, substatus?: string | null): string | null {
  if (!status) return null
  const base = SHIPPING_STATUS_LABELS[status] ?? status
  const detail = substatus ? SHIPPING_SUBSTATUS_LABELS[substatus] : null
  return detail ? `${base} (${detail})` : base
}

/** Rótulo curto do envio para as listas: o que mais importa para o vendedor de relance. */
export function shippingChip(status: string | null | undefined, substatus?: string | null): string | null {
  if (!status) return null
  if (status === "shipped" && substatus === "out_for_delivery") return "Saiu para entrega"
  if (status === "shipped" && substatus === "delayed") return "Envio atrasado"
  if (status === "not_delivered" && substatus === "returning_to_sender") return "Voltando"
  return SHIPPING_STATUS_LABELS[status] ?? null
}

const TIME_ZONE = "America/Sao_Paulo"
const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TIME_ZONE })
const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: TIME_ZONE })

export function formatMoney(value: number | null | undefined, currency = "BRL"): string {
  if (typeof value !== "number") return "—"
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

function day(value: string) {
  return dateFormat.format(new Date(value))
}

/** Texto do pedido e do envio para a IA (só dados oficiais do ML; sem endereço nem dados pessoais). */
export function summarizeOrderForPrompt(snapshot: OrderSnapshot, now: Date = new Date()): { order: string; shipping: string } {
  const order: string[] = []
  const ids = snapshot.orderIds.length ? snapshot.orderIds.join(", ") : "não informado"
  order.push(`Venda nº ${ids}${snapshot.orderedAt ? ` — feita em ${dateTimeFormat.format(new Date(snapshot.orderedAt))}` : ""}`)
  if (snapshot.orderStatus) order.push(`Situação da venda: ${ORDER_STATUS_LABELS[snapshot.orderStatus] ?? snapshot.orderStatus}`)
  if (snapshot.paymentStatus) order.push(`Pagamento: ${PAYMENT_STATUS_LABELS[snapshot.paymentStatus] ?? snapshot.paymentStatus}`)
  if (snapshot.cancelDetail) order.push(`Motivo do cancelamento: ${snapshot.cancelDetail}`)
  if (snapshot.items.length) {
    order.push("Itens comprados:")
    for (const item of snapshot.items.slice(0, 20)) {
      const variation = item.variation ? ` (${item.variation})` : ""
      const price = item.unitPrice !== null ? ` — ${formatMoney(item.unitPrice, snapshot.currency)} cada` : ""
      order.push(`- ${item.quantity}x ${item.title}${variation}${price}${item.itemId ? ` [anúncio ${item.itemId}]` : ""}`)
    }
  }
  if (snapshot.total !== null) order.push(`Total da venda: ${formatMoney(snapshot.total, snapshot.currency)}`)
  if (snapshot.manufacturingEndingDate) order.push(`Produto sob encomenda: fabricação prevista até ${day(snapshot.manufacturingEndingDate)}`)

  const shipping: string[] = []
  const shipment = snapshot.shipment
  if (!shipment) {
    shipping.push(
      snapshot.tags.includes("no_shipping")
        ? "Venda sem envio pelo Mercado Livre (entrega a combinar com a loja)."
        : "Sem informações de envio disponíveis."
    )
  } else {
    const label = shippingLabel(shipment.status, shipment.substatus)
    shipping.push(`Situação do envio: ${label ?? "não informada"}`)
    const how = (shipment.logisticType && LOGISTIC_LABELS[shipment.logisticType]) || (shipment.mode && MODE_LABELS[shipment.mode]) || null
    if (how) shipping.push(`Forma de envio: ${how}${shipment.methodName ? ` — ${shipment.methodName}` : ""}`)
    if (shipment.trackingNumber) {
      shipping.push(`Código de rastreio: ${shipment.trackingNumber}${shipment.trackingMethod ? ` (${shipment.trackingMethod})` : ""}`)
    } else {
      shipping.push("Código de rastreio: ainda não disponível")
    }
    if (shipment.shippedAt) shipping.push(`Enviado em: ${day(shipment.shippedAt)}`)
    if (shipment.deliveredAt) shipping.push(`Entregue em: ${day(shipment.deliveredAt)}`)
    if (shipment.status !== "delivered") {
      const estimate = shipment.estimatedDeliveryLimit ?? shipment.estimatedDelivery
      if (estimate) {
        const late = new Date(estimate).getTime() < now.getTime() - 24 * 60 * 60 * 1000
        shipping.push(`Previsão de entrega informada pelo Mercado Livre: até ${day(estimate)}${late ? " (JÁ PASSOU)" : ""}`)
      } else {
        shipping.push("Previsão de entrega: não informada")
      }
    }
  }
  return { order: order.join("\n"), shipping: shipping.join("\n") }
}

/** Colunas da conversa que vêm do pedido (lista, filtros e cabeçalho da tela). */
export function conversationOrderColumns(snapshot: OrderSnapshot) {
  const firstItem = snapshot.items[0] ?? null
  const shipment = snapshot.shipment
  return {
    order_ids: snapshot.orderIds,
    buyer_id: snapshot.buyerId,
    item_id: firstItem?.itemId ?? null,
    item_title: firstItem?.title ?? null,
    items_count: snapshot.items.reduce((sum, item) => sum + item.quantity, 0),
    order_summary: snapshot,
    order_status: snapshot.orderStatus,
    order_total: snapshot.total,
    currency_id: snapshot.currency,
    ordered_at: snapshot.orderedAt,
    shipment_id: shipment?.id ?? null,
    shipping_status: shipment?.status ?? null,
    shipping_substatus: shipment?.substatus ?? null,
    tracking_number: shipment?.trackingNumber ?? null,
    logistic_type: shipment?.logisticType ?? null,
    estimated_delivery_at: shipment?.estimatedDeliveryLimit ?? shipment?.estimatedDelivery ?? null,
  }
}

/** Lê o resumo guardado na conversa (jsonb), tolerando linhas antigas ou vazias. */
export function parseOrderSnapshot(value: unknown): OrderSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const data = value as Partial<OrderSnapshot>
  if (!Array.isArray(data.items) || !Array.isArray(data.orderIds)) return null
  return {
    orderIds: data.orderIds.map(String),
    buyerId: typeof data.buyerId === "number" ? data.buyerId : null,
    buyerNickname: typeof data.buyerNickname === "string" ? data.buyerNickname : null,
    items: data.items.filter((item): item is OrderItemSnapshot => Boolean(item && typeof item === "object" && "title" in item)),
    total: typeof data.total === "number" ? data.total : null,
    currency: typeof data.currency === "string" ? data.currency : "BRL",
    orderedAt: typeof data.orderedAt === "string" ? data.orderedAt : null,
    orderStatus: typeof data.orderStatus === "string" ? data.orderStatus : null,
    paymentStatus: typeof data.paymentStatus === "string" ? data.paymentStatus : null,
    cancelDetail: typeof data.cancelDetail === "string" ? data.cancelDetail : null,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    manufacturingEndingDate: typeof data.manufacturingEndingDate === "string" ? data.manufacturingEndingDate : null,
    shipment: data.shipment && typeof data.shipment === "object" ? (data.shipment as ShipmentSnapshot) : null,
  }
}
