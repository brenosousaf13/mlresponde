import "server-only"

import type { FindingKind, ReturnPhase, ReturnReview } from "@/lib/recovery/returns"
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
  "id, claim_id, phase, item_title, amount, currency_id, deadline_at, claim_created_at, ml_closed_at, status_money, shipment_status, destination, review_kind, review_submitted_at, recovered_at, recovered_amount, is_cart"

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
}

function toListRow(row: Record<string, unknown>): ReturnListRow {
  return {
    ...(row as unknown as ReturnListRow),
    claim_id: Number(row.claim_id),
    amount: row.amount === null ? null : Number(row.amount),
    recovered_amount: row.recovered_amount === null ? null : Number(row.recovered_amount),
  }
}

export type FindingRow = {
  id: string
  return_row_id: string | null
  kind: FindingKind
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
  waiting: { count: number; nextDeadline: string | null; rows: ReturnListRow[] }
  suspect: { count: number; amount: number }
  recovered: { count: number; amount: number }
  reimbursed: { count: number; amount: number }
  counts: Record<ReturnFilter, number>
}

function sum(rows: readonly { amount?: unknown; recovered_amount?: unknown }[], key: "amount" | "recovered_amount") {
  return Math.round(rows.reduce((total, row) => total + (Number(row[key]) || 0), 0) * 100) / 100
}

export async function getRecoveryOverview(accountId: string): Promise<RecoveryOverview> {
  const supabase = await createClient()
  const [sync, scan, escudo, waiting, findings, recovered, andamento, encerradas] = await Promise.all([
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
      .limit(50),
    supabase.from("recovery_findings").select("kind, status, amount").eq("ml_account_id", accountId).limit(5000),
    supabase.from("recovery_returns").select("recovered_amount").eq("ml_account_id", accountId).not("recovered_at", "is", null).limit(5000),
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
  for (const result of [sync, scan, escudo, waiting, findings, recovered, andamento, encerradas]) if (result.error) throw result.error
  const waitingRows = (waiting.data ?? []).map((row) => toListRow(row as Record<string, unknown>))
  const suspect = (findings.data ?? []).filter((row) => row.kind === "return_unsaleable_unreimbursed" && row.status === "open")
  const reimbursed = (findings.data ?? []).filter((row) => row.kind === "return_reimbursed")
  return {
    sync: sync.data ?? null,
    scan: scan.data ?? null,
    claimsReady: Boolean(escudo.data?.claims_backfilled_at),
    waiting: { count: waitingRows.length, nextDeadline: waitingRows.find((row) => row.deadline_at)?.deadline_at ?? null, rows: waitingRows },
    suspect: { count: suspect.length, amount: sum(suspect, "amount") },
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
  return data.map((row) => toListRow(row as Record<string, unknown>))
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
  return data.map((row) => ({
    ...row,
    kind: row.kind as FindingKind,
    amount: row.amount === null ? null : Number(row.amount),
    evidence: (row.evidence ?? {}) as Record<string, unknown>,
  }))
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
  claim: { reason_id: string | null; reason_detail: string | null; buyer_nickname: string | null; status: string } | null
  account: { id: string; nickname: string }
  actions: { id: string; action: string; status: string; error: string | null; details: Record<string, unknown>; performed_at: string }[]
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
    supabase.from("reputation_claims").select("reason_id, reason_detail, buyer_nickname, status").eq("id", row.claim_row_id).maybeSingle(),
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
    claim: claim.data ?? null,
    account: { id: account.data.id, nickname: account.data.nickname || "Conta " + account.data.ml_user_id },
    actions: actions.data.map((action) => ({ ...action, details: (action.details ?? {}) as Record<string, unknown> })),
  }
}

/** Selo do menu Recuperador: devoluções esperando a revisão (alertas urgentes do Recuperador em aberto). */
export const RECOVERY_BADGE_KINDS = ["return_review_due", "return_review_closing"] as const
