import { classifyQueueItem, type QueueActionGroup } from "@/lib/recovery/contract"
import { computeLeftBehind, type LeftBehindAction, type LeftBehindRow, type LeftBehindSummary } from "@/lib/recovery/left-behind"
import { classifySyncHealth, type SyncHealth } from "@/lib/recovery/sync-health"
import { deadlinePassed, rowReviewMode, type ReviewMode } from "@/lib/recovery/returns"

export type RecoveryFunnelAccount = {
  id: string
  organization_id: string
  organization_name: string
  status: string | null
  token_status: string | null
  has_access: boolean
  trial_ends_at?: string | null
  subscription_status?: string | null
  current_period_end?: string | null
  billing_exempt?: boolean | null
}

export type RecoveryFunnelReturn = LeftBehindRow & {
  id?: string | null
  ml_account_id?: string | null
  phase?: string | null
  action_group?: QueueActionGroup | null
  recommendation?: string | null
  can_review_ok?: boolean | null
  recovered_amount?: number | string | null
}

export type RecoveryFunnelAction = LeftBehindAction & {
  ml_account_id: string
  return_row_id: string
  action: string
  status: string
}

export type RecoveryFunnelSync = {
  ml_account_id: string
  last_returns_at: string | null
  last_error: string | null
  last_error_at: string | null
}

export type RecoveryFunnelInput = {
  accounts: readonly RecoveryFunnelAccount[]
  returns: readonly RecoveryFunnelReturn[]
  actions: readonly RecoveryFunnelAction[]
  syncs: readonly RecoveryFunnelSync[]
  now: Date
}

export type RecoveryFunnelRow = {
  account_id: string
  account_label: string
  organization_id: string
  organization_name: string
  returns_read: number
  actionable_recover: number
  actionable_confirm: number
  sent_ok: number
  sent_failed: number
  decisions_in_favor: number
  decisions_against: number
  decisions_pending: number
  recovered_amount: number
  left_behind: LeftBehindSummary
  sync_status: SyncHealth["status"]
  sync_message: string
  last_sync_at: string | null
}

function shortAccount(id: string) {
  return id.slice(-4)
}

function amount(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function modeOf(row: RecoveryFunnelReturn): ReviewMode | null {
  if (row.mode) return row.mode
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

function isActionable(row: RecoveryFunnelReturn, now: Date) {
  const mode = modeOf(row)
  return row.phase === "needs_review" && mode !== null && !deadlinePassed(row.deadline_at, now)
}

function isDecidedAgainst(row: RecoveryFunnelReturn) {
  if (row.recovered_at) return false
  const reviews = Array.isArray(row.reviews) ? row.reviews as { seller_status?: string | null; benefited?: string | null }[] : []
  return reviews.some((review) => review.seller_status === "success" || review.benefited === "buyer")
}

/**
 * Consolida o funil do Recuperador por conta ML em memória. A função recebe todas as linhas já lidas em lote e não faz I/O.
 */
export function buildRecoveryFunnel(input: RecoveryFunnelInput): RecoveryFunnelRow[] {
  const returnsByAccount = new Map<string, RecoveryFunnelReturn[]>()
  for (const row of input.returns) {
    if (!row.ml_account_id) continue
    const list = returnsByAccount.get(row.ml_account_id) ?? []
    list.push(row)
    returnsByAccount.set(row.ml_account_id, list)
  }
  const actionsByAccount = new Map<string, RecoveryFunnelAction[]>()
  for (const action of input.actions) {
    const list = actionsByAccount.get(action.ml_account_id) ?? []
    list.push(action)
    actionsByAccount.set(action.ml_account_id, list)
  }
  const syncByAccount = new Map(input.syncs.map((sync) => [sync.ml_account_id, sync]))

  return input.accounts.map((account) => {
    const rows = returnsByAccount.get(account.id) ?? []
    const actions = actionsByAccount.get(account.id) ?? []
    const actionByReturn = new Map<string, RecoveryFunnelAction[]>()
    for (const action of actions) {
      const list = actionByReturn.get(action.return_row_id) ?? []
      list.push(action)
      actionByReturn.set(action.return_row_id, list)
    }
    const leftBehindRows = rows.map((row) => ({ ...row, id: row.id ?? undefined, actions: actionByReturn.get(row.id ?? "") ?? row.actions ?? [] }))
    const leftBehind = computeLeftBehind(leftBehindRows, input.now)
    let actionableRecover = 0
    let actionableConfirm = 0
    let decisionsInFavor = 0
    let decisionsAgainst = 0
    let decisionsPending = 0
    let recoveredAmount = 0
    for (const row of rows) {
      if (isActionable(row, input.now)) {
        const classification = row.action_group
          ? { actionGroup: row.action_group }
          : classifyQueueItem({ mode: modeOf(row) as ReviewMode, amount: row.amount === null || row.amount === undefined ? null : amount(row.amount), canReviewOk: Boolean(row.can_review_ok) })
        if (classification.actionGroup === "recover") actionableRecover += 1
        else actionableConfirm += 1
      }
      if (row.recovered_at) {
        decisionsInFavor += 1
        recoveredAmount += amount(row.recovered_amount ?? row.amount)
      } else {
        const rowActions = actionByReturn.get(row.id ?? "") ?? []
        const sent = rowActions.some((action) => action.status === "success" || action.status === "ok") || Boolean(row.review_submitted_at)
        if (sent && isDecidedAgainst(row)) decisionsAgainst += 1
        else if (sent) decisionsPending += 1
      }
    }
    const sync = syncByAccount.get(account.id) ?? null
    const health = classifySyncHealth({
      now: input.now,
      accountActive: account.status === "active",
      tokenValid: account.token_status === "valid",
      hasAccess: account.has_access,
      trialEndsAt: account.trial_ends_at,
      sync,
    })
    return {
      account_id: account.id,
      account_label: shortAccount(account.id),
      organization_id: account.organization_id,
      organization_name: account.organization_name,
      returns_read: rows.length,
      actionable_recover: actionableRecover,
      actionable_confirm: actionableConfirm,
      sent_ok: actions.filter((action) => action.status === "success" || action.status === "ok").length,
      sent_failed: actions.filter((action) => action.status === "failed" || action.status === "error").length,
      decisions_in_favor: decisionsInFavor,
      decisions_against: decisionsAgainst,
      decisions_pending: decisionsPending,
      recovered_amount: Math.round(recoveredAmount * 100) / 100,
      left_behind: leftBehind,
      sync_status: health.status,
      sync_message: health.message,
      last_sync_at: sync?.last_returns_at ?? null,
    }
  })
}
