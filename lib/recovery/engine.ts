import "server-only"

import { PlatformAiPausedError } from "@/lib/ai/usage"
import { MlAccountUnavailableError } from "@/lib/mercadolivre/accounts"
import { MlApiError } from "@/lib/mercadolivre/api"
import {
  BudgetExhaustedError,
  CallBudget,
  fetchClaim,
  fetchClaimOrder,
  fetchClaimReasonDetail,
  fetchClaimReturn,
  fetchReturnFailReasons,
  fetchReturnReviews,
  submitReturnReview,
  uploadReturnAttachment,
} from "@/lib/mercadolivre/reputation"
import { returnAlerts } from "@/lib/recovery/alerts"
import { logRecovery, shortAccount } from "@/lib/recovery/log"
import { classifySyncHealth, organizationHasAccess, SYNC_STALE_MS } from "@/lib/recovery/sync-health"
import {
  arrivalDate,
  cartOrderIds,
  classifyReturn,
  deadlinePassed,
  ownReviews,
  recoveredByMaanu,
  returnAmount,
  returnPhase,
  returnsQueue,
  reviewAvailability,
  reviewDeadline,
  reviewMode,
  rowReviewMode,
  triageAwaitingSeller,
  type ClaimAction,
  type ClaimDetailLike,
  type KnownReturn,
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
/**
 * Mudança das regras do Recuperador (Sessão 31): devoluções lidas antes disso são lidas de novo no ritmo normal (as com
 * revisão liberada primeiro), para fase, prazo, carrinho e Raio-X seguirem a regra nova. Atualizar ao mudar as regras.
 */
export const RECOVERY_RULES_SINCE = "2026-10-20T23:50:00.000Z"

const CLAIM_COLUMNS =
  "id, claim_id, status, seller_actions, next_due_at, detail, resolution, order_summary, resource_id, reason_id, reason_detail, ml_created_at, ml_updated_at, sale_at"
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
  | "reason_id"
  | "reason_detail"
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

function hasReviewAction(claim: Pick<ClaimRow, "seller_actions">): boolean {
  const availability = reviewAvailability(actionsOf(claim))
  return availability.ok || availability.fail
}

/** Pedido desta reclamação: o que a devolução lista para ela, a venda lida pelo Escudo ou o recurso da reclamação. */
function claimOrderId(claim: Pick<ClaimRow, "resource_id">, parsed: ParsedReturn | null, summary: OrderSummary | null, existing?: ReturnRow) {
  const fromReturn = parsed?.orders.find((order) => order.order_id)?.order_id ?? null
  const fromClaim = claim.resource_id ? Number(claim.resource_id) : null
  return fromReturn ?? summary?.order_id ?? (fromClaim && Number.isSafeInteger(fromClaim) ? fromClaim : null) ?? (existing?.order_id ? Number(existing.order_id) : null)
}

/** Pedidos das outras reclamações da mesma devolução (carrinho), a partir das linhas já gravadas da conta. */
export type SiblingIndex = ReadonlyMap<number, { claimId: number; orderId: number | null }[]>

function siblingIndex(rows: readonly Pick<ReturnRow, "return_id" | "claim_id" | "order_id">[]): SiblingIndex {
  const index = new Map<number, { claimId: number; orderId: number | null }[]>()
  for (const row of rows) {
    if (!row.return_id) continue
    const list = index.get(Number(row.return_id)) ?? []
    list.push({ claimId: Number(row.claim_id), orderId: row.order_id === null ? null : Number(row.order_id) })
    index.set(Number(row.return_id), list)
  }
  return index
}

function siblingOrders(index: SiblingIndex | undefined, returnId: number | null, claimId: number): number[] {
  if (!index || !returnId) return []
  return (index.get(returnId) ?? []).flatMap((item) => (item.claimId !== claimId && item.orderId ? [item.orderId] : []))
}

/** Texto dos motivos do ML (códigos globais, sem dado pessoal): não muda, fica na memória da instância. */
const reasonTexts = new Map<string, string | null>()

/**
 * Motivo declarado pelo comprador (ex.: "A minha compra chegou em boas condições, mas eu não a quero mais"). O Escudo só
 * grava o texto das reclamações que detalha; sem ele, usa o de outra reclamação com o mesmo código e, por último, pergunta
 * ao ML (1 chamada por código).
 */
async function buyerReasonFor(account: ReputationAccount, claim: Pick<ClaimRow, "reason_id" | "reason_detail">, budget: CallBudget) {
  if (claim.reason_detail) return claim.reason_detail
  const reasonId = claim.reason_id
  if (!reasonId) return null
  if (reasonTexts.has(reasonId)) return reasonTexts.get(reasonId) ?? null
  const { data, error } = await createServiceClient()
    .from("reputation_claims")
    .select("reason_detail")
    .eq("reason_id", reasonId)
    .not("reason_detail", "is", null)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  let text = data?.reason_detail ?? null
  if (!text && !budget.exhausted) text = (await optional(() => fetchClaimReasonDetail(account.id, reasonId, budget))) ?? null
  reasonTexts.set(reasonId, text)
  return text
}

async function loadSiblings(accountId: string, returnId: number | null): Promise<SiblingIndex> {
  if (!returnId) return new Map()
  const { data, error } = await createServiceClient()
    .from("recovery_returns")
    .select("return_id, claim_id, order_id")
    .eq("ml_account_id", accountId)
    .eq("return_id", returnId)
    .limit(50)
  if (error) throw error
  return siblingIndex(data)
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

/**
 * Lê a devolução no ML (devolução + revisões), grava a linha, o achado do Raio-X e o "recuperado". Usa só a revisão do
 * pedido desta reclamação (a devolução pode juntar vários pedidos de um carrinho) e só pede revisão ao vendedor quando ele
 * pode agir de verdade (reviewMode).
 */
async function syncReturn(
  account: ReputationAccount,
  claim: CandidateClaim,
  existing: ReturnRow | undefined,
  budget: CallBudget,
  now: Date,
  siblings?: SiblingIndex
) {
  const admin = createServiceClient()
  const claimId = Number(claim.claim_id)
  let parsed: ParsedReturn | null = null
  let allReviews: ReturnReview[] = []
  try {
    parsed = await fetchClaimReturn(account.id, claimId, budget)
    if (parsed?.returnId) allReviews = (await optional(() => fetchReturnReviews(account.id, parsed?.returnId as number, budget))) ?? []
  } catch (error) {
    // 4xx definitivo (reclamação antiga, sem permissão): grava sem a devolução e só tenta de novo quando a reclamação mudar.
    if (!isClientError(error)) throw error
  }

  const summary = (claim.order_summary as OrderSummary | null) ?? null
  const orderId = claimOrderId(claim, parsed, summary, existing)
  const reviews = ownReviews(allReviews, orderId)
  const returnId = parsed?.returnId ?? existing?.return_id ?? null
  const orders = cartOrderIds({
    orders: parsed?.orders ?? [],
    reviews: allReviews,
    siblingOrderIds: siblingOrders(siblings, returnId === null ? null : Number(returnId), claimId),
  })
  const availability = reviewAvailability(actionsOf(claim))
  const mode = reviewMode({
    hasOk: availability.ok,
    hasFail: availability.fail,
    destination: parsed?.destination ?? null,
    shipmentStatus: parsed?.shipmentStatus ?? null,
    returnStatus: parsed?.status ?? null,
    reviews,
  })
  const reviewSubmitted = Boolean(existing?.review_submitted_at)
  const deadline = reviewDeadline({
    mode,
    actionDue: availability.dueDate,
    nextDueAt: claim.next_due_at,
    detail: claim.detail as ClaimDetailLike,
    reviews,
    viaTriage: parsed?.viaTriage ?? false,
    arrivedAt: arrivalDate(parsed, reviews),
  })
  // Prazo vencido (real ou estimado): sai da fila "Revise agora" e vai para o histórico (closed), sem esperar nada do ML.
  const overdue = mode !== null && deadlinePassed(deadline.at, now)
  const phase = returnPhase({ claimStatus: claim.status, parsed, mode, reviews, reviewSubmitted, deadlineAt: deadline.at, now })
  logRecovery({
    etapa: "lido",
    conta: account.id,
    claim_id: claimId,
    resultado: "ok",
    detalhe: "fase=" + phase + (mode ? " modo=" + mode : "") + (overdue ? " prazo vencido" : ""),
  })
  if (phase === "needs_review" && existing?.phase !== "needs_review") {
    logRecovery({
      etapa: "elegivel",
      conta: account.id,
      claim_id: claimId,
      resultado: "ok",
      detalhe: "modo=" + mode + (deadline.estimated ? " prazo estimado" : ""),
    })
  }
  const wasDecided = Array.isArray(existing?.reviews)
    ? (existing.reviews as unknown as ReturnReview[]).some((review) => review.seller_status === "failed" || review.seller_status === "success")
    : false
  if (existing && !wasDecided && reviews.some((review) => review.seller_status === "failed" || review.seller_status === "success")) {
    logRecovery({ etapa: "decidido", conta: account.id, claim_id: claimId, resultado: "ok", detalhe: "o ML decidiu a revisão" })
  }
  const claimOrder = parsed?.orders.find((order) => order.order_id === orderId) ?? parsed?.orders[0] ?? null
  // Venda: a lida pelo Escudo; senão a que a maanu já buscou antes (não apaga o valor a cada leitura).
  const amount = returnAmount(summary, claimOrder) ?? (existing?.amount === null || existing?.amount === undefined ? null : Number(existing.amount))
  const recovered = recoveredByMaanu({
    maanuFailReview: existing?.review_kind === "fail",
    submittedAt: existing?.review_submitted_at ?? null,
    claimStatus: claim.status,
    reviews,
    resolution: claim.resolution as ResolutionLike,
  })
  const fields: ReturnInsert = {
    organization_id: account.organization_id,
    ml_account_id: account.id,
    claim_row_id: claim.id,
    claim_id: claimId,
    return_id: returnId,
    phase,
    claim_status: claim.status.slice(0, 20),
    return_status: parsed?.status ?? null,
    return_subtype: parsed?.subtype ?? null,
    status_money: parsed?.statusMoney ?? null,
    refund_at: parsed?.refundAt ?? null,
    shipment_status: parsed?.shipmentStatus ?? null,
    destination: parsed?.destination ?? null,
    is_cart: orders.length > 1,
    orders: (parsed?.orders ?? []) as unknown as Json,
    // O que a maanu oferece na tela: só quando o vendedor pode agir de verdade (na contestação, só "com problema").
    can_review_ok: mode === "arrival" && availability.ok && !overdue,
    can_review_fail: mode !== null && availability.fail && !overdue,
    deadline_at: deadline.at,
    reviews: allReviews as unknown as Json,
    order_id: orderId,
    item_title: summary?.items[0]?.title?.slice(0, 200) ?? existing?.item_title ?? null,
    sale_at: summary?.date ?? claim.sale_at ?? existing?.sale_at ?? null,
    amount,
    currency_id: summary?.currency_id ?? existing?.currency_id ?? null,
    claim_created_at: claim.ml_created_at,
    claim_updated_at: claim.ml_updated_at,
    ml_closed_at: parsed?.closedAt ?? null,
    recovered_at: recovered ? (existing?.recovered_at ?? now.toISOString()) : null,
    recovered_amount: recovered ? amount : null,
    synced_at: now.toISOString(),
  }

  // Motivo do comprador só quando importa (contestação ou produto que o armazém tirou de venda).
  const lossCandidate = mode === "appeal" || reviews.some((review) => review.product_condition === "unsaleable" || review.product_condition === "discard")
  const buyerReason = lossCandidate ? await buyerReasonFor(account, claim, budget) : claim.reason_detail
  const findingFor = () =>
    classifyReturn({
      claimId,
      claimStatus: claim.status,
      resolution: claim.resolution as ResolutionLike,
      reviews,
      mode,
      deadlineAt: deadline.at,
      overdue,
      reviewSubmittedKind: existing?.review_kind ?? null,
      buyerReason,
      amount: fields.amount ?? null,
      currencyId: fields.currency_id ?? null,
      orderId: fields.order_id ?? null,
      itemTitle: fields.item_title ?? null,
      statusMoney: fields.status_money ?? null,
    })
  let finding = findingFor()
  // Sem a venda lida pelo Escudo: busca valor e produto quando o dinheiro importa (revisão liberada ou achado), 1 vez.
  if ((finding || mode) && fields.amount === null && fields.order_id) {
    const order = await optional(() => fetchClaimOrder(account.id, fields.order_id as number, budget))
    if (order?.summary) {
      fields.amount = returnAmount(order.summary, claimOrder)
      fields.currency_id = order.summary.currency_id
      fields.item_title = order.summary.items[0]?.title?.slice(0, 200) ?? fields.item_title ?? null
      fields.sale_at = order.summary.date ?? fields.sale_at ?? null
      if (recovered) fields.recovered_amount = fields.amount
      finding = findingFor()
    }
  }

  const { data: saved, error } = await admin
    .from("recovery_returns")
    .upsert(fields, { onConflict: "ml_account_id,claim_id" })
    .select("id")
    .single()
  if (error) throw error
  if (fields.recovered_at && !existing?.recovered_at) {
    logRecovery({ etapa: "recuperado", conta: account.id, claim_id: claimId, resultado: "ok", detalhe: "ressarcimento detectado" })
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
  } else {
    // A regra mudou ou a leitura nova não confirma mais o achado: tira o antigo (achado é derivado, não histórico).
    const { error: deleteError } = await admin
      .from("recovery_findings")
      .delete()
      .eq("ml_account_id", account.id)
      .eq("dedupe_key", "return:" + claimId)
    if (deleteError) throw deleteError
  }
}

// ---------------------------------------------------------------------------------------------- rodada por conta

async function refreshReturnAlerts(account: ReputationAccount, now: Date) {
  const { data, error } = await createServiceClient()
    .from("recovery_returns")
    .select(
      "id, claim_id, phase, deadline_at, item_title, amount, recovered_at, recovered_amount, can_review_ok, can_review_fail, destination, shipment_status, return_status, reviews, order_id"
    )
    .eq("ml_account_id", account.id)
    .or("phase.eq.needs_review,recovered_at.gte." + iso(now.getTime() - 3 * DAY))
    .limit(300)
  if (error) throw error
  const drafts = returnAlerts(
    data
      .map((row) => ({
      id: row.id,
      claim_id: Number(row.claim_id),
      phase: row.phase,
      mode: rowReviewMode(row),
      deadline_at: row.deadline_at,
      item_title: row.item_title,
      amount: row.amount === null ? null : Number(row.amount),
      recovered_at: row.recovered_at,
      recovered_amount: row.recovered_amount === null ? null : Number(row.recovered_amount),
    }))
      // Só o que o vendedor pode fazer de verdade (linha da regra antiga que não é revisável não vira alerta).
      .map((row) => (row.phase === "needs_review" && row.mode === null ? { ...row, phase: "other" } : row))
      // Prazo vencido não é mais acionável: o alerta se resolve sozinho.
      .map((row) => (row.phase === "needs_review" && deadlinePassed(row.deadline_at, now) ? { ...row, phase: "closed" } : row)),
    now
  )
  await applyAlerts(account, drafts, RETURN_ALERT_KINDS, undefined, now)
  for (const draft of drafts) {
    if (draft.kind === "return_review_due" || draft.kind === "return_review_closing") {
      const claimId = Number((draft.data as { claim_id?: unknown } | undefined)?.claim_id)
      logRecovery({
        etapa: "avisado",
        conta: account.id,
        claim_id: Number.isFinite(claimId) ? claimId : null,
        resultado: "ok",
        detalhe: draft.kind,
      })
    }
  }
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
      const siblings = siblingIndex(known)
      const knownState = new Map<number, KnownReturn>(
        [...byClaim].map(([id, row]) => [
          id,
          {
            claim_updated_at: row.claim_updated_at,
            synced_at: row.synced_at,
            phase: row.phase,
            mode: rowReviewMode(row),
            return_status: row.return_status,
          },
        ])
      )
      const queue = returnsQueue(
        claims.map((claim) => ({ ...claim, claim_id: Number(claim.claim_id), hasReviewAction: hasReviewAction(claim) })),
        knownState,
        now,
        RECOVERY_RULES_SINCE
      )
      let processed = 0
      let stop: unknown = null
      for (const claim of queue.slice(0, RETURNS_PER_RUN)) {
        if (budget.exhausted || Date.now() > deadline) break
        try {
          await syncReturn(account, claim, byClaim.get(Number(claim.claim_id)), budget, now, siblings)
          processed++
        } catch (error) {
          if (isStopError(error)) {
            stop = error
            break
          }
          logRecovery({ etapa: "lido", conta: account.id, claim_id: Number(claim.claim_id), resultado: "falha", detalhe: errorMessage(error) })
          processed++
        }
      }
      const sinceTime = Date.parse(since)
      const windowClaims = claims.filter((claim) => claim.ml_created_at && Date.parse(claim.ml_created_at) >= sinceTime)
      await updateScan(account, windowClaims, now)
      await refreshReturnAlerts(account, now)
      if (stop) throw stop
      if (processed < queue.length) next = INTERVALS.unfinished
      else if (known.some((row) => row.phase === "needs_review" && rowReviewMode(row) === "arrival")) next = INTERVALS.needsReview
    }
  } catch (error) {
    if (error instanceof BudgetExhaustedError) next = budget.rateLimited ? INTERVALS.rateLimited : INTERVALS.unfinished
    else if (error instanceof MlApiError && error.status === 429) {
      budget.rateLimited = true
      next = INTERVALS.rateLimited
    } else {
      lastError = errorMessage(error)
      next = error instanceof MlAccountUnavailableError ? INTERVALS.accountUnavailable : INTERVALS.error
      logRecovery({ etapa: "lido", conta: account.id, resultado: "falha", detalhe: lastError })
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
  if (error) logRecovery({ etapa: "lido", conta: accountId, resultado: "falha", detalhe: "trava da conta: " + error.message })
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
        logRecovery({ etapa: "lido", conta: row.ml_account_id, resultado: "falha", detalhe: errorMessage(error) })
        await releaseLock(row.ml_account_id)
      }
    })
  } catch (error) {
    result.failures++
    console.error("[recuperador] rodada:", errorMessage(error))
  }
  try {
    await monitorRecoveryHealth(new Date())
  } catch (error) {
    console.error("[recuperador] monitor de contas paradas:", errorMessage(error))
  }
  result.rateLimited = budget.rateLimited
  return result
}

/** Última vez que cada conta foi registrada como parada / sem acesso (evita repetir o mesmo log e a mesma gravação). */
const healthReported = new Map<string, number>()

/**
 * Só leitura (mais 1 gravação do motivo, quando não há erro real): contas ativas que o claim_recovery_sync pulou por
 * organização sem acesso e contas paradas há mais de 30 minutos. Roda 1 vez por rodada do cron e registra cada conta no
 * máximo 1 vez a cada 30 minutos por instância. Sem migração e sem alerta novo.
 */
export async function monitorRecoveryHealth(now: Date) {
  const admin = createServiceClient()
  const { data: accounts, error } = await admin
    .from("ml_accounts")
    .select("id, organization_id, status, token_status")
    .eq("status", "active")
    .eq("token_status", "valid")
    .limit(2000)
  if (error) throw error
  if (!accounts.length) return
  const orgIds = [...new Set(accounts.map((account) => account.organization_id))]
  const [orgs, syncs] = await Promise.all([
    admin.from("organizations").select("id, billing_exempt, subscription_status, current_period_end, trial_ends_at").in("id", orgIds),
    admin
      .from("recovery_sync")
      .select("ml_account_id, last_returns_at, last_error, last_error_at")
      .in("ml_account_id", accounts.map((account) => account.id)),
  ])
  if (orgs.error) throw orgs.error
  if (syncs.error) throw syncs.error
  const orgById = new Map(orgs.data.map((org) => [org.id, org]))
  const syncById = new Map(syncs.data.map((sync) => [sync.ml_account_id, sync]))
  for (const account of accounts) {
    const org = orgById.get(account.organization_id)
    const sync = syncById.get(account.id) ?? null
    if (!org) continue
    const health = classifySyncHealth({
      now,
      accountActive: true,
      tokenValid: true,
      hasAccess: organizationHasAccess(org, now),
      trialEndsAt: org.trial_ends_at,
      sync,
    })
    if (health.status !== "parado" && health.status !== "sem_acesso") continue
    const last = healthReported.get(account.id) ?? 0
    if (now.getTime() - last < SYNC_STALE_MS) continue
    healthReported.set(account.id, now.getTime())
    logRecovery({
      etapa: health.status === "parado" ? "sync_parado" : "sem_acesso",
      conta: account.id,
      resultado: "pulado",
      detalhe: health.reason,
    })
    // Grava o motivo só quando não há erro real (o histórico de erro verdadeiro nunca é apagado).
    if (sync && !sync.last_error && health.reason) {
      const { error: reasonError } = await admin
        .from("recovery_sync")
        .update({ last_error: health.reason, last_error_at: sync.last_returns_at ?? now.toISOString() })
        .eq("ml_account_id", account.id)
        .is("last_error", null)
      if (reasonError) console.error("[recuperador] gravar motivo " + shortAccount(account.id) + ":", reasonError.message)
    }
  }
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
  const current = row ?? loaded.row
  const siblings = await loadSiblings(loaded.account.id, current.return_id === null ? null : Number(current.return_id))
  await syncReturn(loaded.account, claim, current, new CallBudget(5), new Date(), siblings)
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
    .select(
      "id, ml_account_id, claim_row_id, item_title, orders, order_id, can_review_ok, can_review_fail, destination, shipment_status, return_status, reviews"
    )
    .eq("id", returnRowId)
    .eq("organization_id", organizationId)
    .maybeSingle()
  if (error) throw error
  if (!row) return null
  const [{ data: organization }, { data: claim }] = await Promise.all([
    admin.from("organizations").select("name").eq("id", organizationId).single(),
    admin.from("reputation_claims").select("reason_detail, detail").eq("id", row.claim_row_id).maybeSingle(),
  ])
  const checks = checkLabels(input.reasonId, input.checks)
  const orders = Array.isArray(row.orders) ? (row.orders as { return_quantity?: unknown }[]) : []
  const quantity = orders.reduce((total, order) => total + (Number(order?.return_quantity) || 0), 0) || null
  const appeal = rowReviewMode(row) === "appeal"
  const detail = (claim?.detail ?? null) as { title?: unknown; description?: unknown } | null
  const verdict = [detail?.title, detail?.description].filter((part): part is string => typeof part === "string" && part.trim() !== "").join(". ")
  const triage = triageAwaitingSeller(ownReviews((Array.isArray(row.reviews) ? row.reviews : []) as ReturnReview[], row.order_id))
  const prompt = {
    storeName: organization?.name ?? "sua loja",
    reasonLabel: input.reasonLabel,
    checks,
    notes: input.notes.slice(0, 600),
    photos: input.photos,
    itemTitle: row.item_title,
    quantity,
    appeal,
    buyerReason: claim?.reason_detail ?? null,
    warehouseVerdict: appeal ? verdict || null : null,
    warehouseReasonId: appeal ? triage?.reason_id ?? null : null,
    productCondition: appeal ? triage?.product_condition ?? null : null,
  }
  try {
    return await runReturnMessageModel(prompt, {
      feature: "recovery_return_message",
      organizationId,
      mlAccountId: row.ml_account_id,
    })
  } catch (error) {
    if (!(error instanceof PlatformAiPausedError)) console.error("[recuperador] relato da IA:", errorMessage(error))
    return {
      message: fallbackReturnMessage({ reasonLabel: input.reasonLabel, checks, notes: input.notes, photos: input.photos, appeal }),
      fromAi: false,
    }
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

export type ReviewResult = { ok: boolean; message: string; rateLimited?: boolean }

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
  const details: Record<string, unknown> = { decision: input.decision, photos_count: input.photos.length }
  let submitted: { returnId: number; result: { status: number; body: unknown } } | null = null
  try {
    // Tudo lido de novo no ML (a tela pode estar desatualizada): a ação continua liberada E o vendedor pode agir de verdade
    // (o pacote chegou até ele ou o armazém espera a contestação). Nunca revisa um pacote que ainda está a caminho.
    const current = toClaimRow(await fetchClaim(account.id, claimId, budget), account.ml_user_id)
    const availability = reviewAvailability(current?.seller_actions ?? [])
    const parsed = await fetchClaimReturn(account.id, claimId, budget)
    const allReviews = parsed?.returnId ? ((await optional(() => fetchReturnReviews(account.id, parsed.returnId as number, budget))) ?? []) : []
    const orderId = row.order_id ? Number(row.order_id) : claimOrderId(loaded.claim, parsed, null)
    const reviews = ownReviews(allReviews, orderId)
    const mode = reviewMode({
      hasOk: availability.ok,
      hasFail: availability.fail,
      destination: parsed?.destination ?? null,
      shipmentStatus: parsed?.shipmentStatus ?? null,
      returnStatus: parsed?.status ?? null,
      reviews,
    })
    const allowed = input.decision === "ok" ? mode === "arrival" && availability.ok : mode !== null && availability.fail
    if (!allowed) {
      await syncReturnNow(input.organizationId, input.returnRowId).catch(() => {})
      return {
        ok: false,
        message:
          mode === null && (availability.ok || availability.fail)
            ? "O pacote ainda não chegou até você (ou o armazém do ML ainda está revisando). Atualizamos a devolução."
            : "O Mercado Livre não libera mais esta revisão. Atualizamos a devolução.",
      }
    }
    const returnId = parsed?.returnId ?? row.return_id ?? null
    if (!returnId) return { ok: false, message: "O Mercado Livre não informou a devolução desta reclamação. Revise pelo app do ML." }
    const siblings = await loadSiblings(account.id, Number(returnId))
    const isCart =
      cartOrderIds({ orders: parsed?.orders ?? [], reviews: allReviews, siblingOrderIds: siblingOrders(siblings, Number(returnId), claimId) })
        .length > 1
    details.mode = mode
    details.is_cart = isCart
    if (mode === "appeal") details.warehouse_reason = triageAwaitingSeller(reviews)?.reason_id ?? null

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
        isCart,
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
      if (isCart && orderId) details.order_id = orderId
      body = reviewPayload("fail", {
        reasonId: input.reasonId as string,
        message: input.message,
        attachments: names,
        orderId: isCart ? orderId : null,
      })
    }
    submitted = { returnId, result: await submitReturnReview(account.id, returnId, body, budget) }
  } catch (error) {
    const mlStatus = error instanceof MlApiError ? error.status : null
    await recordReview({ loaded, userId: input.userId, decision: input.decision, details, status: "failed", mlStatus, error: errorMessage(error) })
    logRecovery({
      etapa: "enviado",
      conta: account.id,
      claim_id: claimId,
      resultado: "falha",
      detalhe: "ml_status=" + (mlStatus ?? "sem resposta") + " decisao=" + input.decision,
    })
      return { ok: false, message: friendlyMlError(error), rateLimited: error instanceof MlApiError && error.status === 429 }
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
  logRecovery({
    etapa: "enviado",
    conta: account.id,
    claim_id: claimId,
    resultado: "ok",
    detalhe: "ml_status=" + submitted.result.status + " decisao=" + input.decision,
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
        : details.mode === "appeal"
          ? "Contestação enviada. O Mercado Livre analisa e avisamos aqui se você for ressarcido."
          : "Revisão enviada. O Mercado Livre analisa e avisamos aqui se você for ressarcido.",
  }
}
