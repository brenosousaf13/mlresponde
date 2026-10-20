import { mlId } from "@/lib/reputation/claims"

/**
 * Recuperador: devoluções do Mercado Livre → linhas da maanu, o que o vendedor pode fazer agora (revisar a devolução que
 * chegou ou contestar a revisão do armazém), prazo, achados do Raio-X e "Recuperado pela maanu" (puro, testado em
 * tests/unit/recovery.test.ts).
 *
 * Formato e comportamento REAIS conferidos em 2026-10-20 (leituras só GET em contas de clientes, autorizadas pelo Breno;
 * a documentação está incompleta):
 *  - GET /post-purchase/v2/claims/{claim_id}/returns → { id, status, subtype, status_money, refund_at, date_closed,
 *    shipments[{ status, type ("return" | "return_from_triage"), destination{ name } }], orders[...] }. "orders" traz SÓ o
 *    pedido desta reclamação, mesmo quando a devolução (return_id) junta vários pedidos de um carrinho.
 *  - GET /post-purchase/v1/returns/{return_id}/reviews → uma revisão POR PEDIDO da devolução inteira (resource_id = pedido):
 *    em carrinho, vem também a revisão dos pedidos das outras reclamações. Cada reclamação usa só a do próprio pedido.
 *  - seller_status (documentação): pending = dentro do prazo do vendedor; claimed = o vendedor contestou e o ML analisa;
 *    failed = o representante deu razão ao VENDEDOR; success = o vendedor disse que chegou bem, não revisou a tempo ou o
 *    representante deu razão ao comprador.
 *  - Revisão no endereço do vendedor: return_review_ok/fail (às vezes "unified") aparecem em available_actions com due_date
 *    nulo; o prazo real é o detail.due_date ("Devolução para revisar até sexta-feira"), com action_responsible "respondent"
 *    ou até "complainant". Vale também com a reclamação já ENCERRADA (o ML devolveu o dinheiro no despacho).
 *  - O ML lista return_review_ok/fail também enquanto a devolução ainda está A CAMINHO do armazém (Full): aí o vendedor
 *    não tem o produto e NÃO deve revisar (o armazém revisa). Pedir revisão nesse momento faria o vendedor confirmar às
 *    cegas e perder o direito de contestar.
 *  - Contestação (apelação) da revisão do armazém: reclamação ENCERRADA (warehouse_decision, applied_coverage true,
 *    benefited complainant), revisão do pedido com stage "seller_review_pending" e seller_status "pending", e
 *    return_review_fail liberado. O ML não informa o prazo pela API; a regra publicada do Full é 60 dias depois do
 *    resultado da revisão (a maanu mostra como estimativa).
 *  - applied_coverage = true aparece mesmo quando o dinheiro foi para o comprador: NÃO significa que o vendedor foi coberto.
 * Endereços do comprador nunca são lidos daqui para frente: só o nome do destino (warehouse | seller_address).
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
  /** Situação do trecho atual do envio (o último: depois da revisão do armazém, o que vai para o vendedor). */
  shipmentStatus: string | null
  /** warehouse (armazém do ML) | seller_address (volta para o vendedor) | outro. */
  destination: string | null
  /** O produto passou pela revisão do armazém e segue para o endereço do vendedor (envio "return_from_triage"). */
  viaTriage: boolean
  orders: ReturnOrder[]
  /** Pedidos desta devolução vistos nesta reclamação (o carrinho de verdade é detectado com cartOrderIds). */
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

const SHIPMENT_TYPES = new Set(["return", "return_from_triage"])

/** Devolução lida do ML, sem endereços. null = resposta sem devolução. */
export function parseReturn(raw: MlReturn | MlReturn[] | null | undefined): ParsedReturn | null {
  const item = Array.isArray(raw) ? raw[0] : raw
  if (!item || typeof item !== "object") return null
  const shipments = Array.isArray(item.shipments) ? item.shipments : []
  // O trecho mais recente: o envio do armazém para o vendedor (return_from_triage) vem depois do envio ao armazém.
  const shipment = [...shipments].reverse().find((entry) => SHIPMENT_TYPES.has(entry?.type ?? "")) ?? shipments.at(-1) ?? null
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
    viaTriage: shipments.some((entry) => entry?.type === "return_from_triage"),
    orders,
    isCart: new Set(orders.map((order) => order.order_id).filter(Boolean)).size > 1,
  }
}

/** Revisões do armazém e do vendedor (/returns/{id}/reviews), uma por pedido (de TODOS os pedidos da devolução). */
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

/**
 * Só as revisões do pedido desta reclamação. Revisão sem pedido identificado vale para todos; sem o pedido da reclamação,
 * usa todas (devolução de um pedido só).
 */
export function ownReviews(reviews: readonly ReturnReview[], orderId: number | null | undefined): ReturnReview[] {
  if (!orderId) return [...reviews]
  return reviews.filter((review) => !review.order_id || Number(review.order_id) === Number(orderId))
}

/** Pedidos da devolução: os da reclamação, os das revisões e os das outras reclamações com o mesmo return_id. */
export function cartOrderIds(input: {
  orders: readonly { order_id: number | null }[]
  reviews: readonly ReturnReview[]
  siblingOrderIds?: readonly (number | null)[]
}): number[] {
  const ids = new Set<number>()
  for (const order of input.orders) if (order.order_id) ids.add(Number(order.order_id))
  for (const review of input.reviews) if (review.order_id) ids.add(Number(review.order_id))
  for (const id of input.siblingOrderIds ?? []) if (id) ids.add(Number(id))
  return [...ids].sort((a, b) => a - b)
}

// ---------------------------------------------------------------------------------------------- o que dá para fazer agora

export type ClaimAction = { action: string; mandatory?: boolean | null; due_date?: string | null }

/**
 * Ações de revisão que o ML lista para o vendedor (return_review_ok / return_review_fail, com ou sem "unified"), com a
 * reclamação aberta OU encerrada. Sozinhas não bastam: ver reviewMode.
 */
export function reviewAvailability(actions: readonly ClaimAction[]): { ok: boolean; fail: boolean; dueDate: string | null } {
  let ok = false
  let fail = false
  const dates: number[] = []
  for (const action of actions) {
    const name = action?.action
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

/** A revisão do armazém deste pedido espera a contestação do vendedor (stage seller_review_pending + pending). */
export function triageAwaitingSeller(reviews: readonly ReturnReview[]): ReturnReview | null {
  return reviews.find((review) => review.stage === "seller_review_pending" && review.seller_status === "pending") ?? null
}

/** O vendedor já se manifestou ou o ML já decidiu a revisão dele (claimed, failed ou success). */
export function sellerDecided(reviews: readonly ReturnReview[]): boolean {
  return reviews.some((review) => review.seller_status === "claimed" || review.seller_status === "failed" || review.seller_status === "success")
}

/** O pacote da devolução chegou ao endereço do vendedor. */
export function arrivedAtSeller(input: { destination: string | null; shipmentStatus: string | null; returnStatus: string | null }): boolean {
  return input.destination === "seller_address" && (input.shipmentStatus === "delivered" || input.returnStatus === "delivered")
}

/**
 * O que o vendedor pode fazer AGORA nesta devolução:
 *  - "arrival": o pacote chegou ao endereço dele e o ML aceita a revisão (chegou certinho / com problema);
 *  - "appeal": o armazém do ML revisou, o pedido espera a contestação e o ML aceita "chegou com problema";
 *  - null: nada (a caminho, no armazém, já revisada, prazo encerrado). Ações listadas com o pacote a caminho do armazém
 *    são ignoradas de propósito.
 */
export type ReviewMode = "arrival" | "appeal"

export function reviewMode(input: {
  hasOk: boolean
  hasFail: boolean
  destination: string | null
  shipmentStatus: string | null
  returnStatus: string | null
  reviews: readonly ReturnReview[]
}): ReviewMode | null {
  if (!input.hasOk && !input.hasFail) return null
  if (arrivedAtSeller(input) && !sellerDecided(input.reviews)) return "arrival"
  if (input.hasFail && triageAwaitingSeller(input.reviews)) return "appeal"
  return null
}

/** Mesma regra, a partir da linha gravada em recovery_returns (telas e alertas). */
export function rowReviewMode(row: {
  can_review_ok: boolean
  can_review_fail: boolean
  destination: string | null
  shipment_status: string | null
  return_status: string | null
  reviews: unknown
  order_id: number | string | null
}): ReviewMode | null {
  const reviews = Array.isArray(row.reviews) ? (row.reviews as ReturnReview[]) : []
  return reviewMode({
    hasOk: row.can_review_ok,
    hasFail: row.can_review_fail,
    destination: row.destination,
    shipmentStatus: row.shipment_status,
    returnStatus: row.return_status,
    reviews: ownReviews(reviews, row.order_id === null ? null : Number(row.order_id)),
  })
}

const DAY_MS = 24 * 60 * 60 * 1000
/** Full: o vendedor tem até 60 dias depois do resultado da revisão para contestar (regra publicada pelo ML). */
export const APPEAL_WINDOW_DAYS = 60

export type ClaimDetailLike = { due_date?: string | null; action_responsible?: string | null } | null

/**
 * Prazo do vendedor:
 *  - due_date da ação, quando o ML manda;
 *  - "arrival": o detail.due_date da reclamação (qualquer action_responsible: o ML manda "complainant" em casos reais),
 *    senão o próximo prazo obrigatório;
 *  - "appeal": o detail.due_date quando o produto foi para o endereço do vendedor depois do armazém; senão ESTIMATIVA de
 *    60 dias depois da revisão do armazém (o ML não informa pela API).
 */
export function reviewDeadline(input: {
  mode: ReviewMode | null
  actionDue: string | null
  nextDueAt: string | null
  detail: ClaimDetailLike
  reviews: readonly ReturnReview[]
  viaTriage?: boolean
}): { at: string | null; estimated: boolean } {
  if (!input.mode) return { at: null, estimated: false }
  if (input.actionDue) return { at: input.actionDue, estimated: false }
  const detailDue = isoDate(input.detail?.due_date)
  if (input.mode === "arrival") return { at: detailDue ?? input.nextDueAt ?? null, estimated: false }
  if (input.viaTriage && detailDue) return { at: detailDue, estimated: false }
  const reviewedAt = Date.parse(triageAwaitingSeller(input.reviews)?.updated_at ?? "")
  return Number.isFinite(reviewedAt)
    ? { at: new Date(reviewedAt + APPEAL_WINDOW_DAYS * DAY_MS).toISOString(), estimated: true }
    : { at: null, estimated: true }
}

/** O vendedor já revisou esta devolução (no ML ou pela maanu)? */
export function sellerReviewed(reviews: readonly ReturnReview[]): boolean {
  return reviews.some((review) => review.method === "none" && Boolean(review.seller_status) && review.seller_status !== "pending") ||
    reviews.some((review) => review.seller_status === "claimed")
}

/**
 * Fase da devolução na maanu. Reclamação encerrada com revisão ou contestação liberada continua "needs_review" (é aí que
 * mora o dinheiro); contestação enviada e ainda sem decisão do ML fica "reviewed".
 */
export function returnPhase(input: {
  claimStatus: string
  parsed: ParsedReturn | null
  mode: ReviewMode | null
  reviews: readonly ReturnReview[]
  reviewSubmitted: boolean
}): ReturnPhase {
  const decided = input.reviews.some((review) => review.seller_status === "failed" || review.seller_status === "success")
  const contested = input.reviews.some((review) => review.seller_status === "claimed")
  if (input.claimStatus !== "opened") {
    if (input.mode && !input.reviewSubmitted) return "needs_review"
    if ((input.reviewSubmitted || contested) && !decided) return "reviewed"
    return "closed"
  }
  if (!input.parsed) return "other"
  // Revisão enviada pela maanu vence: o ML às vezes ainda lista a ação por alguns minutos.
  if (input.reviewSubmitted) return "reviewed"
  if (input.mode) return "needs_review"
  if (sellerReviewed(input.reviews)) return "reviewed"
  if (input.parsed.destination === "warehouse") return "at_warehouse"
  return "waiting"
}

// ---------------------------------------------------------------------------------------------- valor

/**
 * Valor em jogo: o total da venda do pedido; em devolução parcial de um item só, preço unitário × unidades devolvidas.
 */
export function returnAmount(
  summary: { total_amount: number | null; items: { quantity: number; unit_price: number | null }[] } | null | undefined,
  order: { return_quantity: number | null; total_quantity: number | null } | null | undefined
): number | null {
  const total = summary?.total_amount ?? null
  if (total === null) return null
  const returned = order?.return_quantity ?? null
  const sold = order?.total_quantity ?? null
  const item = summary?.items.length === 1 ? summary.items[0] : null
  if (returned && sold && returned < sold && item?.unit_price) return Math.round(item.unit_price * returned * 100) / 100
  return total
}

// ---------------------------------------------------------------------------------------------- fila de leitura

const MINUTE = 60 * 1000
/** Devolução que chegou ao vendedor e espera a revisão (prazo de dias): lida de novo no ML a cada 10 minutos. */
export const NEEDS_REVIEW_REFRESH_MS = 10 * MINUTE
/** Outras devoluções abertas: a cada 30 minutos (as mudanças da reclamação chegam antes, pela busca do Escudo). */
export const OPEN_REFRESH_MS = 30 * MINUTE
/** Contestação liberada (prazo de semanas), contestação em análise e devolução encerrada ainda em trânsito: a cada hora. */
export const SLOW_REFRESH_MS = 60 * MINUTE
/** Situações finais da devolução no ML (não muda mais sozinha). */
const FINAL_RETURN_STATUSES = new Set(["delivered", "cancelled", "expired", "closed", "not_delivered", "failed"])

export type QueueClaim = { claim_id: number; status: string; ml_updated_at: string | null; ml_created_at: string | null }
export type KnownReturn = {
  claim_updated_at: string | null
  synced_at: string
  phase: string
  mode?: ReviewMode | null
  return_status?: string | null
}

/** De quanto em quanto tempo reler uma devolução já lida (null = só quando a reclamação mudar no ML). */
export function refreshInterval(claimStatus: string, row: KnownReturn): number | null {
  if (row.phase === "needs_review") return row.mode === "appeal" ? SLOW_REFRESH_MS : NEEDS_REVIEW_REFRESH_MS
  if (row.phase === "reviewed") return claimStatus === "opened" ? OPEN_REFRESH_MS : SLOW_REFRESH_MS
  if (claimStatus === "opened") return OPEN_REFRESH_MS
  if (row.return_status && !FINAL_RETURN_STATUSES.has(row.return_status)) return SLOW_REFRESH_MS
  return null
}

/**
 * Quais devoluções ler no ML agora, na ordem: nunca lidas, as que mudaram no ML, as lidas antes da regra atual
 * (rulesSince) com revisão liberada, as vencidas pelo intervalo e, por último, as demais lidas antes da regra atual. Em
 * cada grupo: revisão liberada antes, abertas antes de encerradas e as mais novas primeiro.
 */
export function returnsQueue<T extends QueueClaim & { hasReviewAction?: boolean }>(
  claims: readonly T[],
  known: ReadonlyMap<number, KnownReturn>,
  now: Date,
  rulesSince?: string | null
): T[] {
  const rulesTime = rulesSince ? Date.parse(rulesSince) : NaN
  const group = (claim: T): number | null => {
    const row = known.get(claim.claim_id)
    if (!row) return 0
    if (claim.ml_updated_at && (!row.claim_updated_at || Date.parse(claim.ml_updated_at) > Date.parse(row.claim_updated_at))) return 1
    const oldRules = Number.isFinite(rulesTime) && Date.parse(row.synced_at) < rulesTime
    if (oldRules && claim.hasReviewAction) return 2
    const interval = refreshInterval(claim.status, row)
    if (interval !== null && now.getTime() - Date.parse(row.synced_at) > interval) return 3
    return oldRules ? 4 : null
  }
  return claims
    .flatMap((claim) => {
      const value = group(claim)
      return value === null ? [] : [{ claim, value }]
    })
    .sort(
      (a, b) =>
        a.value - b.value ||
        Number(!a.claim.hasReviewAction) - Number(!b.claim.hasReviewAction) ||
        Number(a.claim.status !== "opened") - Number(b.claim.status !== "opened") ||
        (Date.parse(b.claim.ml_created_at ?? "") || 0) - (Date.parse(a.claim.ml_created_at ?? "") || 0)
    )
    .map((item) => item.claim)
}

// ---------------------------------------------------------------------------------------------- Raio-X

export type FindingKind = "return_unsaleable_unreimbursed" | "return_reimbursed"
export type FindingConfidence = "high" | "medium" | "low"
/**
 * Situação do achado (em evidence.outcome):
 *  - contestable: o ML ainda aceita a contestação (aberto, aparece em "Revise agora");
 *  - appealed: contestação enviada, o ML analisa (aberto);
 *  - expired: o dinheiro ficou com o comprador e o prazo de contestar acabou (encerrado);
 *  - appeal_lost: contestado e o ML deu razão ao comprador (encerrado);
 *  - reimbursed: o ML ressarciu o vendedor (encerrado, referência).
 */
export type FindingOutcome = "contestable" | "appealed" | "expired" | "appeal_lost" | "reimbursed"

export type FindingDraft = {
  kind: FindingKind
  dedupeKey: string
  confidence: FindingConfidence
  status: "open" | "resolved"
  outcome: FindingOutcome
  amount: number | null
  currencyId: string | null
  evidence: Record<string, string | number | boolean | null>
}

const UNSALEABLE = new Set(["unsaleable", "discard"])

export type ResolutionLike = { reason?: unknown; benefited?: unknown; applied_coverage?: unknown; date_created?: unknown } | null

function benefitedList(resolution: ResolutionLike): string[] {
  return Array.isArray(resolution?.benefited) ? resolution.benefited.filter((item): item is string => typeof item === "string") : []
}

/** O ML decidiu a favor do vendedor neste pedido (ressarcimento, produto devolvido ao comprador ou contestação ganha). */
export function sellerCompensated(reviews: readonly ReturnReview[], resolution: ResolutionLike): boolean {
  return (
    reviews.some((review) => review.benefited === "seller" || review.benefited === "both" || review.seller_status === "failed") ||
    benefitedList(resolution).includes("respondent")
  )
}

/** A revisão do armazém que tirou o produto de venda (a mais recente). */
function lossReview(reviews: readonly ReturnReview[]): ReturnReview | null {
  const losses = reviews.filter((review) => UNSALEABLE.has(review.product_condition ?? ""))
  return losses.at(-1) ?? null
}

const BUYER_REGRET = /boas condi|n[ãa]o (a |o |os |as )?quero mais|arrepend|desist|menor do que|maior do que|tamanho|n[ãa]o serviu|n[ãa]o gostei|n[ãa]o ficou bem|cor diferente do que eu|mudei de ideia/i
const BUYER_PROBLEM = /defeito|quebrad|danificad|avariad|n[ãa]o funciona|diferente do anunciado|diferente do que comprei|falta|incomplet|falsificad|usado/i
const STRONG_WAREHOUSE = new Set(["damaged", "misused", "different_product", "incomplete", "open_box", "blocked", "discard"])

/**
 * Força da contestação, para o vendedor priorizar (a decisão é sempre do ML):
 *  - high: o comprador disse que o produto chegou bem / se arrependeu e o armazém achou dano, uso, troca ou falta;
 *  - low: o armazém achou defeito de funcionamento (o ML não cobre a mesma falha que o comprador apontou) ou o comprador
 *    reclamou de defeito e o armazém confirmou o problema;
 *  - medium: o resto (ex.: embalagem original danificada).
 */
export function appealStrength(buyerReason: string | null | undefined, warehouseReason: string | null | undefined): FindingConfidence {
  const reason = buyerReason ?? ""
  if (warehouseReason === "not_working") return "low"
  if (BUYER_PROBLEM.test(reason) && !BUYER_REGRET.test(reason)) return "low"
  if (BUYER_REGRET.test(reason) && STRONG_WAREHOUSE.has(warehouseReason ?? "")) return "high"
  return "medium"
}

/**
 * Achado de uma devolução cujo produto o armazém do ML tirou de venda (sem condição de venda ou descartado), olhando só a
 * revisão do pedido desta reclamação. Produto em condição de venda, sem revisão do armazém ou devolução cancelada não geram
 * achado. applied_coverage NÃO é usado: o ML marca true mesmo quando o dinheiro foi para o comprador.
 */
export function classifyReturn(input: {
  claimId: number
  claimStatus: string
  resolution: ResolutionLike
  reviews: readonly ReturnReview[]
  mode: ReviewMode | null
  deadlineAt?: string | null
  reviewSubmittedKind?: string | null
  buyerReason?: string | null
  amount: number | null
  currencyId: string | null
  orderId: number | null
  itemTitle: string | null
  statusMoney: string | null
}): FindingDraft | null {
  const review = lossReview(input.reviews)
  if (!review) return null
  const evidence = {
    claim_id: input.claimId,
    order_id: input.orderId,
    item_title: input.itemTitle?.slice(0, 120) ?? null,
    product_condition: review.product_condition,
    product_destination: review.product_destination,
    reason_id: review.reason_id,
    benefited: review.benefited,
    seller_status: review.seller_status,
    status_money: input.statusMoney,
    buyer_reason: input.buyerReason?.slice(0, 160) ?? null,
    reviewed_at: review.updated_at,
    deadline_at: input.mode === "appeal" ? (input.deadlineAt ?? null) : null,
  }
  const base = { dedupeKey: "return:" + input.claimId, amount: input.amount, currencyId: input.currencyId }
  const make = (kind: FindingKind, outcome: FindingOutcome, status: "open" | "resolved", confidence: FindingConfidence): FindingDraft => ({
    ...base,
    kind,
    outcome,
    status,
    confidence,
    evidence: { ...evidence, outcome },
  })
  if (sellerCompensated(input.reviews, input.resolution)) return make("return_reimbursed", "reimbursed", "resolved", "high")
  const strength = appealStrength(input.buyerReason, review.reason_id)
  if (input.mode === "appeal") return make("return_unsaleable_unreimbursed", "contestable", "open", strength)
  const contested = input.reviews.some((item) => item.seller_status === "claimed")
  const submittedFail = input.reviewSubmittedKind === "fail"
  const decidedForBuyer = input.reviews.some((item) => item.seller_status === "success")
  if (contested || (submittedFail && !decidedForBuyer)) return make("return_unsaleable_unreimbursed", "appealed", "open", strength)
  if (submittedFail || (decidedForBuyer && Boolean(review.seller_reason))) {
    return make("return_unsaleable_unreimbursed", "appeal_lost", "resolved", "low")
  }
  // Ainda aberta e sem contestação liberada: o armazém pode liberar depois (a próxima leitura decide).
  if (input.claimStatus === "opened" && review.stage !== "closed" && review.stage !== "timeout") return null
  if (review.benefited === "buyer" || input.statusMoney === "refunded") {
    return make("return_unsaleable_unreimbursed", "expired", "resolved", strength)
  }
  return null
}

export function findingOutcome(finding: { kind: FindingKind; status: string; evidence: Record<string, unknown> }): FindingOutcome {
  const outcome = finding.evidence.outcome
  if (outcome === "contestable" || outcome === "appealed" || outcome === "expired" || outcome === "appeal_lost" || outcome === "reimbursed") {
    return outcome
  }
  if (finding.kind === "return_reimbursed") return "reimbursed"
  return finding.status === "open" ? "contestable" : "expired"
}

export const CONDITION_LABELS: Record<string, string> = {
  saleable: "em condição de venda",
  unsaleable: "sem condição de venda",
  discard: "descartado",
  missing: "não chegou para a revisão",
}

/** Classificação do armazém (reason_id da revisão). */
export const WAREHOUSE_REASON_LABELS: Record<string, string> = {
  accepted: "aceito",
  damaged: "danificado (produto ou embalagem original)",
  other_attribute: "outro problema (ex.: embalagem original danificada)",
  misused: "com sinais de uso",
  different_product: "diferente do enviado",
  not_working: "não funciona",
  incomplete: "incompleto",
  open_box: "embalagem aberta",
  blocked: "bloqueado",
  discard: "descartado",
  missing: "não chegou",
}

export const APPEAL_STRENGTH_LABELS: Record<FindingConfidence, { label: string; hint: string }> = {
  high: {
    label: "Argumento forte",
    hint: "O comprador disse que o produto chegou bem (ou se arrependeu) e o armazém achou dano, uso ou falta.",
  },
  medium: { label: "Vale contestar", hint: "O produto voltou sem condição de venda e o dinheiro foi para o comprador." },
  low: {
    label: "Argumento fraco",
    hint: "O problema parece ser o mesmo que o comprador relatou; o ML costuma não ressarcir nesse caso.",
  },
}

/** Texto pronto para pedir a revisão ao ML pela Ajuda (achados sem contestação pelo app). */
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
    ", a revisão do Mercado Livre avaliou o produto como " +
    condition +
    " e o valor da venda foi devolvido ao comprador, sem ressarcimento para mim. O produto foi enviado em perfeito estado e voltou sem condição de venda por responsabilidade de quem devolveu. Peço a revisão do caso e o ressarcimento do valor."
  )
}

// ---------------------------------------------------------------------------------------------- recuperado

/**
 * "Recuperado pela maanu": a maanu enviou uma revisão "chegou com problema" (ou contestação) com sucesso e, DEPOIS do
 * envio, o ML decidiu a favor do vendedor: seller_status "failed" (o representante deu razão ao vendedor), o armazém
 * marcou benefited seller/both, ou a reclamação terminou a favor dele. Revisão "chegou certinho" nunca conta.
 */
export function recoveredByMaanu(input: {
  maanuFailReview: boolean
  submittedAt?: string | null
  claimStatus: string
  reviews: readonly ReturnReview[]
  resolution: ResolutionLike
}): boolean {
  if (!input.maanuFailReview) return false
  if (input.reviews.some((review) => review.seller_status === "failed")) return true
  const submitted = Date.parse(input.submittedAt ?? "")
  const after = (value: unknown) => !Number.isFinite(submitted) || (typeof value === "string" && Date.parse(value) >= submitted)
  if (input.reviews.some((review) => (review.benefited === "seller" || review.benefited === "both") && after(review.updated_at))) return true
  return input.claimStatus !== "opened" && benefitedList(input.resolution).includes("respondent") && after(input.resolution?.date_created)
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
