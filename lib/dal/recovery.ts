import "server-only"

import { followUpSummary, type FollowUpSummary } from "@/lib/recovery/follow-up"
import {
  deadlinePassed,
  findingOutcome,
  rowReviewMode,
  type FindingKind,
  type FindingOutcome,
  type ReturnPhase,
  type ReturnReview,
  type ReviewMode,
} from "@/lib/recovery/returns"
import { createClient } from "@/lib/supabase/server"
import { fetchAllPages } from "@/lib/supabase/paginate"
import {
  buildRecoveryScreenData,
  classifyQueueItem,
  sortReviewQueue,
  type RecoveryScreenData,
  type RecoveryQueueGroups,
  type QueueActionGroup,
  type QueueRecommendation,
  type RecoveredSummary,
  type ReviewQueueClassification,
  type ReviewNowSummary,
  type ReviewQueueItem,
} from "@/lib/recovery/contract"
import { suggestActionByRules, suggestInputFromRows } from "@/lib/recovery/suggest"
import { recoveryBadgeCount } from "@/lib/recovery/banner"
import { computeLeftBehind, LEFT_BEHIND_WINDOW_DAYS, type LeftBehindSummary } from "@/lib/recovery/left-behind"

export { buildRecoveryScreenData, sortReviewQueue }
export { classifyQueueItem }
export type { RecoveryQueueGroups, RecoveryScreenData, RecoveredSummary, ReviewNowSummary, ReviewQueueClassification, ReviewQueueItem }

// Leituras do Recuperador com a sessão do usuário (RLS por organização). Escrita só no servidor (lib/recovery/engine.ts).

export type ReturnFilter = "revisar" | "recuperar" | "confirmar" | "andamento" | "encerradas"

export const RETURN_FILTERS: Record<ReturnFilter, { label: string; phases: ReturnPhase[] }> = {
  revisar: { label: "Revise agora", phases: ["needs_review"] },
  recuperar: { label: "Dá pra recuperar", phases: ["needs_review"] },
  confirmar: { label: "Só confirmar", phases: ["needs_review"] },
  andamento: { label: "Em andamento", phases: ["waiting", "at_warehouse", "reviewed", "other"] },
  encerradas: { label: "Encerradas", phases: ["closed"] },
}

export function parseReturnFilter(value: unknown): ReturnFilter {
  return value === "recuperar" || value === "confirmar" || value === "andamento" || value === "encerradas" ? value : "revisar"
}

export type RecoveryTab = "visao" | "devolucoes" | "raio-x"

export function parseRecoveryTab(value: unknown): RecoveryTab {
  return value === "devolucoes" || value === "raio-x" ? value : "visao"
}

const LIST_COLUMNS =
  "id, claim_id, phase, item_title, amount, currency_id, deadline_at, claim_created_at, ml_closed_at, status_money, shipment_status, destination, review_kind, review_submitted_at, recovered_at, recovered_amount, is_cart, can_review_ok, can_review_fail, return_status, reviews, orders, order_id"

export type ReturnListRow = {
  id: string
  claim_id: number
  phase: ReturnPhase
  item_title: string | null
  amount: number | null
  currency_id: string | null
  deadline_at: string | null
  claim_created_at: string | null
  ml_closed_at: string | null
  status_money: string | null
  shipment_status: string | null
  destination: string | null
  review_kind: string | null
  review_submitted_at: string | null
  recovered_at: string | null
  recovered_amount: number | null
  is_cart: boolean
  /** O que o vendedor pode fazer agora (arrival = revisar o pacote que chegou; appeal = contestar o armazém). */
  mode: ReviewMode | null
  /** Acompanhamento da revisão que a maanu enviou (em análise, ressarcido, ML negou...); null = nada enviado. */
  follow_up: FollowUpSummary | null
  /** O prazo é uma estimativa (contestação do armazém: 60 dias; chegada sem prazo do ML: 3 dias). */
  deadline_estimated: boolean
  /** Sugestão determinada pelas regras, sem chamada de IA. */
  recommendation: QueueRecommendation | null
  /** Grupo da fila: recuperar dinheiro ou só confirmar recebimento. */
  action_group: QueueActionGroup | null
  /** Confiança da sugestão por regras. */
  confidence: ReviewQueueClassification["confidence"] | null
  /** Rótulo curto da sugestão. */
  suggestion_label: string | null
  /** Motivo curto da sugestão. */
  reason_short: string | null
  /** Valor envolvido na recuperação, quando aplicável. */
  recoverable_amount: number | null
  /** Confirmação rápida liberada pelo ML para esta linha. */
  quick_confirm_available: boolean
  /** Dados internos já lidos, usados para classificar sem novas consultas por item. */
  reviews?: unknown
  orders?: unknown
  order_id?: number | null
  can_review_ok?: boolean
  can_review_fail?: boolean
}

/** Acionável agora: precisa de revisão/contestação liberada e o prazo (real ou estimado) ainda não venceu. */
export function isActionableRow(row: ReturnListRow, now: Date): boolean {
  return row.phase === "needs_review" && row.mode !== null && !deadlinePassed(row.deadline_at, now)
}

function toListRow(row: Record<string, unknown>, classification?: ReviewQueueClassification): ReturnListRow {
  const mode =
    row.phase === "needs_review"
      ? rowReviewMode({
          can_review_ok: Boolean(row.can_review_ok),
          can_review_fail: Boolean(row.can_review_fail),
          destination: (row.destination as string | null) ?? null,
          shipment_status: (row.shipment_status as string | null) ?? null,
          return_status: (row.return_status as string | null) ?? null,
          reviews: row.reviews,
          order_id: (row.order_id as number | string | null) ?? null,
        })
      : null
  return {
    id: String(row.id),
    claim_id: Number(row.claim_id),
    phase: row.phase as ReturnPhase,
    item_title: (row.item_title as string | null) ?? null,
    amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
    currency_id: (row.currency_id as string | null) ?? null,
    deadline_at: (row.deadline_at as string | null) ?? null,
    claim_created_at: (row.claim_created_at as string | null) ?? null,
    ml_closed_at: (row.ml_closed_at as string | null) ?? null,
    status_money: (row.status_money as string | null) ?? null,
    shipment_status: (row.shipment_status as string | null) ?? null,
    destination: (row.destination as string | null) ?? null,
    review_kind: (row.review_kind as string | null) ?? null,
    review_submitted_at: (row.review_submitted_at as string | null) ?? null,
    recovered_at: (row.recovered_at as string | null) ?? null,
    recovered_amount: row.recovered_amount === null || row.recovered_amount === undefined ? null : Number(row.recovered_amount),
    is_cart: Boolean(row.is_cart),
    mode,
    deadline_estimated: mode === "appeal",
    follow_up: followUpSummary({
      phase: String(row.phase),
      review_kind: (row.review_kind as string | null) ?? null,
      review_submitted_at: (row.review_submitted_at as string | null) ?? null,
      recovered_at: (row.recovered_at as string | null) ?? null,
      recovered_amount: row.recovered_amount === null || row.recovered_amount === undefined ? null : Number(row.recovered_amount),
      currency_id: (row.currency_id as string | null) ?? null,
      reviews: row.reviews,
      order_id: (row.order_id as number | string | null) ?? null,
    }),
    recommendation: classification?.recommendation ?? null,
    action_group: classification?.actionGroup ?? null,
    confidence: classification?.confidence ?? null,
    suggestion_label: classification?.suggestionLabel ?? null,
    reason_short: classification?.reasonShort ?? null,
    recoverable_amount: classification?.recoverableAmount ?? null,
    quick_confirm_available: classification?.quickConfirmAvailable ?? false,
    reviews: row.reviews,
    orders: row.orders,
    order_id: row.order_id === null || row.order_id === undefined ? null : Number(row.order_id),
    can_review_ok: Boolean(row.can_review_ok),
    can_review_fail: Boolean(row.can_review_fail),
  }
}

type ClaimSuggestionRow = { claim_id: number; reason_detail: string | null; affects_reputation: string | null }

/** Classifica as linhas acionáveis lendo os motivos em lotes, sem consultas por item. */
async function classifyListRows(
  rows: readonly ReturnListRow[],
  scope: { mlAccountId?: string; organizationId?: string }
): Promise<ReturnListRow[]> {
  const candidates = rows.filter((row) => row.mode !== null)
  if (!candidates.length) return [...rows]
  const supabase = await createClient()
  const claims = new Map<number, ClaimSuggestionRow>()
  // Lotes pequenos evitam URLs enormes no filtro IN quando a lista tem milhares de devoluções.
  for (let index = 0; index < candidates.length; index += 300) {
    const ids = candidates.slice(index, index + 300).map((row) => row.claim_id)
    const data = await fetchAllPages((from, to) => {
      let query = supabase.from("reputation_claims").select("claim_id, reason_detail, affects_reputation").in("claim_id", ids)
      if (scope.mlAccountId) query = query.eq("ml_account_id", scope.mlAccountId)
      if (scope.organizationId) query = query.eq("organization_id", scope.organizationId)
      return query.order("id").range(from, to)
    })
    for (const claim of data) claims.set(Number(claim.claim_id), claim as ClaimSuggestionRow)
  }
  return rows.map((row) => {
    if (!row.mode) return row
    const input = suggestInputFromRows(
      {
        reviews: row.reviews,
        orders: row.orders,
        order_id: row.order_id ?? null,
        status_money: row.status_money,
        amount: row.amount,
        currency_id: row.currency_id,
        deadline_at: row.deadline_at,
        is_cart: row.is_cart,
        can_review_ok: row.can_review_ok ?? false,
        can_review_fail: row.can_review_fail ?? false,
      },
      claims.get(row.claim_id) ?? null,
      row.mode
    )
    const classification = classifyQueueItem({
      mode: row.mode,
      amount: row.amount,
      canReviewOk: row.can_review_ok ?? false,
      suggestion: suggestActionByRules(input),
    })
    return {
      ...row,
      recommendation: classification.recommendation,
      action_group: classification.actionGroup,
      confidence: classification.confidence,
      suggestion_label: classification.suggestionLabel,
      reason_short: classification.reasonShort,
      recoverable_amount: classification.recoverableAmount,
      quick_confirm_available: classification.quickConfirmAvailable,
    }
  })
}

function queueItemFromRow(row: ReturnListRow): ReviewQueueItem | null {
  if (!row.mode || !row.action_group || !row.recommendation || !row.confidence || !row.suggestion_label || !row.reason_short) return null
  return {
    id: row.id,
    claimId: row.claim_id,
    title: row.item_title,
    amount: row.amount,
    currencyId: row.currency_id,
    deadlineAt: row.deadline_at,
    deadlineEstimated: row.deadline_estimated,
    mode: row.mode,
    statusMoney: row.status_money,
    recommendation: row.recommendation,
    actionGroup: row.action_group,
    confidence: row.confidence,
    suggestionLabel: row.suggestion_label,
    reasonShort: row.reason_short,
    recoverableAmount: row.recoverable_amount,
    quickConfirmAvailable: row.quick_confirm_available,
    href: row.id,
  }
}

function groupsFromRows(rows: readonly ReturnListRow[]): RecoveryQueueGroups {
  const items = rows.map(queueItemFromRow).filter((row): row is ReviewQueueItem => Boolean(row))
  const recover = items.filter((row) => row.actionGroup === "recover")
  const confirm = items.filter((row) => row.actionGroup === "confirm_receipt")
  const next = (list: readonly ReviewQueueItem[]) => {
    const item = [...list].filter((row) => row.deadlineAt && Number.isFinite(Date.parse(row.deadlineAt))).sort((a, b) => Date.parse(a.deadlineAt as string) - Date.parse(b.deadlineAt as string))[0]
    return { nextDeadlineAt: item?.deadlineAt ?? null, nextDeadlineEstimated: item?.deadlineEstimated ?? false }
  }
  return {
    recover: { count: recover.length, amount: Math.round(recover.reduce((total, row) => total + (row.recoverableAmount ?? 0), 0) * 100) / 100, ...next(recover) },
    confirmReceipt: { count: confirm.length, ...next(confirm) },
  }
}

/** Ordena as linhas acionáveis com o mesmo critério da fila estável da nova tela. */
function sortActionableRows(rows: readonly ReturnListRow[]): ReturnListRow[] {
  const byId = new Map(rows.map((row) => [row.id, row]))
  const queue = sortReviewQueue(
    rows
      .filter((row): row is ReturnListRow & { mode: ReviewMode } => row.mode !== null)
      .map((row) => ({
        id: row.id,
        claimId: row.claim_id,
        title: row.item_title,
        amount: row.amount,
        currencyId: row.currency_id,
        deadlineAt: row.deadline_at,
        deadlineEstimated: row.deadline_estimated,
        mode: row.mode,
        statusMoney: row.status_money,
        recommendation: row.recommendation ?? "chegou_certinho",
        actionGroup: row.action_group ?? "confirm_receipt",
        confidence: row.confidence ?? "low",
        suggestionLabel: row.suggestion_label ?? "Confira a devolução",
        reasonShort: row.reason_short ?? "Confira a devolução antes de decidir.",
        recoverableAmount: row.recoverable_amount,
        quickConfirmAvailable: row.quick_confirm_available,
        href: row.id,
        claimCreatedAt: row.claim_created_at,
      }))
  )
  return queue.map((item) => byId.get(item.id)).filter((row): row is ReturnListRow => Boolean(row))
}

export type FindingRow = {
  id: string
  return_row_id: string | null
  kind: FindingKind
  outcome: FindingOutcome
  confidence: string
  amount: number | null
  currency_id: string | null
  evidence: Record<string, unknown>
  status: string
  detected_at: string
}

export type RecoveryOverview = {
  sync: { last_returns_at: string | null; last_error: string | null; last_error_at: string | null } | null
  scan: { status: string; returns_total: number; returns_done: number; completed_at: string | null } | null
  /** O Escudo já terminou a busca inicial das reclamações desta conta (o Raio-X depende dela). */
  claimsReady: boolean
  /**
   * Card "Revise agora": ações de revisão ou contestação liberadas.
   *
   * IMPORTANTE — o modelo mental correto:
   *  - actionableAmount: soma dos valores das vendas contestáveis/revisáveis AGORA. NÃO é "dinheiro retido no MP":
   *    a maioria desses claims já teve status_money=refunded (o dinheiro foi para o comprador) e a contestação
   *    é sobre cobertura/produto, não sobre retenção.
   *  - retainedAmount/retainedCount: apenas os claims contestáveis onde status_money=retained (dinheiro ainda no MP).
   *  - refundedAmount/refundedCount: contestáveis onde status_money=refunded (já saiu; contestação é sobre produto).
   *  - withoutAmount: claims sem valor lido no banco.
   *  - arrivals: quantidade de revisões de pacote que chegou (mode=arrival).
   *  - appeals: quantidade de contestações de armazém liberadas (mode=appeal).
   */
  waiting: {
    count: number
    /** Soma dos valores das vendas contestáveis/revisáveis agora. Não é sinônimo de "retido". */
    actionableAmount: number
    /** Valor retido no MP dentro deste card (status_money=retained). */
    retainedAmount: number
    retainedCount: number
    /** Valor já devolvido ao comprador dentro deste card (status_money=refunded). */
    refundedAmount: number
    refundedCount: number
    withoutAmount: number
    appeals: number
    arrivals: number
    nextDeadline: string | null
    rows: ReturnListRow[]
  }
  /**
   * Resumo do dinheiro retido no Mercado Pago (todas as fases, não só needs_review).
   *
   * retainedTotal: total de status_money=retained no banco (inclui em trânsito / at_warehouse).
   * freightAtRisk: frete reverso em risco. DataAvailable=false até a coluna return_cost ser adicionada
   *   ao schema — não exibir número inventado.
   */
  money: {
    retainedTotal: number
    freightAtRisk: { amount: number; count: number; dataAvailable: false }
  }
  /** Raio-X: contestações enviadas que o ML ainda analisa. */
  appealed: { count: number; amount: number }
  /** Raio-X: produto voltou sem condição de venda, o dinheiro ficou com o comprador e não dá mais para contestar. */
  lost: { count: number; amount: number }
  /** Resumo completo de devoluções vencidas, com os motivos e prazos estimados. */
  leftBehind?: LeftBehindSummary
  recovered: { count: number; amount: number }
  reimbursed: { count: number; amount: number }
  /** Grupos acionáveis da fila, já classificados pelas regras. */
  groups: RecoveryQueueGroups
  counts: Record<ReturnFilter, number>
}

function sum(rows: readonly { amount?: unknown; recovered_amount?: unknown }[], key: "amount" | "recovered_amount") {
  return Math.round(rows.reduce((total, row) => total + (Number(row[key]) || 0), 0) * 100) / 100
}

export async function getRecoveryOverview(accountId: string): Promise<RecoveryOverview> {
  const supabase = await createClient()
  const readAt = new Date()
  const since = new Date(readAt.getTime() - LEFT_BEHIND_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const [sync, scan, escudo, waiting, findings, recovered, retainedGlobal, andamento, encerradas, leftRows, actions] = await Promise.all([
    supabase.from("recovery_sync").select("last_returns_at, last_error, last_error_at").eq("ml_account_id", accountId).maybeSingle(),
    supabase
      .from("recovery_scans")
      .select("status, returns_total, returns_done, completed_at")
      .eq("ml_account_id", accountId)
      .maybeSingle(),
    supabase.from("reputation_sync").select("claims_backfilled_at").eq("ml_account_id", accountId).maybeSingle(),
    supabase
      .from("recovery_returns")
      .select(LIST_COLUMNS)
      .eq("ml_account_id", accountId)
      .eq("phase", "needs_review")
      .or("deadline_at.is.null,deadline_at.gt." + new Date().toISOString())
      .order("deadline_at", { ascending: true, nullsFirst: false })
      .limit(300),
    fetchAllPages((from, to) => supabase.from("recovery_findings").select("return_row_id, kind, status, amount, evidence, detected_at").eq("ml_account_id", accountId).order("id").range(from, to)),
    fetchAllPages((from, to) => supabase.from("recovery_returns").select("recovered_amount").eq("ml_account_id", accountId).not("recovered_at", "is", null).order("id").range(from, to)),
    // Total retido no MP (todas as fases) — usado no card money
    fetchAllPages((from, to) => supabase
      .from("recovery_returns")
      .select("amount")
      .eq("ml_account_id", accountId)
      .eq("status_money", "retained")
      .order("id")
      .range(from, to)),
    supabase
      .from("recovery_returns")
      .select("id", { count: "exact", head: true })
      .eq("ml_account_id", accountId)
      .in("phase", RETURN_FILTERS.andamento.phases),
    supabase
      .from("recovery_returns")
      .select("id", { count: "exact", head: true })
      .eq("ml_account_id", accountId)
      .eq("phase", "closed"),
    fetchAllPages((from, to) => supabase
      .from("recovery_returns")
      .select("id, claim_id, claim_created_at, sale_at, amount, currency_id, status_money, phase, destination, shipment_status, return_status, can_review_ok, can_review_fail, deadline_at, review_submitted_at, review_kind, recovered_at, recovered_amount, reviews")
      .eq("ml_account_id", accountId)
      // Mesma precedência de datas de computeLeftBehind; sem ambas as datas, a linha continua elegível.
      .or(`claim_created_at.gte.${since},and(claim_created_at.is.null,sale_at.gte.${since}),and(claim_created_at.is.null,sale_at.is.null)`)
      .order("id")
      .range(from, to)),
    fetchAllPages((from, to) => supabase
      .from("recovery_actions")
      .select("return_row_id, action, status, performed_at")
      .eq("ml_account_id", accountId)
      .order("id")
      .range(from, to)),
  ])
  for (const result of [sync, scan, escudo, waiting, andamento, encerradas]) if (result.error) throw result.error
  // Linha lida pela regra antiga (antes da Sessão 31) que não é revisável de verdade some na hora; a releitura corrige.
  const waitingRows = sortActionableRows(await classifyListRows(await markEstimatedArrivals(
    accountId,
    (waiting.data ?? []).map((row) => toListRow(row as Record<string, unknown>)).filter((row) => isActionableRow(row, readAt))
  ), { mlAccountId: accountId }))
  const outcomes = findings.map((row) => ({
    ...row,
    outcome: findingOutcome({ kind: row.kind as FindingKind, status: row.status, evidence: (row.evidence ?? {}) as Record<string, unknown> }),
  }))
  const appealed = outcomes.filter((row) => row.outcome === "appealed")
  const reimbursed = outcomes.filter((row) => row.outcome === "reimbursed")
  const findingsByReturn = new Map<string, { outcome: string; kind: string; status: string; evidence: Record<string, unknown> }[]>()
  for (const finding of outcomes) {
    if (!finding.return_row_id) continue
    const list = findingsByReturn.get(finding.return_row_id) ?? []
    list.push({ outcome: finding.outcome, kind: String(finding.kind), status: String(finding.status), evidence: (finding.evidence ?? {}) as Record<string, unknown> })
    findingsByReturn.set(finding.return_row_id, list)
  }
  const actionsByReturn = new Map<string, { action: string; status: string; performed_at: string | null }[]>()
  for (const action of actions) {
    const list = actionsByReturn.get(String(action.return_row_id)) ?? []
    list.push({ action: String(action.action), status: String(action.status), performed_at: action.performed_at ?? null })
    actionsByReturn.set(String(action.return_row_id), list)
  }
  const leftBehind = computeLeftBehind(
    leftRows.map((row) => ({
      ...(row as Record<string, unknown>),
      findings: findingsByReturn.get(String(row.id)) ?? [],
      actions: actionsByReturn.get(String(row.id)) ?? [],
    })),
    readAt
  )

  // Segmentação por status_money dentro do card "Revise agora"
  const waitingRetained = waitingRows.filter((row) => row.status_money === "retained")
  const waitingRefunded = waitingRows.filter((row) => row.status_money === "refunded")

  const nowTime = Date.now()
  return {
    sync: sync.data ?? null,
    scan: scan.data ?? null,
    claimsReady: Boolean(escudo.data?.claims_backfilled_at),
    waiting: {
      count: waitingRows.length,
      actionableAmount: sum(waitingRows, "amount"),
      retainedAmount: sum(waitingRetained, "amount"),
      retainedCount: waitingRetained.length,
      refundedAmount: sum(waitingRefunded, "amount"),
      refundedCount: waitingRefunded.length,
      withoutAmount: waitingRows.filter((row) => row.amount === null).length,
      appeals: waitingRows.filter((row) => row.mode === "appeal").length,
      arrivals: waitingRows.filter((row) => row.mode === "arrival").length,
      nextDeadline: waitingRows.find((row) => row.deadline_at && Date.parse(row.deadline_at) > nowTime)?.deadline_at ?? null,
      rows: waitingRows,
    },
    money: {
      retainedTotal: sum(retainedGlobal, "amount"),
      // return_cost não existe como coluna em recovery_returns ainda — placeholder honesto
      freightAtRisk: { amount: 0, count: 0, dataAvailable: false },
    },
    appealed: { count: appealed.length, amount: sum(appealed, "amount") },
    lost: { count: leftBehind.total.count, amount: leftBehind.total.amount },
    leftBehind,
    recovered: { count: recovered.length, amount: sum(recovered, "recovered_amount") },
    reimbursed: { count: reimbursed.length, amount: sum(reimbursed, "amount") },
    groups: groupsFromRows(waitingRows),
    counts: {
      revisar: waitingRows.length,
      recuperar: waitingRows.filter((row) => row.action_group === "recover").length,
      confirmar: waitingRows.filter((row) => row.action_group === "confirm_receipt").length,
      andamento: andamento.count ?? 0,
      encerradas: encerradas.count ?? 0,
    },
  }
}

export async function getReturnsTab(accountId: string, filter: ReturnFilter): Promise<ReturnListRow[]> {
  const supabase = await createClient()
  const now = new Date()
  const data = await fetchAllPages((from, to) => {
    let query = supabase.from("recovery_returns").select(LIST_COLUMNS).eq("ml_account_id", accountId).in("phase", RETURN_FILTERS[filter].phases)
    if (filter === "revisar") query = query.or("deadline_at.is.null,deadline_at.gt." + now.toISOString())
    query = filter === "revisar"
      ? query.order("deadline_at", { ascending: true, nullsFirst: false })
      : query.order("claim_created_at", { ascending: false, nullsFirst: false })
    return query.order("id").range(from, to)
  })
  const rows = data.map((row) => toListRow(row as Record<string, unknown>))
  const estimated = filter === "revisar" || filter === "recuperar" || filter === "confirmar"
    ? await markEstimatedArrivals(accountId, rows.filter((row) => isActionableRow(row, new Date())))
    : rows
  const classified = await classifyListRows(estimated, { mlAccountId: accountId })
  const filtered =
    filter === "recuperar"
      ? classified.filter((row) => row.action_group === "recover")
      : filter === "confirmar"
        ? classified.filter((row) => row.action_group === "confirm_receipt")
        : classified
  return filter === "revisar" || filter === "recuperar" || filter === "confirmar" ? sortActionableRows(filtered) : filtered
}

/**
 * Revisão do pacote que chegou sem prazo do ML: o prazo gravado é a estimativa de 3 dias. Não há coluna para isso (sem
 * migração), então confere na reclamação lida pelo Escudo se o ML mandou algum prazo (detail.due_date ou next_due_at).
 */
async function markEstimatedArrivals(accountId: string, rows: ReturnListRow[]): Promise<ReturnListRow[]> {
  const arrivals = rows.filter((row) => row.mode === "arrival")
  if (!arrivals.length) return rows
  const supabase = await createClient()
  const hasRealDue = new Set<number>()
  try {
    for (let index = 0; index < arrivals.length; index += 300) {
      const ids = arrivals.slice(index, index + 300).map((row) => row.claim_id)
      const data = await fetchAllPages((from, to) => supabase
        .from("reputation_claims")
        .select("claim_id, next_due_at, detail")
        .eq("ml_account_id", accountId)
        .in("claim_id", ids)
        .order("id")
        .range(from, to))
      for (const claim of data) {
        if (claim.next_due_at || typeof (claim.detail as { due_date?: unknown } | null)?.due_date === "string") {
          hasRealDue.add(Number(claim.claim_id))
        }
      }
    }
  } catch (error) {
    console.error("[recuperador] conferir prazo estimado:", error)
    return rows
  }
  return rows.map((row) => (row.mode === "arrival" && !hasRealDue.has(row.claim_id) ? { ...row, deadline_estimated: true } : row))
}

/** Devoluções acionáveis da organização (selo do menu): mesma regra do aviso e da lista "Revise agora". */
export async function getActionableReturnsCount(organizationId: string): Promise<number> {
  const now = new Date()
  const supabase = await createClient()
  const data = await fetchAllPages((from, to) => supabase
    .from("recovery_returns")
    .select(LIST_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("phase", "needs_review")
    .or("deadline_at.is.null,deadline_at.gt." + now.toISOString())
    .order("id")
    .range(from, to))
  const rows = data.map((row) => toListRow(row as Record<string, unknown>)).filter((row) => isActionableRow(row, now))
  const classified = await classifyListRows(rows, { organizationId })
  return recoveryBadgeCount({
    recover: {
      count: classified.filter((row) => row.action_group === "recover").length,
      amount: 0,
      nextDeadlineAt: null,
      nextDeadlineEstimated: false,
    },
    confirmReceipt: {
      count: classified.filter((row) => row.action_group === "confirm_receipt").length,
      nextDeadlineAt: null,
      nextDeadlineEstimated: false,
    },
  })
}

/** Contrato enxuto da tela do Recuperador, reunindo fila, resumos e links em uma leitura do DAL. */
export async function getRecoveryScreenData(accountId: string, opts?: { accountParam?: string }): Promise<RecoveryScreenData> {
  const overview = await getRecoveryOverview(accountId)
  const { count, error } = await (await createClient())
    .from("recovery_actions")
    .select("id", { count: "exact", head: true })
    .eq("ml_account_id", accountId)
    .eq("status", "success")
  if (error) throw error
  const nextRow = overview.waiting.rows.find((row) => row.deadline_at === overview.waiting.nextDeadline)
  return buildRecoveryScreenData({
    accountParam: opts?.accountParam,
    reviewRows: overview.waiting.rows.flatMap((row) =>
      row.mode
        ? [
            {
              id: row.id,
              claim_id: row.claim_id,
              item_title: row.item_title,
              amount: row.amount,
              currency_id: row.currency_id,
              deadline_at: row.deadline_at,
              deadline_estimated: row.deadline_estimated,
              mode: row.mode,
              status_money: row.status_money,
              claim_created_at: row.claim_created_at,
              can_review_ok: row.can_review_ok,
              classification:
                row.action_group && row.recommendation && row.confidence && row.suggestion_label && row.reason_short
                  ? {
                      recommendation: row.recommendation,
                      actionGroup: row.action_group,
                      confidence: row.confidence,
                      suggestionLabel: row.suggestion_label,
                      reasonShort: row.reason_short,
                      recoverableAmount: row.recoverable_amount,
                      quickConfirmAvailable: row.quick_confirm_available,
                    }
                  : undefined,
            },
          ]
        : []
    ),
    reviewNow: {
      count: overview.waiting.count,
      amount: overview.waiting.actionableAmount,
      nextDeadline: overview.waiting.nextDeadline,
      nextDeadlineEstimated: overview.waiting.nextDeadline ? Boolean(nextRow?.deadline_estimated) : false,
    },
    recovered: { count: overview.recovered.count, amount: overview.recovered.amount },
    hasFirstSubmission: (count ?? 0) > 0,
    leftBehind: overview.leftBehind,
  })
}

export async function getFindings(accountId: string): Promise<FindingRow[]> {
  const supabase = await createClient()
  const data = await fetchAllPages((from, to) => supabase
    .from("recovery_findings")
    .select("id, return_row_id, kind, confidence, amount, currency_id, evidence, status, detected_at")
    .eq("ml_account_id", accountId)
    .order("detected_at", { ascending: false })
    .order("id")
    .range(from, to))
  return data.map((row) => {
    const evidence = (row.evidence ?? {}) as Record<string, unknown>
    return {
      ...row,
      kind: row.kind as FindingKind,
      outcome: findingOutcome({ kind: row.kind as FindingKind, status: row.status, evidence }),
      amount: row.amount === null ? null : Number(row.amount),
      evidence,
    }
  })
}

export type ReturnDetail = {
  row: ReturnListRow & {
    ml_account_id: string
    claim_row_id: string
    return_id: number | null
    return_status: string | null
    refund_at: string | null
    can_review_ok: boolean
    can_review_fail: boolean
    order_id: number | null
    sale_at: string | null
    orders: { order_id: number | null; return_quantity: number | null; total_quantity: number | null }[]
    reviews: ReturnReview[]
    synced_at: string
  }
  claim: {
    reason_id: string | null
    reason_detail: string | null
    buyer_nickname: string | null
    status: string
    /** affected = a reclamação conta contra a reputação do vendedor (usado na sugestão de ação). */
    affects_reputation: string | null
    /** O que o ML mostra na reclamação agora (ex.: "Devolução revisada. Solicite a retirada do produto" + a explicação). */
    ml_title: string | null
    ml_description: string | null
  } | null
  account: { id: string; nickname: string }
  actions: { id: string; action: string; status: string; error: string | null; details: Record<string, unknown>; performed_at: string }[]
}

function detailText(detail: unknown, key: "title" | "description"): string | null {
  const value = detail && typeof detail === "object" ? (detail as Record<string, unknown>)[key] : null
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 400) : null
}

export async function getReturnDetail(organizationId: string, returnRowId: string): Promise<ReturnDetail | null> {
  const supabase = await createClient()
  const { data: row, error } = await supabase
    .from("recovery_returns")
    .select("*")
    .eq("id", returnRowId)
    .eq("organization_id", organizationId)
    .maybeSingle()
  if (error) throw error
  if (!row) return null
  const [claim, account, actions] = await Promise.all([
    supabase
      .from("reputation_claims")
      .select("reason_id, reason_detail, buyer_nickname, status, detail, affects_reputation")
      .eq("id", row.claim_row_id)
      .maybeSingle(),
    supabase.from("ml_accounts").select("id, nickname, ml_user_id").eq("id", row.ml_account_id).single(),
    supabase
      .from("recovery_actions")
      .select("id, action, status, error, details, performed_at")
      .eq("return_row_id", row.id)
      .order("performed_at", { ascending: false })
      .limit(20),
  ])
  if (claim.error) throw claim.error
  if (account.error) throw account.error
  if (actions.error) throw actions.error
  // O Escudo só grava o texto do motivo das reclamações que detalha: usa o de outra reclamação da loja com o mesmo código.
  let reasonDetail = claim.data?.reason_detail ?? null
  if (!reasonDetail && claim.data?.reason_id) {
    const { data: same } = await supabase
      .from("reputation_claims")
      .select("reason_detail")
      .eq("reason_id", claim.data.reason_id)
      .not("reason_detail", "is", null)
      .limit(1)
      .maybeSingle()
    reasonDetail = same?.reason_detail ?? null
  }
  const baseListRow = toListRow(row as unknown as Record<string, unknown>)
  const detailClassification = baseListRow.mode
    ? classifyQueueItem({
        mode: baseListRow.mode,
        amount: baseListRow.amount,
        canReviewOk: Boolean(row.can_review_ok),
        suggestion: suggestActionByRules(
          suggestInputFromRows(
            {
              reviews: row.reviews,
              orders: row.orders,
              order_id: row.order_id,
              status_money: row.status_money,
              amount: row.amount,
              currency_id: row.currency_id,
              deadline_at: row.deadline_at,
              is_cart: row.is_cart,
              can_review_ok: row.can_review_ok,
              can_review_fail: row.can_review_fail,
            },
            claim.data ? { reason_detail: reasonDetail, affects_reputation: claim.data.affects_reputation } : null,
            baseListRow.mode
          )
        ),
      })
    : null
  return {
    row: {
      ...baseListRow,
      recommendation: detailClassification?.recommendation ?? null,
      action_group: detailClassification?.actionGroup ?? null,
      confidence: detailClassification?.confidence ?? null,
      suggestion_label: detailClassification?.suggestionLabel ?? null,
      reason_short: detailClassification?.reasonShort ?? null,
      recoverable_amount: detailClassification?.recoverableAmount ?? null,
      quick_confirm_available: detailClassification?.quickConfirmAvailable ?? false,
      ml_account_id: row.ml_account_id,
      claim_row_id: row.claim_row_id,
      return_id: row.return_id === null ? null : Number(row.return_id),
      return_status: row.return_status,
      refund_at: row.refund_at,
      can_review_ok: row.can_review_ok,
      can_review_fail: row.can_review_fail,
      order_id: row.order_id === null ? null : Number(row.order_id),
      sale_at: row.sale_at,
      orders: Array.isArray(row.orders) ? (row.orders as ReturnDetail["row"]["orders"]) : [],
      reviews: Array.isArray(row.reviews) ? (row.reviews as unknown as ReturnReview[]) : [],
      synced_at: row.synced_at,
    },
    claim: claim.data
      ? {
          reason_id: claim.data.reason_id,
          reason_detail: reasonDetail,
          buyer_nickname: claim.data.buyer_nickname,
          status: claim.data.status,
          affects_reputation: claim.data.affects_reputation,
          ml_title: detailText(claim.data.detail, "title"),
          ml_description: detailText(claim.data.detail, "description"),
        }
      : null,
    account: { id: account.data.id, nickname: account.data.nickname || "Conta " + account.data.ml_user_id },
    actions: actions.data.map((action) => ({ ...action, details: (action.details ?? {}) as Record<string, unknown> })),
  }
}

/** Selo do menu Recuperador: devoluções esperando a revisão (alertas urgentes do Recuperador em aberto). */
export const RECOVERY_BADGE_KINDS = ["return_review_due", "return_review_closing"] as const
