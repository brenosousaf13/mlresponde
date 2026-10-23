import "server-only"

import {
  findingOutcome,
  rowReviewMode,
  type FindingKind,
  type FindingOutcome,
  type ReturnPhase,
  type ReturnReview,
  type ReviewMode,
} from "@/lib/recovery/returns"
import { createClient } from "@/lib/supabase/server"

// Leituras do Recuperador com a sessão do usuário (RLS por organização). Escrita só no servidor (lib/recovery/engine.ts).

export type ReturnFilter = "revisar" | "andamento" | "encerradas"

export const RETURN_FILTERS: Record<ReturnFilter, { label: string; phases: ReturnPhase[] }> = {
  revisar: { label: "Revise agora", phases: ["needs_review"] },
  andamento: { label: "Em andamento", phases: ["waiting", "at_warehouse", "reviewed", "other"] },
  encerradas: { label: "Encerradas", phases: ["closed"] },
}

export function parseReturnFilter(value: unknown): ReturnFilter {
  return value === "andamento" || value === "encerradas" ? value : "revisar"
}

export type RecoveryTab = "visao" | "devolucoes" | "raio-x"

export function parseRecoveryTab(value: unknown): RecoveryTab {
  return value === "devolucoes" || value === "raio-x" ? value : "visao"
}

const LIST_COLUMNS =
  "id, claim_id, phase, item_title, amount, currency_id, deadline_at, claim_created_at, ml_closed_at, status_money, shipment_status, destination, review_kind, review_submitted_at, recovered_at, recovered_amount, is_cart, can_review_ok, can_review_fail, return_status, reviews, order_id"

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
}

function toListRow(row: Record<string, unknown>): ReturnListRow {
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
  }
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
  recovered: { count: number; amount: number }
  reimbursed: { count: number; amount: number }
  counts: Record<ReturnFilter, number>
}

function sum(rows: readonly { amount?: unknown; recovered_amount?: unknown }[], key: "amount" | "recovered_amount") {
  return Math.round(rows.reduce((total, row) => total + (Number(row[key]) || 0), 0) * 100) / 100
}

export async function getRecoveryOverview(accountId: string): Promise<RecoveryOverview> {
  const supabase = await createClient()
  const [sync, scan, escudo, waiting, findings, recovered, retainedGlobal, andamento, encerradas] = await Promise.all([
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
      .order("deadline_at", { ascending: true, nullsFirst: false })
      .limit(300),
    supabase.from("recovery_findings").select("kind, status, amount, evidence").eq("ml_account_id", accountId).limit(5000),
    supabase.from("recovery_returns").select("recovered_amount").eq("ml_account_id", accountId).not("recovered_at", "is", null).limit(5000),
    // Total retido no MP (todas as fases) — usado no card money
    supabase
      .from("recovery_returns")
      .select("amount")
      .eq("ml_account_id", accountId)
      .eq("status_money", "retained")
      .limit(5000),
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
  ])
  for (const result of [sync, scan, escudo, waiting, findings, recovered, retainedGlobal, andamento, encerradas]) if (result.error) throw result.error
  // Linha lida pela regra antiga (antes da Sessão 31) que não é revisável de verdade some na hora; a releitura corrige.
  const waitingRows = (waiting.data ?? []).map((row) => toListRow(row as Record<string, unknown>)).filter((row) => row.mode !== null)
  const outcomes = (findings.data ?? []).map((row) => ({
    ...row,
    outcome: findingOutcome({ kind: row.kind as FindingKind, status: row.status, evidence: (row.evidence ?? {}) as Record<string, unknown> }),
  }))
  const appealed = outcomes.filter((row) => row.outcome === "appealed")
  const lost = outcomes.filter((row) => row.outcome === "expired")
  const reimbursed = outcomes.filter((row) => row.outcome === "reimbursed")

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
      retainedTotal: sum(retainedGlobal.data ?? [], "amount"),
      // return_cost não existe como coluna em recovery_returns ainda — placeholder honesto
      freightAtRisk: { amount: 0, count: 0, dataAvailable: false },
    },
    appealed: { count: appealed.length, amount: sum(appealed, "amount") },
    lost: { count: lost.length, amount: sum(lost, "amount") },
    recovered: { count: recovered.data?.length ?? 0, amount: sum(recovered.data ?? [], "recovered_amount") },
    reimbursed: { count: reimbursed.length, amount: sum(reimbursed, "amount") },
    counts: { revisar: waitingRows.length, andamento: andamento.count ?? 0, encerradas: encerradas.count ?? 0 },
  }
}

export async function getReturnsTab(accountId: string, filter: ReturnFilter): Promise<ReturnListRow[]> {
  const supabase = await createClient()
  let query = supabase.from("recovery_returns").select(LIST_COLUMNS).eq("ml_account_id", accountId).in("phase", RETURN_FILTERS[filter].phases)
  query =
    filter === "revisar"
      ? query.order("deadline_at", { ascending: true, nullsFirst: false })
      : query.order("claim_created_at", { ascending: false, nullsFirst: false })
  const { data, error } = await query.limit(200)
  if (error) throw error
  const rows = data.map((row) => toListRow(row as Record<string, unknown>))
  return filter === "revisar" ? rows.filter((row) => row.mode !== null) : rows
}

export async function getFindings(accountId: string): Promise<FindingRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("recovery_findings")
    .select("id, return_row_id, kind, confidence, amount, currency_id, evidence, status, detected_at")
    .eq("ml_account_id", accountId)
    .order("detected_at", { ascending: false })
    .limit(300)
  if (error) throw error
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
    supabase.from("reputation_claims").select("reason_id, reason_detail, buyer_nickname, status, detail").eq("id", row.claim_row_id).maybeSingle(),
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
  return {
    row: {
      ...toListRow(row as unknown as Record<string, unknown>),
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
