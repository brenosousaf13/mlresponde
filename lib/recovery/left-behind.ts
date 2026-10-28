import {
  APPEAL_WINDOW_DAYS,
  ARRIVAL_WINDOW_DAYS,
  deadlinePassed,
  reviewDeadline,
  rowReviewMode,
  type ReturnReview,
  type ReviewMode,
} from "@/lib/recovery/returns"

const DAY_MS = 24 * 60 * 60 * 1000
const WINDOW_DAYS = 90

export type LeftBehindReason = "prazo_endereco" | "contestacao_full_nao_feita" | "sem_condicao_venda"

export type LeftBehindBucket = { count: number; amount: number; estimated: boolean }

export type LeftBehindSummary = {
  total: LeftBehindBucket
  byReason: Record<LeftBehindReason, LeftBehindBucket>
}

export type LeftBehindAction = {
  action?: string | null
  status?: string | null
  performed_at?: string | null
}

/** Campos mínimos de uma devolução usados pelo cálculo puro do dinheiro que ficou para trás. */
export type LeftBehindRow = {
  id?: string | null
  claim_id?: number | string | null
  ml_account_id?: string | null
  claim_created_at?: string | null
  sale_at?: string | null
  created_at?: string | null
  synced_at?: string | null
  amount?: number | string | null
  currency_id?: string | null
  status_money?: string | null
  phase?: string | null
  mode?: ReviewMode | null
  destination?: string | null
  shipment_status?: string | null
  return_status?: string | null
  can_review_ok?: boolean | null
  can_review_fail?: boolean | null
  deadline_at?: string | null
  deadline_estimated?: boolean | null
  next_due_at?: string | null
  detail?: { due_date?: string | null } | null
  arrived_at?: string | null
  via_triage?: boolean | null
  orders?: unknown
  order_id?: number | string | null
  is_cart?: boolean | null
  review_submitted_at?: string | null
  review_kind?: string | null
  recovered_at?: string | null
  recovered_amount?: number | string | null
  reviews?: unknown
  /** O achado antigo do Raio-X, quando o DAL já o associou à linha. */
  finding_outcome?: string | null
  finding_kind?: string | null
  finding_status?: string | null
  finding_evidence?: Record<string, unknown> | null
  findings?: readonly { outcome?: string | null; kind?: string | null; status?: string | null; evidence?: Record<string, unknown> | null }[]
  actions?: readonly LeftBehindAction[]
  recovery_actions?: readonly LeftBehindAction[]
}

const REASONS: readonly LeftBehindReason[] = ["sem_condicao_venda", "contestacao_full_nao_feita", "prazo_endereco"]

function emptyBucket(): LeftBehindBucket {
  return { count: 0, amount: 0, estimated: false }
}

function round(value: number) {
  return Math.round(value * 100) / 100
}

function isoTime(value: unknown) {
  if (typeof value !== "string") return Number.NaN
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : Number.NaN
}

function reviewsOf(row: LeftBehindRow): ReturnReview[] {
  return Array.isArray(row.reviews) ? (row.reviews as ReturnReview[]) : []
}

function actionsOf(row: LeftBehindRow): readonly LeftBehindAction[] {
  return row.actions ?? row.recovery_actions ?? []
}

function successfulAction(row: LeftBehindRow, action: string) {
  return actionsOf(row).some((item) => item.action === action && (item.status === "success" || item.status === "ok"))
}

function submitted(row: LeftBehindRow) {
  return Boolean(row.review_submitted_at) || successfulAction(row, "return_review_ok") || successfulAction(row, "return_review_fail")
}

function hasOkSubmission(row: LeftBehindRow) {
  return row.review_kind === "ok" || successfulAction(row, "return_review_ok")
}

function findingMatches(row: LeftBehindRow, predicate: (finding: { outcome?: string | null; kind?: string | null; status?: string | null; evidence?: Record<string, unknown> | null }) => boolean) {
  const current = [
    ...(row.findings ?? []),
    ...(row.finding_outcome || row.finding_kind || row.finding_status ? [{ outcome: row.finding_outcome, kind: row.finding_kind, status: row.finding_status, evidence: row.finding_evidence }] : []),
  ]
  return current.some(predicate)
}

function statusMoneyIsReimbursed(row: LeftBehindRow) {
  const value = String(row.status_money ?? "").toLowerCase()
  return value === "reimbursed" || value === "reimbursed_to_seller" || value === "seller_reimbursed" || value === "compensated"
}

function outsideWindow(row: LeftBehindRow, now: Date) {
  const reference = row.claim_created_at ?? row.sale_at ?? row.created_at ?? row.synced_at
  const time = isoTime(reference)
  return Number.isFinite(time) && time < now.getTime() - WINDOW_DAYS * DAY_MS
}

function rowMode(row: LeftBehindRow): ReviewMode | null {
  if (row.mode) return row.mode
  if (row.can_review_ok === undefined && row.can_review_fail === undefined) return null
  return rowReviewMode({
    can_review_ok: Boolean(row.can_review_ok),
    can_review_fail: Boolean(row.can_review_fail),
    destination: row.destination ?? null,
    shipment_status: row.shipment_status ?? null,
    return_status: row.return_status ?? null,
    reviews: row.reviews,
    order_id: null,
  })
}

function effectiveDeadline(row: LeftBehindRow, mode: ReviewMode | null) {
  if (row.deadline_at) return { at: row.deadline_at, estimated: Boolean(row.deadline_estimated) }
  if (!mode) return { at: null, estimated: false }
  return reviewDeadline({
    mode,
    actionDue: null,
    nextDueAt: row.next_due_at ?? null,
    detail: row.detail ?? null,
    reviews: reviewsOf(row),
    viaTriage: Boolean(row.via_triage),
    arrivedAt: row.arrived_at ?? null,
  })
}

function isUnsaleable(row: LeftBehindRow) {
  return findingMatches(row, (finding) => {
    if (finding.outcome === "expired" || finding.kind === "return_unsaleable_unreimbursed") return true
    const evidence = finding.evidence ?? {}
    return evidence.product_condition === "unsaleable" || evidence.product_condition === "discard"
  }) || reviewsOf(row).some((review) => review.product_condition === "unsaleable" || review.product_condition === "discard")
}

function reasonFor(row: LeftBehindRow, now: Date): { reason: LeftBehindReason; estimated: boolean } | null {
  if (
    outsideWindow(row, now) ||
    statusMoneyIsReimbursed(row) ||
    row.recovered_at ||
    hasOkSubmission(row) ||
    findingMatches(row, (finding) => finding.outcome === "reimbursed" || finding.kind === "return_reimbursed")
  ) return null

  // A linha antiga do Raio-X (produto sem condição de venda) tem precedência sobre os prazos.
  const mode = rowMode(row)
  const deadline = effectiveDeadline(row, mode)
  const oldFinding = findingMatches(row, (finding) => finding.outcome === "expired" || finding.kind === "return_unsaleable_unreimbursed")
  if (oldFinding || (isUnsaleable(row) && deadlinePassed(deadline.at, now))) {
    return { reason: "sem_condicao_venda", estimated: false }
  }

  if (!deadlinePassed(deadline.at, now) || submitted(row)) return null
  if (mode === "appeal") return { reason: "contestacao_full_nao_feita", estimated: deadline.estimated || !row.deadline_at }
  if (mode === "arrival" && (row.status_money === "refunded" || row.status_money === "refunded_to_buyer")) {
    return { reason: "prazo_endereco", estimated: deadline.estimated }
  }
  return null
}

/**
 * Calcula, sem consulta nem escrita, as devoluções que ficaram para trás no Raio-X dos últimos 90 dias.
 * A prioridade evita contar a mesma devolução duas vezes: sem condição de venda, contestação Full vencida e prazo do endereço.
 */
export function computeLeftBehind(rows: readonly LeftBehindRow[], now: Date): LeftBehindSummary {
  const byReason: Record<LeftBehindReason, LeftBehindBucket> = {
    prazo_endereco: emptyBucket(),
    contestacao_full_nao_feita: emptyBucket(),
    sem_condicao_venda: emptyBucket(),
  }
  const seen = new Map<string, { reason: LeftBehindReason; estimated: boolean; amount: number }>()
  for (const row of rows) {
    const result = reasonFor(row, now)
    if (!result) continue
    const key = String(row.id ?? row.claim_id ?? `${row.claim_created_at ?? ""}:${row.amount ?? ""}`)
    const parsedAmount = Number(row.amount)
    const amount = Number.isFinite(parsedAmount) ? parsedAmount : 0
    const current = seen.get(key)
    const priority = (reason: LeftBehindReason) => REASONS.indexOf(reason)
    if (current && priority(current.reason) <= priority(result.reason)) continue
    seen.set(key, { reason: result.reason, estimated: result.estimated, amount })
  }
  for (const item of seen.values()) {
    const bucket = byReason[item.reason]
    bucket.count += 1
    bucket.amount += item.amount
    bucket.estimated ||= item.estimated
  }
  for (const bucket of Object.values(byReason)) bucket.amount = round(bucket.amount)
  const total = emptyBucket()
  for (const bucket of Object.values(byReason)) {
    total.count += bucket.count
    total.amount += bucket.amount
    total.estimated ||= bucket.estimated
  }
  total.amount = round(total.amount)
  return { total, byReason }
}

/** Exportados para manter explícito no código qual janela e prazos alimentam o cálculo. */
export const LEFT_BEHIND_WINDOW_DAYS = WINDOW_DAYS
export const LEFT_BEHIND_DEADLINE_DAYS = { arrival: ARRIVAL_WINDOW_DAYS, appeal: APPEAL_WINDOW_DAYS } as const
