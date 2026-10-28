import "server-only"

import { requireAdmin } from "@/lib/dal/admin"
import { buildRecoveryFunnel, type RecoveryFunnelAccount, type RecoveryFunnelAction, type RecoveryFunnelReturn, type RecoveryFunnelRow, type RecoveryFunnelSync } from "@/lib/recovery/funnel"
import { classifyQueueItem } from "@/lib/recovery/contract"
import { rowReviewMode } from "@/lib/recovery/returns"
import { suggestActionByRules, suggestInputFromRows } from "@/lib/recovery/suggest"
import { organizationHasAccess } from "@/lib/recovery/sync-health"
import { createClient } from "@/lib/supabase/server"
import { fetchAllPages } from "@/lib/supabase/paginate"

const WINDOW_DAYS = 90
const DAY_MS = 24 * 60 * 60 * 1000

export type AdminRecoveryFunnel = {
  from: string
  rows: RecoveryFunnelRow[]
}

/** Lê o funil inteiro em consultas em lote; não consulta nada dentro do loop de contas. */
export async function getAdminRecoveryFunnel(now = new Date()): Promise<AdminRecoveryFunnel> {
  await requireAdmin()
  const supabase = await createClient()
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY_MS).toISOString()
  const [accountsResult, returnsResult, actionsResult, findingsResult, syncResult, claimsResult] = await Promise.all([
    fetchAllPages((from, to) => supabase
      .from("ml_accounts")
      .select("id, organization_id, status, token_status, organizations(name, billing_exempt, subscription_status, current_period_end, trial_ends_at)")
      .order("created_at", { ascending: true })
      .order("id")
      .range(from, to)),
    fetchAllPages((from, to) => supabase
      .from("recovery_returns")
      .select("id, ml_account_id, claim_id, claim_created_at, sale_at, amount, currency_id, status_money, phase, destination, shipment_status, return_status, can_review_ok, can_review_fail, deadline_at, review_submitted_at, review_kind, recovered_at, recovered_amount, reviews, orders, order_id, is_cart")
      .gte("claim_created_at", since)
      .order("id")
      .range(from, to)),
    fetchAllPages((from, to) => supabase
      .from("recovery_actions")
      .select("ml_account_id, return_row_id, action, status, performed_at")
      .gte("performed_at", since)
      .order("id")
      .range(from, to)),
    fetchAllPages((from, to) => supabase
      .from("recovery_findings")
      .select("return_row_id, kind, status, evidence, detected_at")
      .gte("detected_at", since)
      .order("id")
      .range(from, to)),
    // recovery_sync não tem id: ml_account_id é a chave primária estável.
    fetchAllPages((from, to) => supabase.from("recovery_sync").select("ml_account_id, last_returns_at, last_error, last_error_at").order("ml_account_id").range(from, to)),
    fetchAllPages((from, to) => supabase.from("reputation_claims").select("claim_id, reason_detail, affects_reputation").order("id").range(from, to)),
  ])

  type AccountWithOrg = {
    id: string
    organization_id: string
    status: string | null
    token_status: string | null
    organizations:
      | { name: string; billing_exempt: boolean; subscription_status: string; current_period_end: string | null; trial_ends_at: string }
      | { name: string; billing_exempt: boolean; subscription_status: string; current_period_end: string | null; trial_ends_at: string }[]
      | null
  }
  const accounts = accountsResult as unknown as AccountWithOrg[]
  const accountInputs: RecoveryFunnelAccount[] = accounts.map((account) => {
    const organization = Array.isArray(account.organizations) ? account.organizations[0] : account.organizations
    return {
      id: account.id,
      organization_id: account.organization_id,
      organization_name: organization?.name ?? "Organização sem nome",
      status: account.status,
      token_status: account.token_status,
      has_access: organization ? organizationHasAccess(organization, now) : false,
      trial_ends_at: organization?.trial_ends_at,
      subscription_status: organization?.subscription_status ?? null,
      current_period_end: organization?.current_period_end ?? null,
      billing_exempt: organization?.billing_exempt ?? null,
    }
  })

  const findingsByReturn = new Map<string, { outcome?: string; kind?: string; status?: string; evidence?: Record<string, unknown> }[]>()
  for (const finding of findingsResult) {
    if (!finding.return_row_id) continue
    const list = findingsByReturn.get(String(finding.return_row_id)) ?? []
    const evidence = (finding.evidence ?? {}) as Record<string, unknown>
    list.push({ outcome: typeof evidence.outcome === "string" ? evidence.outcome : undefined, kind: finding.kind, status: finding.status, evidence })
    findingsByReturn.set(String(finding.return_row_id), list)
  }
  const claimsById = new Map(claimsResult.map((claim) => [Number(claim.claim_id), claim]))
  const returns = returnsResult.map((rawRow) => {
    const row = rawRow as unknown as RecoveryFunnelReturn
    const mode = row.mode ?? rowReviewMode({
      can_review_ok: Boolean(row.can_review_ok),
      can_review_fail: Boolean(row.can_review_fail),
      destination: row.destination ?? null,
      shipment_status: row.shipment_status ?? null,
      return_status: row.return_status ?? null,
      reviews: row.reviews,
      order_id: row.order_id ?? null,
    })
    const classification = mode
      ? classifyQueueItem({
          mode,
          amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
          canReviewOk: Boolean(row.can_review_ok),
          suggestion: suggestActionByRules(
            suggestInputFromRows(
              {
                reviews: row.reviews,
                orders: row.orders,
                order_id: row.order_id ?? null,
                status_money: row.status_money ?? null,
                amount: row.amount ?? null,
                currency_id: row.currency_id ?? null,
                deadline_at: row.deadline_at ?? null,
                is_cart: Boolean(row.is_cart),
                can_review_ok: Boolean(row.can_review_ok),
                can_review_fail: Boolean(row.can_review_fail),
              },
              claimsById.get(Number(row.claim_id)) ?? null,
              mode
            )
          ),
        })
      : null
    return {
      ...row,
      mode,
      action_group: classification?.actionGroup ?? row.action_group ?? null,
      findings: findingsByReturn.get(String(row.id)) ?? [],
    }
  })
  const actions = actionsResult as unknown as RecoveryFunnelAction[]
  const syncs = syncResult as unknown as RecoveryFunnelSync[]
  return { from: since, rows: buildRecoveryFunnel({ accounts: accountInputs, returns, actions, syncs, now }) }
}

export { buildRecoveryFunnel }
export type { RecoveryFunnelRow }
