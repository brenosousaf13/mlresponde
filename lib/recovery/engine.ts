import "server-only"

import { PlatformAiPausedError } from "@/lib/ai/usage"
import { MlAccountUnavailableError } from "@/lib/mercadolivre/accounts"
import { MlApiError } from "@/lib/mercadolivre/api"
import {
  BudgetExhaustedError,
  CallBudget,
  fetchClaim,
  fetchClaimOrder,
  fetchClaimReturn,
  fetchReturnFailReasons,
  fetchReturnReviews,
  submitReturnReview,
  uploadReturnAttachment,
} from "@/lib/mercadolivre/reputation"
import { returnAlerts } from "@/lib/recovery/alerts"
import {
  classifyReturn,
  recoveredByMaanu,
  returnPhase,
  returnsQueue,
  reviewAvailability,
  reviewDeadline,
  type ClaimAction,
  type ClaimDetailLike,
  type ParsedReturn,
  type ResolutionLike,
  type ReturnReview,
} from "@/lib/recovery/returns"
import {
  FALLBACK_REASONS,
  checkLabels,
  fallbackReturnMessage,
  reasonsFor,
  reviewPayload,
  validateReview,
  type ReturnReason,
  type ReviewDecision,
} from "@/lib/recovery/review"
import { runReturnMessageModel } from "@/lib/recovery/review-model"
import { RETURN_ALERT_KINDS } from "@/lib/reputation/alerts"
import { sanitizeAttachmentName, type OrderSummary } from "@/lib/reputation/claim-details"
import { toClaimRow } from "@/lib/reputation/claims"
import { syncClaimNow } from "@/lib/reputation/claims-engine"
import { applyAlerts, isClientError, isStopError, loadAccounts, type ReputationAccount } from "@/lib/reputation/engine"
import type { Database, Json } from "@/lib/supabase/database.types"
import { createServiceClient } from "@/lib/supabase/admin"

// Recuperador, etapa 1: devoluções (leitura no ML, fase, prazo, alertas, Raio-X de 90 dias) e a revisão que o dono envia.
// Regras puras em lib/recovery/{returns,review,review-ai,alerts}.ts. Só LÊ reputation_claims, reputation_sync, ml_accounts
// e organizations; escreve nas tabelas recovery_* (migração 20261020140000_recuperador.sql) e nos alertas do Escudo.

type SyncRow = Database["public"]["Tables"]["recovery_sync"]["Row"]
type ReturnRow = Database["public"]["Tables"]["recovery_returns"]["Row"]
type ReturnInsert = Database["public"]["Tables"]["recovery_returns"]["Insert"]
type ClaimRow = Database["public"]["Tables"]["reputation_claims"]["Row"]

export const RECOVERY_CRON_LIMITS = {
  accounts: 10,
  /** Chamadas ao ML por rodada (todas as contas; cada devolução usa 2). */
  calls: 60,
  concurrency: 2,
  budgetMs: 40_000,
} as const

const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE
const INTERVALS = {
  normal: 5 * MINUTE,
  needsReview: 2 * MINUTE,
  unfinished: MINUTE,
  waiting: 2 * MINUTE,
  error: 5 * MINUTE,
  rateLimited: 2 * MINUTE,
  accountUnavailable: 30 * MINUTE,
} as const
/** Raio-X: devoluções abertas nos últimos 90 dias (as abertas antes disso também entram, enquanto estiverem abertas). */
export const SCAN_WINDOW_DAYS = 90
const RETURNS_PER_RUN = 15

const CLAIM_COLUMNS =
  "id, claim_id, status, seller_actions, next_due_at, detail, resolution, order_summary, resource_id, ml_created_at, ml_updated_at, sale_at"
type CandidateClaim = Pick<
  ClaimRow,
  | "id"
  | "claim_id"
  | "status"
  | "seller_actions"
  | "next_due_at"
  | "detail"
  | "resolution"
  | "order_summary"
  | "resource_id"
  | "ml_created_at"
  | "ml_updated_at"
  | "sale_at"
>

function errorMessage(error: unknown) {
  const text = error instanceof Error ? error.message : String(error)
  return text.replace(/\s+/g, " ").trim().slice(0, 500) || "Erro desconhecido."
}

function iso(time: number) {
  return new Date(time).toISOString()
}

function actionsOf(claim: Pick<ClaimRow, "seller_actions">): ClaimAction[] {
  return Array.isArray(claim.seller_actions) ? (claim.seller_actions as unknown as ClaimAction[]) : []
}

async function optional<T>(call: () => Promise<T>): Promise<T | null> {
  try {
    return await call()
  } catch (error) {
    if (isClientError(error)) return null
    throw error
  }
}

// ---------------------------------------------------------------------------------------------- uma devolução

/** Lê a devolução no ML (devolução + revisões), grava a linha, o achado do Raio-X e o "recuperado". */
async function syncReturn(account: ReputationAccount, claim: CandidateClaim, existing: ReturnRow | undefined, budget: CallBudget, now: Date) {
  const admin = createServiceClient()
  const claimId = Number(claim.claim_id)
  let parsed: ParsedReturn | null = null
  let reviews: ReturnReview[] = []
  try {
    parsed = await fetchClaimReturn(account.id, claimId, budget)
    if (parsed?.returnId) reviews = (await optional(() => fetchReturnReviews(account.id, parsed?.returnId as number, budget))) ?? []
  } catch (error) {
    // 4xx definitivo (reclamação antiga, sem permissão): grava sem a devolução e só tenta de novo quando a reclamação mudar.
    if (!isClientError(error)) throw error
  }

  const summary = (claim.order_summary as OrderSummary | null) ?? null
  const availability = reviewAvailability(actionsOf(claim), claim.status)
  const canReview = availability.ok || availability.fail
  const phase = returnPhase({
    claimStatus: claim.status,
    parsed,
    canReview,
    reviews,
    reviewSubmitted: Boolean(existing?.review_submitted_at),
  })
  const amount = summary?.total_amount ?? null
  const recovered = recoveredByMaanu({
    maanuFailReview: existing?.review_kind === "fail",
    claimStatus: claim.status,
    reviews,
    resolution: claim.resolution as ResolutionLike,
  })
  const fields: ReturnInsert = {
    organization_id: account.organization_id,
    ml_account_id: account.id,
    claim_row_id: claim.id,
    claim_id: claimId,
    return_id: parsed?.returnId ?? existing?.return_id ?? null,
    phase,
    claim_status: claim.status.slice(0, 20),
    return_status: parsed?.status ?? null,
    return_subtype: parsed?.subtype ?? null,
    status_money: parsed?.statusMoney ?? null,
    refund_at: parsed?.refundAt ?? null,
    shipment_status: parsed?.shipmentStatus ?? null,
    destination: parsed?.destination ?? null,
    is_cart: parsed?.isCart ?? false,
    orders: (parsed?.orders ?? []) as unknown as Json,
    can_review_ok: availability.ok,
    can_review_fail: availability.fail,
    deadline_at: canReview
      ? reviewDeadline({ actionDue: availability.dueDate, nextDueAt: claim.next_due_at, detail: claim.detail as ClaimDetailLike })
      : null,
    reviews: reviews as unknown as Json,
    order_id: summary?.order_id ?? (claim.resource_id ? Number(claim.resource_id) : null),
    item_title: summary?.items[0]?.title?.slice(0, 200) ?? null,
    sale_at: summary?.date ?? claim.sale_at ?? null,
    amount,
    currency_id: summary?.currency_id ?? null,
    claim_created_at: claim.ml_created_at,
    claim_updated_at: claim.ml_updated_at,
    ml_closed_at: parsed?.closedAt ?? null,
    recovered_at: recovered ? (existing?.recovered_at ?? now.toISOString()) : null,
    recovered_amount: recovered ? amount : null,
    synced_at: now.toISOString(),
  }
  const { data: saved, error } = await admin
    .from("recovery_returns")
    .upsert(fields, { onConflict: "ml_account_id,claim_id" })
    .select("id")
    .single()
  if (error) throw error

  const findingFor = () =>
    classifyReturn({
      claimId,
      claimStatus: claim.status,
      resolution: claim.resolution as ResolutionLike,
      reviews,
      amount: fields.amount ?? null,
      currencyId: fields.currency_id ?? null,
      orderId: fields.order_id ?? null,
      itemTitle: fields.item_title ?? null,
      statusMoney: fields.status_money ?? null,
    })
  let finding = findingFor()
  // Reclamação antiga sem a venda lida pelo Escudo: busca valor e produto só quando vira achado (1 chamada a mais, rara).
  if (finding && fields.amount === null && fields.order_id) {
    const order = await optional(() => fetchClaimOrder(account.id, fields.order_id as number, budget))
    if (order?.summary) {
      const update = {
        amount: order.summary.total_amount,
        currency_id: order.summary.currency_id,
        item_title: order.summary.items[0]?.title?.slice(0, 200) ?? fields.item_title ?? null,
        sale_at: order.summary.date ?? fields.sale_at ?? null,
      }
      Object.assign(fields, update)
      const { error: amountError } = await admin.from("recovery_returns").update(update).eq("id", saved.id)
      if (amountError) throw amountError
      finding = findingFor()
    }
  }
  if (finding) {
    const { error: findingError } = await admin.from("recovery_findings").upsert(
      {
        organization_id: account.organization_id,
        ml_account_id: account.id,
        return_row_id: saved.id,
        kind: finding.kind,
        dedupe_key: finding.dedupeKey,
        confidence: finding.confidence,
        amount: finding.amount,
        currency_id: finding.currencyId,
        evidence: finding.evidence as Json,
        status: finding.status,
      },
      { onConflict: "ml_account_id,dedupe_key" }
    )
    if (findingError) throw findingError
  }
}

// ---------------------------------------------------------------------------------------------- rodada por conta

async function refreshReturnAlerts(account: ReputationAccount, now: Date) {
  const { data, error } = await createServiceClient()
    .from("recovery_returns")
    .select("id, claim_id, phase, deadline_at, item_title, recovered_at, recovered_amount")
    .eq("ml_account_id", account.id)
    .or("phase.eq.needs_review,recovered_at.gte." + iso(now.getTime() - 3 * DAY))
    .limit(300)
  if (error) throw error
  const drafts = returnAlerts(
    data.map((row) => ({
      ...row,
      claim_id: Number(row.claim_id),
      recovered_amount: row.recovered_amount === null ? null : Number(row.recovered_amount),
    })),
    now
  )
  await applyAlerts(account, drafts, RETURN_ALERT_KINDS, undefined, now)
}

/** Progresso do Raio-X: quantas devoluções da janela já foram lidas. */
async function updateScan(account: ReputationAccount, windowClaims: readonly CandidateClaim[], now: Date) {
  const admin = createServiceClient()
  const ids = windowClaims.map((claim) => Number(claim.claim_id))
  let done = 0
  for (let index = 0; index < ids.length; index += 300) {
    const { count, error } = await admin
      .from("recovery_returns")
      .select("id", { count: "exact", head: true })
      .eq("ml_account_id", account.id)
      .in("claim_id", ids.slice(index, index + 300))
    if (error) throw error
    done += count ?? 0
  }
  const { data: scan, error: scanError } = await admin
    .from("recovery_scans")
    .select("status, started_at")
    .eq("ml_account_id", account.id)
    .maybeSingle()
  if (scanError) throw scanError
  const finished = done >= ids.length
  const { error } = await admin.from("recovery_scans").upsert(
    {
      ml_account_id: account.id,
      organization_id: account.organization_id,
      window_days: SCAN_WINDOW_DAYS,
      returns_total: ids.length,
      returns_done: Math.min(done, ids.length),
      // Depois de pronto, o Raio-X continua pronto (devoluções novas entram no ritmo normal).
      status: scan?.status === "done" || finished ? "done" : "running",
      started_at: scan?.started_at ?? now.toISOString(),
      ...(scan?.status !== "done" && finished ? { completed_at: now.toISOString() } : {}),
    },
    { onConflict: "ml_account_id" }
  )
  if (error) throw error
}

async function markScanWaiting(account: ReputationAccount) {
  const { error } = await createServiceClient()
    .from("recovery_scans")
    .upsert(
      { ml_account_id: account.id, organization_id: account.organization_id, status: "waiting", window_days: SCAN_WINDOW_DAYS },
      { onConflict: "ml_account_id", ignoreDuplicates: true }
    )
  if (error) throw error
}

/**
 * Uma conta (já reservada): lê as devoluções da fila (até 15 por rodada), atualiza o Raio-X e os alertas e solta a trava.
 * O Raio-X espera o Escudo terminar a busca inicial das reclamações (reputation_sync.claims_backfilled_at).
 */
export async function syncRecoveryAccount(account: ReputationAccount, budget: CallBudget, deadline: number) {
  const admin = createServiceClient()
  const now = new Date()
  let next = INTERVALS.normal
  let lastError: string | null = null
  try {
    const { data: escudo, error: escudoError } = await admin
      .from("reputation_sync")
      .select("claims_backfilled_at")
      .eq("ml_account_id", account.id)
      .maybeSingle()
    if (escudoError) throw escudoError
    if (!escudo?.claims_backfilled_at) {
      await markScanWaiting(account)
      next = INTERVALS.waiting
    } else {
      const since = iso(now.getTime() - SCAN_WINDOW_DAYS * DAY)
      const { data: claims, error: claimsError } = await admin
        .from("reputation_claims")
        .select(CLAIM_COLUMNS)
        .eq("ml_account_id", account.id)
        .eq("type", "returns")
        .or("status.eq.opened,ml_created_at.gte." + since)
        .order("ml_created_at", { ascending: false })
        .limit(2000)
      if (claimsError) throw claimsError
      const { data: known, error: knownError } = await admin.from("recovery_returns").select("*").eq("ml_account_id", account.id).limit(5000)
      if (knownError) throw knownError
      const byClaim = new Map(known.map((row) => [Number(row.claim_id), row]))
      const queue = returnsQueue(
        claims.map((claim) => ({ ...claim, claim_id: Number(claim.claim_id) })),
        new Map([...byClaim].map(([id, row]) => [id, { claim_updated_at: row.claim_updated_at, synced_at: row.synced_at, phase: row.phase }])),
        now
      )
      let processed = 0
      let stop: unknown = null
      for (const claim of queue.slice(0, RETURNS_PER_RUN)) {
        if (budget.exhausted || Date.now() > deadline) break
        try {
          await syncReturn(account, claim, byClaim.get(Number(claim.claim_id)), budget, now)
          processed++
        } catch (error) {
          if (isStopError(error)) {
            stop = error
            break
          }
          console.error("[recuperador] devolução " + claim.claim_id + ":", errorMessage(error))
          processed++
        }
      }
      const sinceTime = Date.parse(since)
      const windowClaims = claims.filter((claim) => claim.ml_created_at && Date.parse(claim.ml_created_at) >= sinceTime)
      await updateScan(account, windowClaims, now)
      await refreshReturnAlerts(account, now)
      if (stop) throw stop
      if (processed < queue.length) next = INTERVALS.unfinished
      else if (known.some((row) => row.phase === "needs_review")) next = INTERVALS.needsReview
    }
  } catch (error) {
    if (error instanceof BudgetExhaustedError) next = budget.rateLimited ? INTERVALS.rateLimited : INTERVALS.unfinished
    else if (error instanceof MlApiError && error.status === 429) {
      budget.rateLimited = true
      next = INTERVALS.rateLimited
    } else {
      lastError = errorMessage(error)
      next = error instanceof MlAccountUnavailableError ? INTERVALS.accountUnavailable : INTERVALS.error
      console.error("[recuperador] conta " + account.id + ":", lastError)
    }
  }
  const { error } = await admin
    .from("recovery_sync")
    .update({
      locked_until: null,
      next_returns_at: iso(Date.now() + next),
      last_returns_at: now.toISOString(),
      last_error: lastError,
      last_error_at: lastError ? now.toISOString() : null,
    })
    .eq("ml_account_id", account.id)
  if (error) throw error
}

async function releaseLock(accountId: string) {
  const { error } = await createServiceClient().from("recovery_sync").update({ locked_until: null }).eq("ml_account_id", accountId)
  if (error) console.error("[recuperador] trava da conta " + accountId + ":", error.message)
}

async function forEachLimit<T>(items: readonly T[], limit: number, task: (item: T) => Promise<unknown>) {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await task(items[next++])
  })
  await Promise.all(workers)
}

export type RecoverySyncResult = { accounts: number; failures: number; rateLimited: boolean }

/** Cron do Recuperador (1 vez por minuto): contas com rodada vencida, até 60 chamadas ao ML. */
export async function runRecoverySync(): Promise<RecoverySyncResult> {
  const deadline = Date.now() + RECOVERY_CRON_LIMITS.budgetMs
  const budget = new CallBudget(RECOVERY_CRON_LIMITS.calls)
  const result: RecoverySyncResult = { accounts: 0, failures: 0, rateLimited: false }
  try {
    const { data: rows, error } = await createServiceClient().rpc("claim_recovery_sync", {
      p_limit: RECOVERY_CRON_LIMITS.accounts,
      p_lock_seconds: 120,
    })
    if (error) throw error
    const accounts = await loadAccounts((rows ?? []).map((row: SyncRow) => row.ml_account_id))
    await forEachLimit(rows ?? [], RECOVERY_CRON_LIMITS.concurrency, async (row: SyncRow) => {
      const account = accounts.get(row.ml_account_id)
      if (!account || budget.exhausted || Date.now() > deadline) {
        await releaseLock(row.ml_account_id)
        return
      }
      try {
        await syncRecoveryAccount(account, budget, deadline)
        result.accounts++
      } catch (error) {
        result.failures++
        console.error("[recuperador] conta " + row.ml_account_id + ":", errorMessage(error))
        await releaseLock(row.ml_account_id)
      }
    })
  } catch (error) {
    result.failures++
    console.error("[recuperador] rodada:", errorMessage(error))
  }
  result.rateLimited = budget.rateLimited
  return result
}

/** "Atualizar agora" na tela: uma rodada da conta já (se não estiver em andamento). */
export async function syncRecoveryNow(accountId: string): Promise<"done" | "busy" | "unavailable"> {
  const { data: rows, error } = await createServiceClient().rpc("claim_recovery_sync", {
    p_limit: 1,
    p_lock_seconds: 90,
    p_ml_account_id: accountId,
  })
  if (error) throw error
  if (!rows?.[0]) return "busy"
  const account = (await loadAccounts([accountId])).get(accountId)
  if (!account) {
    await releaseLock(accountId)
    return "unavailable"
  }
  await syncRecoveryAccount(account, new CallBudget(30), Date.now() + 25_000)
  return "done"
}

// ---------------------------------------------------------------------------------------------- revisão (a pedido do dono)

type LoadedReturn = { row: ReturnRow; claim: ClaimRow; account: ReputationAccount }

async function loadReturn(organizationId: string, returnRowId: string): Promise<LoadedReturn | null> {
  const admin = createServiceClient()
  const { data: row, error } = await admin
    .from("recovery_returns")
    .select("*")
    .eq("id", returnRowId)
    .eq("organization_id", organizationId)
    .maybeSingle()
  if (error) throw error
  if (!row) return null
  const { data: claim, error: claimError } = await admin.from("reputation_claims").select("*").eq("id", row.claim_row_id).maybeSingle()
  if (claimError) throw claimError
  const account = (await loadAccounts([row.ml_account_id])).get(row.ml_account_id)
  return claim && account ? { row, claim, account } : null
}

/** Lê de novo uma devolução (reclamação no ML pelo Escudo + devolução e revisões). */
export async function syncReturnNow(organizationId: string, returnRowId: string) {
  const loaded = await loadReturn(organizationId, returnRowId)
  if (!loaded) return
  await syncClaimNow(organizationId, loaded.claim.id).catch((error) =>
    console.error("[recuperador] reler reclamação " + loaded.claim.claim_id + ":", errorMessage(error))
  )
  const { data: claim, error } = await createServiceClient().from("reputation_claims").select(CLAIM_COLUMNS).eq("id", loaded.claim.id).single()
  if (error) throw error
  const { data: row } = await createServiceClient().from("recovery_returns").select("*").eq("id", returnRowId).single()
  await syncReturn(loaded.account, claim, row ?? loaded.row, new CallBudget(4), new Date())
  await refreshReturnAlerts(loaded.account, new Date())
}

/** Motivos que o ML aceita agora para esta devolução (lista de reserva se a leitura falhar). */
export async function returnReasonsFor(organizationId: string, returnRowId: string): Promise<ReturnReason[] | null> {
  const loaded = await loadReturn(organizationId, returnRowId)
  if (!loaded) return null
  let reasons: ReturnReason[] = [...FALLBACK_REASONS]
  try {
    reasons = await fetchReturnFailReasons(loaded.account.id, Number(loaded.row.claim_id), new CallBudget(1))
  } catch (error) {
    console.error("[recuperador] motivos da devolução " + loaded.row.claim_id + ":", errorMessage(error))
  }
  return reasonsFor(reasons, loaded.row.is_cart)
}

export type DraftInput = { reasonId: string; reasonLabel: string; checks: string[]; notes: string; photos: number }

/** Relato pela IA (o dono edita antes de enviar). Sem IA (pausa ou falha) → relato só com os fatos marcados. */
export async function draftReturnMessage(
  organizationId: string,
  returnRowId: string,
  input: DraftInput
): Promise<{ message: string; fromAi: boolean } | null> {
  const admin = createServiceClient()
  const { data: row, error } = await admin
    .from("recovery_returns")
    .select("id, ml_account_id, item_title, orders")
    .eq("id", returnRowId)
    .eq("organization_id", organizationId)
    .maybeSingle()
  if (error) throw error
  if (!row) return null
  const { data: organization } = await admin.from("organizations").select("name").eq("id", organizationId).single()
  const checks = checkLabels(input.reasonId, input.checks)
  const orders = Array.isArray(row.orders) ? (row.orders as { return_quantity?: unknown }[]) : []
  const quantity = orders.reduce((total, order) => total + (Number(order?.return_quantity) || 0), 0) || null
  const prompt = {
    storeName: organization?.name ?? "sua loja",
    reasonLabel: input.reasonLabel,
    checks,
    notes: input.notes.slice(0, 600),
    photos: input.photos,
    itemTitle: row.item_title,
    quantity,
  }
  try {
    return await runReturnMessageModel(prompt, {
      feature: "recovery_return_message",
      organizationId,
      mlAccountId: row.ml_account_id,
    })
  } catch (error) {
    if (!(error instanceof PlatformAiPausedError)) console.error("[recuperador] relato da IA:", errorMessage(error))
    return { message: fallbackReturnMessage({ reasonLabel: input.reasonLabel, checks, notes: input.notes, photos: input.photos }), fromAi: false }
  }
}

export type ReviewInput = {
  organizationId: string
  userId: string
  returnRowId: string
  canManage: boolean
  decision: ReviewDecision
  reasonId: string | null
  message: string
  photos: File[]
}

export type ReviewResult = { ok: boolean; message: string }

function friendlyMlError(error: unknown): string {
  if (error instanceof MlApiError) {
    if (error.status === 429) return "O Mercado Livre pediu para esperar um pouco. Tente de novo em instantes."
    if (error.status === 401 || error.status === 403) {
      return "O Mercado Livre não permitiu a revisão agora (" + error.message.replace(/^Mercado Livre: /, "") + ")."
    }
    return "O Mercado Livre recusou: " + error.message.replace(/^Mercado Livre: /, "")
  }
  return "Não foi possível falar com o Mercado Livre agora. Tente de novo."
}

async function recordReview(input: {
  loaded: LoadedReturn
  userId: string
  decision: ReviewDecision
  details: Record<string, unknown>
  status: "success" | "failed"
  mlStatus: number | null
  response?: unknown
  error?: string
}) {
  const response = input.response === undefined || input.response === null ? null : JSON.stringify(input.response)
  const { error } = await createServiceClient()
    .from("recovery_actions")
    .insert({
      organization_id: input.loaded.row.organization_id,
      ml_account_id: input.loaded.row.ml_account_id,
      return_row_id: input.loaded.row.id,
      claim_row_id: input.loaded.claim.id,
      claim_id: Number(input.loaded.row.claim_id),
      return_id: input.loaded.row.return_id,
      action: input.decision === "ok" ? "return_review_ok" : "return_review_fail",
      details: input.details as Json,
      status: input.status,
      ml_status: input.mlStatus,
      ml_response: response && response.length <= 7000 ? (JSON.parse(response) as Json) : null,
      error: input.error?.slice(0, 500) ?? null,
      performed_by: input.userId,
    })
  // O histórico não pode impedir a resposta ao dono, mas a falha precisa aparecer nos logs.
  if (error) console.error("[recuperador] histórico da revisão:", error.message)
}

/**
 * Envia a revisão da devolução a pedido do dono/administrador: confere no ML se a revisão ainda está liberada, sobe as
 * fotos, envia, grava no histórico imutável (sucesso ou falha) e lê a devolução de novo.
 */
export async function submitReturnReviewFor(input: ReviewInput): Promise<ReviewResult> {
  if (!input.canManage) return { ok: false, message: "Só o dono ou um administrador da loja pode enviar a revisão." }
  const loaded = await loadReturn(input.organizationId, input.returnRowId)
  if (!loaded) return { ok: false, message: "Devolução não encontrada." }
  const { row, account } = loaded
  if (row.review_submitted_at) return { ok: false, message: "Esta devolução já foi revisada pela maanu." }

  const budget = new CallBudget(15)
  const claimId = Number(row.claim_id)
  const details: Record<string, unknown> = { decision: input.decision }
  let submitted: { returnId: number; result: { status: number; body: unknown } } | null = null
  try {
    // A revisão ainda está liberada? (A tela pode estar desatualizada.)
    const current = toClaimRow(await fetchClaim(account.id, claimId, budget), account.ml_user_id)
    const availability = reviewAvailability(current?.seller_actions ?? [], current?.status ?? loaded.claim.status)
    if (!(input.decision === "ok" ? availability.ok : availability.fail)) {
      await syncReturnNow(input.organizationId, input.returnRowId).catch(() => {})
      return { ok: false, message: "O Mercado Livre não libera mais esta revisão. Atualizamos a devolução." }
    }
    const returnId = row.return_id ?? (await fetchClaimReturn(account.id, claimId, budget))?.returnId ?? null
    if (!returnId) return { ok: false, message: "O Mercado Livre não informou a devolução desta reclamação. Revise pelo app do ML." }

    let body: unknown = reviewPayload("ok")
    if (input.decision === "fail") {
      let reasons: ReturnReason[] = [...FALLBACK_REASONS]
      try {
        reasons = await fetchReturnFailReasons(account.id, claimId, budget)
      } catch (error) {
        if (isStopError(error)) throw error
      }
      const invalid = validateReview({
        decision: "fail",
        reasonId: input.reasonId,
        message: input.message,
        photos: input.photos,
        reasons,
        isCart: row.is_cart,
      })
      if (invalid) return { ok: false, message: invalid }
      const names: string[] = []
      for (const [index, photo] of input.photos.entries()) {
        const name = sanitizeAttachmentName(photo.name || "foto-" + (index + 1), photo.type)
        names.push(await uploadReturnAttachment(account.id, claimId, photo, name, budget))
      }
      details.reason = input.reasonId
      details.message = input.message.trim()
      details.attachments = names
      body = reviewPayload("fail", { reasonId: input.reasonId as string, message: input.message, attachments: names })
    }
    submitted = { returnId, result: await submitReturnReview(account.id, returnId, body, budget) }
  } catch (error) {
    const mlStatus = error instanceof MlApiError ? error.status : null
    await recordReview({ loaded, userId: input.userId, decision: input.decision, details, status: "failed", mlStatus, error: errorMessage(error) })
    console.error("[recuperador] revisão da devolução " + claimId + ":", errorMessage(error))
    return { ok: false, message: friendlyMlError(error) }
  }

  // Enviada: histórico e a linha (falhas aqui só vão para os logs; a revisão já está no ML).
  await recordReview({
    loaded,
    userId: input.userId,
    decision: input.decision,
    details,
    status: "success",
    mlStatus: submitted.result.status,
    response: submitted.result.body,
  })
  const { error: updateError } = await createServiceClient()
    .from("recovery_returns")
    .update({
      return_id: submitted.returnId,
      review_kind: input.decision,
      review_submitted_at: new Date().toISOString(),
      review_submitted_by: input.userId,
      phase: "reviewed",
      can_review_ok: false,
      can_review_fail: false,
    })
    .eq("id", row.id)
  if (updateError) console.error("[recuperador] gravar revisão " + claimId + ":", updateError.message)

  await syncReturnNow(input.organizationId, input.returnRowId).catch((error) =>
    console.error("[recuperador] reler devolução " + claimId + ":", errorMessage(error))
  )
  return {
    ok: true,
    message:
      input.decision === "ok"
        ? "Pronto: você confirmou ao Mercado Livre que a devolução chegou certinho."
        : "Revisão enviada. O Mercado Livre analisa e avisamos aqui se você for ressarcido.",
  }
}
