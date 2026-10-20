import { mlId } from "@/lib/reputation/claims"

/**
 * Recuperador: devoluções do Mercado Livre → linhas da maanu, fase, prazo, achados do Raio-X e "Recuperado pela maanu"
 * (puro, testado em tests/unit/recovery.test.ts).
 *
 * Formato real conferido em 2026-10-20 (só leitura, 3 devoluções de clientes com autorização do Breno):
 *  - GET /post-purchase/v2/claims/{claim_id}/returns → { id, status, subtype, status_money, refund_at, date_closed,
 *    shipments[{ status, type, destination{ name, shipping_address } }], orders[{ order_id, item_id, return_quantity,
 *    total_quantity }] }. NÃO traz warehouse_review/seller_review (a documentação está desatualizada).
 *  - GET /post-purchase/v1/returns/{return_id}/reviews → { reviews[{ resource, resource_id, method, resource_reviews[{
 *    stage, status, product_condition, product_destination, reason_id, benefited ("buyer" | "seller"), seller_status,
 *    seller_reason }] }] }.
 *  - A revisão do vendedor aparece em available_actions da reclamação (return_review_ok / return_review_fail, às vezes com
 *    "unified" no nome) com due_date nulo; o prazo real vem do detail.due_date da reclamação quando a vez é do vendedor.
 * Endereços do comprador nunca são lidos daqui para frente: só nome do destino (warehouse | seller_address).
 */

type IdLike = number | string | null | undefined

export type MlReturn = {
  id?: IdLike
  status?: string | null
  subtype?: string | null
  status_money?: string | null
  refund_at?: string | null
  date_closed?: string | null
  shipments?: { status?: string | null; type?: string | null; destination?: { name?: string | null } | null }[] | null
  orders?: { order_id?: IdLike; item_id?: string | null; return_quantity?: unknown; total_quantity?: unknown }[] | null
}

export type MlReturnReviews = {
  reviews?:
    | {
        resource?: string | null
        resource_id?: IdLike
        method?: string | null
        resource_reviews?: Record<string, unknown>[] | null
        date_created?: string | null
        last_updated?: string | null
      }[]
    | null
}

export type ReturnOrder = { order_id: number | null; item_id: string | null; return_quantity: number | null; total_quantity: number | null }

export type ParsedReturn = {
  returnId: number | null
  status: string | null
  subtype: string | null
  statusMoney: string | null
  refundAt: string | null
  closedAt: string | null
  shipmentStatus: string | null
  /** warehouse (armazém do ML) | seller_address (volta para o vendedor) | outro. */
  destination: string | null
  orders: ReturnOrder[]
  /** Carrinho com vários pedidos: a revisão vale para o carrinho inteiro. */
  isCart: boolean
}

export type ReturnReview = {
  order_id: number | null
  method: string | null
  stage: string | null
  status: string | null
  product_condition: string | null
  product_destination: string | null
  reason_id: string | null
  benefited: string | null
  seller_status: string | null
  seller_reason: string | null
  updated_at: string | null
}

export type ReturnPhase = "waiting" | "needs_review" | "reviewed" | "at_warehouse" | "closed" | "other"

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? new Date(time).toISOString() : null
}

function quantity(value: unknown): number | null {
  const number = Number(value)
  return value !== null && value !== undefined && value !== "" && Number.isFinite(number) ? number : null
}

/** Devolução lida do ML, sem endereços. null = resposta sem devolução. */
export function parseReturn(raw: MlReturn | MlReturn[] | null | undefined): ParsedReturn | null {
  const item = Array.isArray(raw) ? raw[0] : raw
  if (!item || typeof item !== "object") return null
  const shipments = Array.isArray(item.shipments) ? item.shipments : []
  const shipment = [...shipments].reverse().find((entry) => entry?.type === "return") ?? shipments.at(-1) ?? null
  const orders = (Array.isArray(item.orders) ? item.orders : []).slice(0, 50).map((order) => ({
    order_id: mlId(order?.order_id),
    item_id: text(order?.item_id, 40),
    return_quantity: quantity(order?.return_quantity),
    total_quantity: quantity(order?.total_quantity),
  }))
  const returnId = mlId(item.id)
  if (!returnId && !text(item.status, 30)) return null
  return {
    returnId,
    status: text(item.status, 30),
    subtype: text(item.subtype, 40),
    statusMoney: text(item.status_money, 30),
    refundAt: text(item.refund_at, 30),
    closedAt: isoDate(item.date_closed),
    shipmentStatus: text(shipment?.status, 30),
    destination: text(shipment?.destination?.name, 40),
    orders,
    isCart: new Set(orders.map((order) => order.order_id).filter(Boolean)).size > 1,
  }
}

/** Revisões do armazém e do vendedor (/returns/{id}/reviews), uma por pedido. */
export function parseReturnReviews(raw: MlReturnReviews | null | undefined): ReturnReview[] {
  const reviews = Array.isArray(raw?.reviews) ? raw.reviews : []
  return reviews
    .flatMap((review) =>
      (Array.isArray(review?.resource_reviews) ? review.resource_reviews : []).map((entry) => ({
        order_id: review?.resource === "order" || !review?.resource ? mlId(review?.resource_id) : null,
        method: text(review?.method, 30),
        stage: text(entry?.stage, 30),
        status: text(entry?.status, 30),
        product_condition: text(entry?.product_condition, 30),
        product_destination: text(entry?.product_destination, 30),
        reason_id: text(entry?.reason_id, 40),
        benefited: text(entry?.benefited, 30),
        seller_status: text(entry?.seller_status, 30),
        seller_reason: text(entry?.seller_reason, 40),
        updated_at: isoDate(review?.last_updated ?? review?.date_created),
      }))
    )
    .slice(0, 50)
}

// ---------------------------------------------------------------------------------------------- revisão e prazo

export type ClaimAction = { action: string; mandatory?: boolean | null; due_date?: string | null }

/** O ML liberou a revisão do vendedor? (return_review_ok / return_review_fail, com ou sem "unified".) */
export function reviewAvailability(actions: readonly ClaimAction[], claimStatus: string): {
  ok: boolean
  fail: boolean
  dueDate: string | null
} {
  if (claimStatus !== "opened") return { ok: false, fail: false, dueDate: null }
  let ok = false
  let fail = false
  const dates: number[] = []
  for (const action of actions) {
    const name = action.action
    const isOk = name === "return_review_ok" || name === "return_review_unified_ok"
    const isFail = name === "return_review_fail" || name === "return_review_unified_fail"
    if (!isOk && !isFail) continue
    ok ||= isOk
    fail ||= isFail
    const due = action.due_date ? Date.parse(action.due_date) : NaN
    if (Number.isFinite(due)) dates.push(due)
  }
  return { ok, fail, dueDate: dates.length ? new Date(Math.min(...dates)).toISOString() : null }
}

export type ClaimDetailLike = { due_date?: string | null; action_responsible?: string | null } | null

/**
 * Prazo do vendedor para revisar: o due_date da ação (quando o ML manda), senão o próximo prazo obrigatório da reclamação,
 * senão o detail.due_date quando a vez é do vendedor ("respondent"). Nada fixo no código.
 */
export function reviewDeadline(input: {
  actionDue: string | null
  nextDueAt: string | null
  detail: ClaimDetailLike
}): string | null {
  if (input.actionDue) return input.actionDue
  if (input.nextDueAt) return input.nextDueAt
  if (input.detail?.action_responsible === "respondent") return isoDate(input.detail.due_date)
  return null
}

/** O vendedor já revisou esta devolução (no ML ou pela maanu)? */
export function sellerReviewed(reviews: readonly ReturnReview[]): boolean {
  return reviews.some((review) => review.seller_status && review.seller_status !== "pending")
}

export function returnPhase(input: {
  claimStatus: string
  parsed: ParsedReturn | null
  canReview: boolean
  reviews: readonly ReturnReview[]
  reviewSubmitted: boolean
}): ReturnPhase {
  if (input.claimStatus !== "opened") return "closed"
  if (!input.parsed) return "other"
  // Revisão enviada pela maanu vence: o ML às vezes ainda lista a ação por alguns minutos.
  if (input.reviewSubmitted) return "reviewed"
  if (input.canReview) return "needs_review"
  if (sellerReviewed(input.reviews)) return "reviewed"
  if (input.parsed.destination === "warehouse") return "at_warehouse"
  return "waiting"
}

// ---------------------------------------------------------------------------------------------- fila de leitura

const MINUTE = 60 * 1000
/** Devolução esperando a revisão do vendedor: lida de novo no ML a cada 10 minutos. */
export const NEEDS_REVIEW_REFRESH_MS = 10 * MINUTE
/** Outras devoluções abertas: a cada 30 minutos (as mudanças da reclamação chegam antes, pela busca do Escudo). */
export const OPEN_REFRESH_MS = 30 * MINUTE

export type QueueClaim = { claim_id: number; status: string; ml_updated_at: string | null; ml_created_at: string | null }
export type KnownReturn = { claim_updated_at: string | null; synced_at: string; phase: string }

/**
 * Quais devoluções ler no ML agora, na ordem: nunca lidas, depois as que mudaram no ML, depois as abertas a atualizar; em
 * cada grupo, abertas antes de encerradas e as mais novas primeiro.
 */
export function returnsQueue<T extends QueueClaim>(claims: readonly T[], known: ReadonlyMap<number, KnownReturn>, now: Date): T[] {
  const group = (claim: T): number | null => {
    const row = known.get(claim.claim_id)
    if (!row) return 0
    if (claim.ml_updated_at && (!row.claim_updated_at || Date.parse(claim.ml_updated_at) > Date.parse(row.claim_updated_at))) return 1
    if (claim.status !== "opened") return null
    const age = now.getTime() - Date.parse(row.synced_at)
    return age > (row.phase === "needs_review" ? NEEDS_REVIEW_REFRESH_MS : OPEN_REFRESH_MS) ? 2 : null
  }
  return claims
    .flatMap((claim) => {
      const value = group(claim)
      return value === null ? [] : [{ claim, value }]
    })
    .sort(
      (a, b) =>
        a.value - b.value ||
        Number(a.claim.status !== "opened") - Number(b.claim.status !== "opened") ||
        (Date.parse(b.claim.ml_created_at ?? "") || 0) - (Date.parse(a.claim.ml_created_at ?? "") || 0)
    )
    .map((item) => item.claim)
}

// ---------------------------------------------------------------------------------------------- Raio-X

export type FindingKind = "return_unsaleable_unreimbursed" | "return_reimbursed"
export type FindingConfidence = "high" | "medium" | "low"

export type FindingDraft = {
  kind: FindingKind
  dedupeKey: string
  confidence: FindingConfidence
  status: "open" | "resolved"
  amount: number | null
  currencyId: string | null
  evidence: Record<string, string | number | boolean | null>
}

const UNSALEABLE = new Set(["unsaleable", "discard"])

export type ResolutionLike = { reason?: unknown; benefited?: unknown; applied_coverage?: unknown } | null

function benefitedList(resolution: ResolutionLike): string[] {
  return Array.isArray(resolution?.benefited) ? resolution.benefited.filter((item): item is string => typeof item === "string") : []
}

/** A revisão final de cada pedido (a encerrada, quando há; senão a mais recente). */
function finalReviews(reviews: readonly ReturnReview[]): ReturnReview[] {
  const closed = reviews.filter((review) => review.stage === "closed")
  return closed.length ? closed : reviews.slice(-1)
}

/**
 * Achado de uma devolução encerrada, só quando o armazém do ML marcou o produto como sem condição de venda ou descartado:
 *  - o ML ressarciu o vendedor (benefited = seller) → "return_reimbursed" (referência, confiança alta);
 *  - o dinheiro foi para o comprador sem cobertura do ML → "return_unsaleable_unreimbursed" (dinheiro sob suspeita,
 *    confiança média: o vendedor pode pedir revisão ao ML).
 * Produto em condição de venda, devolução expirada ou cancelada não geram achado.
 */
export function classifyReturn(input: {
  claimId: number
  claimStatus: string
  resolution: ResolutionLike
  reviews: readonly ReturnReview[]
  amount: number | null
  currencyId: string | null
  orderId: number | null
  itemTitle: string | null
  statusMoney: string | null
}): FindingDraft | null {
  if (input.claimStatus === "opened") return null
  const finals = finalReviews(input.reviews).filter((review) => UNSALEABLE.has(review.product_condition ?? ""))
  if (!finals.length) return null
  const review = finals[0]
  const evidence = {
    claim_id: input.claimId,
    order_id: input.orderId,
    item_title: input.itemTitle?.slice(0, 120) ?? null,
    product_condition: review.product_condition,
    product_destination: review.product_destination,
    reason_id: review.reason_id,
    benefited: review.benefited,
    status_money: input.statusMoney,
  }
  const base = { dedupeKey: "return:" + input.claimId, amount: input.amount, currencyId: input.currencyId, evidence }
  const sellerWon = finals.some((item) => item.benefited === "seller") || benefitedList(input.resolution).includes("respondent")
  if (sellerWon) return { ...base, kind: "return_reimbursed", confidence: "high", status: "resolved" }
  if (input.resolution?.applied_coverage === true) return null
  if (finals.some((item) => item.benefited === "buyer")) {
    return { ...base, kind: "return_unsaleable_unreimbursed", confidence: "medium", status: "open" }
  }
  return null
}

export const CONDITION_LABELS: Record<string, string> = {
  saleable: "em condição de venda",
  unsaleable: "sem condição de venda",
  discard: "descartado (diferente do enviado)",
}

export const WAREHOUSE_REASON_LABELS: Record<string, string> = {
  accepted: "aceito",
  misused: "com sinais de uso",
}

/** Texto pronto para o vendedor colar no ML ao pedir a revisão de um achado (modelo fixo, sem IA). */
export function findingRequestText(finding: { kind: FindingKind; evidence: Record<string, unknown> }): string {
  const order = finding.evidence.order_id ? " da venda " + String(finding.evidence.order_id) : ""
  const item = typeof finding.evidence.item_title === "string" && finding.evidence.item_title ? " (" + finding.evidence.item_title + ")" : ""
  const condition = CONDITION_LABELS[String(finding.evidence.product_condition ?? "")] ?? "sem condição de venda"
  if (finding.kind === "return_reimbursed") {
    return "O Mercado Livre já ressarciu esta devolução" + order + item + ". Nada a fazer."
  }
  return (
    "Olá! Na devolução" +
    order +
    item +
    ", o armazém do Mercado Livre avaliou o produto como " +
    condition +
    ", mas o valor da venda foi devolvido ao comprador e eu não fui ressarcido. Peço a revisão do caso e o ressarcimento do valor, já que o produto voltou " +
    (finding.evidence.product_destination === "seller" ? "para mim" : "ao comprador ou foi descartado") +
    " sem condição de venda."
  )
}

// ---------------------------------------------------------------------------------------------- recuperado

/**
 * "Recuperado pela maanu": a maanu enviou uma revisão "chegou com problema" com sucesso e o final favoreceu o vendedor
 * (a equipe do ML deu o caso ao vendedor, o armazém marcou benefited = seller ou a reclamação terminou a favor dele).
 * Revisão "chegou certinho" nunca conta.
 */
export function recoveredByMaanu(input: {
  maanuFailReview: boolean
  claimStatus: string
  reviews: readonly ReturnReview[]
  resolution: ResolutionLike
}): boolean {
  if (!input.maanuFailReview || input.claimStatus === "opened") return false
  return (
    input.reviews.some((review) => review.seller_status === "failed" || review.benefited === "seller") ||
    benefitedList(input.resolution).includes("respondent")
  )
}

// ---------------------------------------------------------------------------------------------- textos

export const PHASE_LABELS: Record<ReturnPhase, string> = {
  waiting: "A caminho",
  needs_review: "Revise agora",
  reviewed: "Revisada",
  at_warehouse: "No armazém do ML",
  closed: "Encerrada",
  other: "Sem devolução",
}

export const STATUS_MONEY_LABELS: Record<string, string> = {
  retained: "Dinheiro retido",
  refunded: "Dinheiro devolvido ao comprador",
  available: "Dinheiro liberado para você",
}

export const SHIPMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Etiqueta pendente",
  ready_to_ship: "Pronta para envio",
  shipped: "A caminho",
  delivered: "Entregue",
  not_delivered: "Não entregue",
  cancelled: "Envio cancelado",
}

export function destinationLabel(value: string | null | undefined): string | null {
  if (value === "warehouse") return "Armazém do Mercado Livre"
  if (value === "seller_address") return "Seu endereço"
  return null
}
