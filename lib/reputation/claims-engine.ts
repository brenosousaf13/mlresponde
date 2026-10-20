import "server-only"

import { computeAccess } from "@/lib/access/access"
import { PlatformAiPausedError, aiErrorText } from "@/lib/ai/usage"
import { MlApiError } from "@/lib/mercadolivre/api"
import {
  CallBudget,
  allowReturnClaim,
  fetchClaim,
  fetchClaimAffects,
  fetchClaimDetail,
  fetchClaimExpectedResolutions,
  fetchClaimMessages,
  fetchClaimOrder,
  fetchClaimReasonDetail,
  fetchPartialRefundOffers,
  fetchShipmentInfo,
  openClaimDispute,
  partialRefundClaim,
  refundClaim,
  sendClaimMessage,
  uploadClaimAttachment,
} from "@/lib/mercadolivre/reputation"
import { CLAIM_ALERT_KINDS, claimAlerts } from "@/lib/reputation/alerts"
import { readClaimAnalysis, suggestsExclusion, type ClaimPromptInput } from "@/lib/reputation/claim-ai"
import {
  LISTED_CLAIM_TYPES,
  MAX_CLAIM_ANALYSES,
  claimActions,
  claimInputHash,
  isRestrictedAction,
  orderSummaryFromRow,
  parseClaimDetail,
  parseClaimMessages,
  parseExpectedResolutions,
  parsePartialRefundOffers,
  reasonGroup,
  sanitizeAttachmentName,
  validateAttachments,
  validateClaimMessage,
  type ClaimActionKind,
  type OrderSummary,
  type PartialRefundOffers,
} from "@/lib/reputation/claim-details"
import { runClaimAnalysisModel } from "@/lib/reputation/claim-model"
import { readAffects, toClaimRow, type SellerAction } from "@/lib/reputation/claims"
import { applyAlerts, forEachLimit, isClientError, isStopError, loadAccounts, type ReputationAccount } from "@/lib/reputation/engine"
import { exclusionLabel } from "@/lib/reputation/exclusions"
import type { Database, Json } from "@/lib/supabase/database.types"
import { createServiceClient } from "@/lib/supabase/admin"

// Escudo de Reputação, etapa 2: detalhe das reclamações, fila da IA, alertas de reclamação e as ações que o vendedor
// aprova. Regras puras em lib/reputation/{claim-details,claim-ai,alerts}.ts. Roda como gancho das rodadas da etapa 1
// (lib/reputation/engine.ts) e nas ações da tela.

type ClaimRow = Database["public"]["Tables"]["reputation_claims"]["Row"]
type ClaimUpdate = Database["public"]["Tables"]["reputation_claims"]["Update"]

const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE
/** Reclamações encerradas há até 7 dias ainda têm o detalhe atualizado. */
const RECENT_DAYS = 7
/** Reclamações abertas: detalhe e mensagens de novo a cada 30 minutos (mesmo sem mudança na busca). */
const OPEN_REFRESH_MS = 30 * MINUTE
/** Detalhes por conta em cada rodada do cron (a cada 2 min), 3 ao mesmo tempo. */
const DETAILS_PER_RUN = 12
const DETAILS_CONCURRENCY = 3
const ANALYSES_PER_RUN = 3
const AI_LOCK_MS = 3 * MINUTE
const ANALYSIS_MIN_MS = 25_000

function errorMessage(error: unknown) {
  const text = error instanceof Error ? error.message : String(error)
  return text.replace(/\s+/g, " ").trim().slice(0, 500) || "Erro desconhecido."
}

function sellerActionsOf(row: Pick<ClaimRow, "seller_actions">): SellerAction[] {
  return Array.isArray(row.seller_actions) ? (row.seller_actions as unknown as SellerAction[]) : []
}

/** Uma chamada que pode faltar sem estragar o resto (4xx = sem a informação). */
async function optional<T>(call: () => Promise<T>): Promise<T | null> {
  try {
    return await call()
  } catch (error) {
    if (isClientError(error)) return null
    throw error
  }
}

export function needsDetails(row: Pick<ClaimRow, "status" | "details_synced_at" | "ml_updated_at">, now: Date): boolean {
  if (!row.details_synced_at) return true
  const synced = Date.parse(row.details_synced_at)
  if (row.ml_updated_at && Date.parse(row.ml_updated_at) > synced) return true
  return row.status === "opened" && now.getTime() - synced > OPEN_REFRESH_MS
}

type DetailsCandidate = Pick<ClaimRow, "status" | "details_synced_at" | "ml_updated_at" | "next_due_at">

/**
 * Ordem do detalhe (lojas grandes têm centenas de reclamações e só cabem algumas por rodada): nunca lidas, depois as que
 * mudaram no ML, depois as abertas a atualizar; em cada grupo, abertas antes de encerradas e o prazo mais curto primeiro.
 */
export function detailsQueue<T extends DetailsCandidate>(rows: readonly T[], now: Date): T[] {
  const group = (row: T) =>
    !row.details_synced_at ? 0 : row.ml_updated_at && Date.parse(row.ml_updated_at) > Date.parse(row.details_synced_at) ? 1 : 2
  const due = (row: T) => (row.next_due_at ? Date.parse(row.next_due_at) : Number.POSITIVE_INFINITY)
  return rows
    .filter((row) => needsDetails(row, now))
    .sort(
      (a, b) =>
        group(a) - group(b) ||
        Number(a.status !== "opened") - Number(b.status !== "opened") ||
        due(a) - due(b) ||
        Date.parse(b.ml_updated_at ?? "") - Date.parse(a.ml_updated_at ?? "")
    )
}

const STORED_ORDER_COLUMNS = "ml_order_id, pack_id, ordered_at, total_amount, currency_id, items, shipment_id, ml_customers(nickname)"

async function storedOrders(accountId: string, orderIds: number[]) {
  if (!orderIds.length) return []
  const { data, error } = await createServiceClient()
    .from("ml_orders")
    .select(STORED_ORDER_COLUMNS)
    .eq("ml_account_id", accountId)
    .in("ml_order_id", orderIds)
  if (error) throw error
  return data
}

type StoredOrder = Awaited<ReturnType<typeof storedOrders>>[number]
type ClaimMessageInsert = Database["public"]["Tables"]["reputation_claim_messages"]["Insert"]

/**
 * Gravações agrupadas das rodadas do cron: as vendas das reclamações são lidas numa consulta só e as mensagens e
 * atualizações das reclamações saem juntas no fim (flushClaimDetails), em vez de 3 idas ao banco por reclamação.
 */
type DetailsBatch = {
  /** null = a venda não está gravada (busca no ML, como antes). */
  orders: Map<number, StoredOrder | null>
  messages: ClaimMessageInsert[]
  updates: { id: string; update: ClaimUpdate }[]
}

async function flushClaimDetails(batch: DetailsBatch) {
  const admin = createServiceClient()
  // Mensagens antes das reclamações: se falhar, nenhuma é marcada como lida e a próxima rodada tenta de novo.
  for (let index = 0; index < batch.messages.length; index += 500) {
    const { error } = await admin
      .from("reputation_claim_messages")
      .upsert(batch.messages.slice(index, index + 500), { onConflict: "claim_row_id,hash" })
    if (error) throw error
  }
  const results = await Promise.all(
    batch.updates.map(({ id, update }) => admin.from("reputation_claims").update(update).eq("id", id))
  )
  for (const result of results) if (result.error) throw result.error
  batch.messages = []
  batch.updates = []
}

/** Lê no ML tudo o que a tela e a IA precisam de uma reclamação e grava. Mudou = análise nova na fila (até 8). */
export async function syncClaimDetails(
  account: ReputationAccount,
  claim: ClaimRow,
  budget: CallBudget,
  now: Date = new Date(),
  reasons: Map<string, string | null> = new Map(),
  batch?: DetailsBatch
) {
  const admin = createServiceClient()
  const claimId = Number(claim.claim_id)
  const current = await fetchClaim(account.id, claimId, budget)
  const fresh = toClaimRow(current, account.ml_user_id)
  const version = current.claim_version === null || current.claim_version === undefined ? null : String(current.claim_version).slice(0, 10)

  const detail = Number(version) >= 2 ? parseClaimDetail(await optional(() => fetchClaimDetail(account.id, claimId, budget))) : null
  const messages = parseClaimMessages(await optional(() => fetchClaimMessages(account.id, claimId, budget)))
  const expected = parseExpectedResolutions(await optional(() => fetchClaimExpectedResolutions(account.id, claimId, budget)))

  let reasonDetail = claim.reason_detail
  const reasonId = fresh?.reason_id ?? claim.reason_id
  if (!reasonDetail && reasonId) {
    if (!reasons.has(reasonId)) reasons.set(reasonId, await optional(() => fetchClaimReasonDetail(account.id, reasonId, budget)))
    reasonDetail = reasons.get(reasonId)?.slice(0, 300) ?? null
  }

  let orderSummary = (claim.order_summary as OrderSummary | null) ?? null
  let buyerNickname = claim.buyer_nickname
  let shipmentId: number | null = null
  const orderId = (fresh?.resource ?? claim.resource) === "order" ? Number(fresh?.resource_id ?? claim.resource_id) || null : null
  if (orderId) {
    const stored = batch?.orders.has(orderId) ? batch.orders.get(orderId) : (await storedOrders(account.id, [orderId]))[0]
    if (stored) {
      orderSummary = orderSummaryFromRow({ ...stored, total_amount: stored.total_amount === null ? null : Number(stored.total_amount) })
      buyerNickname = buyerNickname ?? stored.ml_customers?.nickname ?? null
      shipmentId = stored.shipment_id ? Number(stored.shipment_id) : null
    } else if (!orderSummary || !claim.shipping) {
      const order = await optional(() => fetchClaimOrder(account.id, orderId, budget))
      if (order) {
        orderSummary = order.summary
        buyerNickname = buyerNickname ?? order.buyerNickname
        shipmentId = order.shipmentId
      }
    }
  }
  let shipping = (claim.shipping as Record<string, unknown> | null) ?? null
  if (shipmentId) {
    const info = await optional(() => fetchShipmentInfo(account.id, shipmentId as number, budget))
    if (info) {
      shipping = {
        status: info.status ?? null,
        substatus: info.substatus ?? null,
        tracking_number: info.tracking_number ?? null,
        logistic_type: info.logistic?.type ?? info.logistic_type ?? null,
      }
    }
  }

  const status = fresh?.status ?? claim.status
  const actions = fresh?.seller_actions ?? sellerActionsOf(claim)
  const hash = claimInputHash({
    status,
    stage: fresh?.stage ?? claim.stage,
    mlUpdatedAt: fresh?.ml_updated_at ?? claim.ml_updated_at,
    actions,
    messageHashes: messages.map((message) => message.hash),
  })
  const update: ClaimUpdate = {
    claim_version: version,
    detail: detail as Json | null,
    reason_detail: reasonDetail,
    expected_resolutions: expected as unknown as Json,
    order_summary: orderSummary as unknown as Json | null,
    buyer_nickname: buyerNickname,
    shipping: shipping as Json | null,
    messages_count: messages.length,
    last_message_at: messages.at(-1)?.message_at ?? null,
    last_message_from: messages.at(-1)?.sender_role ?? null,
    details_synced_at: now.toISOString(),
  }
  if (fresh) {
    Object.assign(update, {
      type: fresh.type,
      stage: fresh.stage,
      status: fresh.status,
      reason_id: fresh.reason_id,
      fulfilled: fresh.fulfilled,
      seller_actions: fresh.seller_actions as unknown as Json,
      next_due_at: fresh.next_due_at,
      resolution: fresh.resolution as Json | null,
      ml_updated_at: fresh.ml_updated_at ?? claim.ml_updated_at,
    })
  }
  if (status === "opened" && hash !== claim.ai_input_hash && claim.ai_status !== "processing") {
    update.ai_input_hash = hash
    update.ai_status = claim.ai_analyses >= MAX_CLAIM_ANALYSES ? "skipped" : "pending"
  }
  const messageRows: ClaimMessageInsert[] = messages.map((message) => ({
    organization_id: account.organization_id,
    ml_account_id: account.id,
    claim_row_id: claim.id,
    ...message,
    attachments: message.attachments as unknown as Json,
  }))
  if (batch) {
    batch.messages.push(...messageRows)
    batch.updates.push({ id: claim.id, update })
    return
  }
  if (messageRows.length) {
    const { error: messagesError } = await admin
      .from("reputation_claim_messages")
      .upsert(messageRows, { onConflict: "claim_row_id,hash" })
    if (messagesError) throw messagesError
  }
  const { error: updateError } = await admin.from("reputation_claims").update(update).eq("id", claim.id)
  if (updateError) throw updateError
}

const CLAIM_COLUMNS = "*"

/**
 * Gancho das rodadas (depois da busca de reclamações): detalhe das abertas/alteradas e os alertas de reclamação.
 * Devolve true quando ficou reclamação esperando detalhe (volta na próxima rodada do cron, não em 5 min).
 */
export async function claimsHook(account: ReputationAccount, _changed: unknown, budget: CallBudget, now: Date): Promise<boolean> {
  const admin = createServiceClient()
  const recent = new Date(now.getTime() - RECENT_DAYS * DAY).toISOString()
  const { data: candidates, error } = await admin
    .from("reputation_claims")
    .select(CLAIM_COLUMNS)
    .eq("ml_account_id", account.id)
    .in("type", [...LISTED_CLAIM_TYPES])
    .or("status.eq.opened,ml_updated_at.gt." + recent)
    .order("details_synced_at", { ascending: true, nullsFirst: true })
    .limit(400)
  if (error) throw error
  const reasons = new Map<string, string | null>()
  let stop: unknown = null
  const queue = detailsQueue(candidates, now)
  const selected = queue.slice(0, DETAILS_PER_RUN)
  const orderIds = selected.flatMap((claim) => (claim.resource === "order" && claim.resource_id ? [Number(claim.resource_id)] : []))
  const orders = new Map<number, StoredOrder | null>(orderIds.map((orderId) => [orderId, null]))
  for (const order of await storedOrders(account.id, orderIds)) orders.set(Number(order.ml_order_id), order)
  const batch: DetailsBatch = { orders, messages: [], updates: [] }
  await forEachLimit(selected, DETAILS_CONCURRENCY, async (claim) => {
    if (stop) return
    try {
      await syncClaimDetails(account, claim, budget, now, reasons, batch)
    } catch (syncError) {
      if (isStopError(syncError)) {
        stop = syncError
        return
      }
      // Sem detalhe agora: marca como lida para não travar a fila; tenta de novo na próxima mudança.
      batch.updates.push({ id: claim.id, update: { details_synced_at: now.toISOString() } })
      console.error("[reputação] detalhe da reclamação " + claim.claim_id + ":", errorMessage(syncError))
    }
  })
  await flushClaimDetails(batch)
  await refreshClaimAlerts(account, now)
  if (stop) throw stop
  return queue.length > DETAILS_PER_RUN
}

/** Alertas de reclamação (nova, prazo vencendo, possível exclusão, deixou de contar) com o que está gravado. */
export async function refreshClaimAlerts(account: ReputationAccount, now: Date = new Date()) {
  const { data: claims, error } = await createServiceClient()
    .from("reputation_claims")
    .select(
      "id, claim_id, type, status, ml_created_at, next_due_at, affects_reputation, exclusion_requested_at, reason_id, reason_detail, order_summary, ai_result"
    )
    .eq("ml_account_id", account.id)
    .or("status.eq.opened,affects_reputation.eq.affected,exclusion_requested_at.not.is.null")
    .limit(500)
  if (error) throw error
  const drafts = claimAlerts(
    claims.map((claim) => {
      const summary = claim.order_summary as OrderSummary | null
      const analysis = readClaimAnalysis(claim.ai_result)
      return {
        id: claim.id,
        claim_id: Number(claim.claim_id),
        type: claim.type,
        status: claim.status,
        ml_created_at: claim.ml_created_at,
        next_due_at: claim.next_due_at,
        affects_reputation: claim.affects_reputation,
        exclusion_requested_at: claim.exclusion_requested_at,
        label: summary?.items[0]?.title ?? reasonGroup(claim.reason_id) ?? "Reclamação " + claim.claim_id,
        reason: claim.reason_detail ?? reasonGroup(claim.reason_id),
        exclusionLabel: analysis ? exclusionLabel(analysis.exclusionCase) : null,
        suggestsExclusion: suggestsExclusion(analysis),
      }
    }),
    now
  )
  await applyAlerts(account, drafts, CLAIM_ALERT_KINDS, undefined, now)
}

// ---------------------------------------------------------------------------------------------- IA

async function promptInput(claim: ClaimRow): Promise<ClaimPromptInput> {
  const admin = createServiceClient()
  const [messages, organization] = await Promise.all([
    admin
      .from("reputation_claim_messages")
      .select("sender_role, message, message_at")
      .eq("claim_row_id", claim.id)
      .order("message_at", { ascending: true })
      .limit(200),
    admin.from("organizations").select("name").eq("id", claim.organization_id).single(),
  ])
  if (messages.error) throw messages.error
  if (organization.error) throw organization.error
  const detail = (claim.detail as { title?: string; description?: string; problem?: string; due_date?: string } | null) ?? null
  const actions = claimActions(sellerActionsOf(claim), claim.status)
  return {
    storeName: organization.data.name,
    claim: {
      type: claim.type,
      stage: claim.stage,
      status: claim.status,
      reasonId: claim.reason_id,
      reasonDetail: claim.reason_detail,
      problem: detail?.problem ?? null,
      title: detail?.title ?? null,
      description: detail?.description ?? null,
      createdAt: claim.ml_created_at,
      dueDate: claim.next_due_at ?? detail?.due_date ?? null,
      fulfilled: claim.fulfilled,
      affects: claim.affects_reputation,
      hasIncentive: claim.has_incentive,
    },
    sale: (claim.order_summary as OrderSummary | null) ?? null,
    shipping: (claim.shipping as ClaimPromptInput["shipping"]) ?? null,
    expected: Array.isArray(claim.expected_resolutions)
      ? (claim.expected_resolutions as unknown as ClaimPromptInput["expected"])
      : [],
    messages: messages.data,
    actions: actions.available.map((action) => action.kind),
    onlyInMl: actions.onlyInMl.map((action) => action.label),
  }
}

/** Analisa uma reclamação já reservada (ai_status = processing). */
async function analyzeClaim(claim: ClaimRow, now: Date = new Date()) {
  const admin = createServiceClient()
  try {
    const { analysis, model } = await runClaimAnalysisModel(await promptInput(claim), {
      feature: "reputation_claim_analysis",
      organizationId: claim.organization_id,
      mlAccountId: claim.ml_account_id,
    })
    const { error } = await admin
      .from("reputation_claims")
      .update({
        ai_status: "ready",
        ai_result: analysis as unknown as Json,
        ai_model: model,
        ai_analyzed_at: now.toISOString(),
        ai_analyses: claim.ai_analyses + 1,
        ai_error: null,
        ai_locked_until: null,
      })
      .eq("id", claim.id)
    if (error) throw error
    return true
  } catch (error) {
    const paused = error instanceof PlatformAiPausedError
    await admin
      .from("reputation_claims")
      .update(
        paused
          ? { ai_status: "pending", ai_locked_until: new Date(now.getTime() + 10 * MINUTE).toISOString() }
          : { ai_status: "failed", ai_error: aiErrorText(error), ai_locked_until: null, ai_analyses: claim.ai_analyses + 1 }
      )
      .eq("id", claim.id)
    if (!paused) console.error("[reputação] IA da reclamação " + claim.claim_id + ":", errorMessage(error))
    return false
  }
}

/** Reserva a análise (pending → processing). Devolve a linha reservada ou null. */
async function lockAnalysis(claimId: string, now: Date) {
  const { data, error } = await createServiceClient()
    .from("reputation_claims")
    .update({ ai_status: "processing", ai_locked_until: new Date(now.getTime() + AI_LOCK_MS).toISOString() })
    .eq("id", claimId)
    .or("ai_status.eq.pending,and(ai_status.eq.processing,ai_locked_until.lt." + now.toISOString() + ")")
    .or("ai_locked_until.is.null,ai_locked_until.lt." + now.toISOString())
    .select("*")
    .maybeSingle()
  if (error) throw error
  return data
}

/** Fila da IA (no fim de cada rodada do cron): até 3 análises, só de organizações com acesso. */
export async function processClaimAnalyses(deadline: number, now: Date = new Date()): Promise<number> {
  const { data, error } = await createServiceClient()
    .from("reputation_claims")
    .select("id, organizations!inner(trial_ends_at, subscription_status, billing_exempt, current_period_end)")
    .or("ai_status.eq.pending,and(ai_status.eq.processing,ai_locked_until.lt." + now.toISOString() + ")")
    .or("ai_locked_until.is.null,ai_locked_until.lt." + now.toISOString())
    .order("updated_at", { ascending: true })
    .limit(10)
  if (error) throw error
  let done = 0
  for (const row of data) {
    // Cada análise leva até ~20 s: só começa se ainda couber antes do fim da rodada (a função tem 60 s).
    if (done >= ANALYSES_PER_RUN || deadline - Date.now() < ANALYSIS_MIN_MS) break
    if (!row.organizations || computeAccess(row.organizations).state === "blocked") continue
    const claim = await lockAnalysis(row.id, now)
    if (!claim) continue
    if (claim.ai_analyses >= MAX_CLAIM_ANALYSES) {
      await createServiceClient().from("reputation_claims").update({ ai_status: "skipped", ai_locked_until: null }).eq("id", claim.id)
      continue
    }
    if (await analyzeClaim(claim, now)) done++
  }
  return done
}

/** "Gerar análise agora" (tela da reclamação). */
export async function analyzeClaimNow(claimRowId: string): Promise<{ ok: boolean; message: string }> {
  const admin = createServiceClient()
  const { data: claim, error } = await admin.from("reputation_claims").select("id, ai_analyses, ai_status").eq("id", claimRowId).single()
  if (error) throw error
  if (claim.ai_analyses >= MAX_CLAIM_ANALYSES) {
    return { ok: false, message: "Esta reclamação já teve as " + MAX_CLAIM_ANALYSES + " análises da IA." }
  }
  if (claim.ai_status === "processing") return { ok: false, message: "A análise já está em andamento. Aguarde um instante." }
  const { error: queueError } = await admin
    .from("reputation_claims")
    .update({ ai_status: "pending", ai_locked_until: null })
    .eq("id", claimRowId)
  if (queueError) throw queueError
  const locked = await lockAnalysis(claimRowId, new Date())
  if (!locked) return { ok: false, message: "A análise já está em andamento. Aguarde um instante." }
  const ok = await analyzeClaim(locked)
  return ok ? { ok: true, message: "Análise pronta." } : { ok: false, message: "A IA não conseguiu analisar agora. Tente de novo." }
}

// ---------------------------------------------------------------------------------------------- ações do vendedor

type LoadedClaim = { claim: ClaimRow; account: ReputationAccount }

async function loadClaim(organizationId: string, claimRowId: string): Promise<LoadedClaim | null> {
  const { data: claim, error } = await createServiceClient()
    .from("reputation_claims")
    .select("*")
    .eq("id", claimRowId)
    .eq("organization_id", organizationId)
    .maybeSingle()
  if (error) throw error
  if (!claim) return null
  const account = (await loadAccounts([claim.ml_account_id])).get(claim.ml_account_id)
  return account ? { claim, account } : null
}

/** Lê a reclamação de novo no ML (depois de uma ação ou ao abrir as ofertas). */
export async function syncClaimNow(organizationId: string, claimRowId: string) {
  const loaded = await loadClaim(organizationId, claimRowId)
  if (!loaded) return
  const budget = new CallBudget(12)
  await syncClaimDetails(loaded.account, loaded.claim, budget, new Date())
  const affects = await optional(() => fetchClaimAffects(loaded.account.id, Number(loaded.claim.claim_id), budget))
  if (affects) {
    const reading = readAffects(affects)
    await createServiceClient()
      .from("reputation_claims")
      .update({
        affects_reputation: reading.affects ?? loaded.claim.affects_reputation,
        has_incentive: reading.hasIncentive,
        affects_due_at: reading.dueAt,
        affects_checked_at: new Date().toISOString(),
      })
      .eq("id", claimRowId)
  }
  await refreshClaimAlerts(loaded.account)
}

export type ClaimActionInput =
  | { kind: "message_buyer" | "message_mediator"; message: string; files: File[] }
  | { kind: "refund" | "allow_return" | "open_dispute" }
  | { kind: "partial_refund"; percentage: number }

export type ClaimActionResult = { ok: boolean; message: string }

const ACTION_RECORD: Record<ClaimActionKind, Database["public"]["Tables"]["reputation_claim_actions"]["Insert"]["action"]> = {
  message_buyer: "send_message",
  message_mediator: "send_message",
  refund: "refund",
  partial_refund: "partial_refund",
  allow_return: "allow_return",
  open_dispute: "open_dispute",
}

const SUCCESS: Record<ClaimActionKind, string> = {
  message_buyer: "Mensagem enviada ao comprador.",
  message_mediator: "Mensagem enviada ao mediador.",
  refund: "Pronto: o Mercado Livre vai devolver o dinheiro ao comprador.",
  partial_refund: "Oferta de reembolso parcial enviada ao comprador.",
  allow_return: "Devolução aceita: o comprador recebe a etiqueta para devolver.",
  open_dispute: "Mediação pedida: o Mercado Livre vai intervir.",
}

function friendlyMlError(error: unknown): string {
  if (error instanceof MlApiError) {
    if (error.status === 429) return "O Mercado Livre pediu para esperar um pouco. Tente de novo em instantes."
    if (error.status === 401 || error.status === 403) return "O Mercado Livre não permitiu esta ação agora (" + error.message.replace(/^Mercado Livre: /, "") + ")."
    return "O Mercado Livre recusou: " + error.message.replace(/^Mercado Livre: /, "")
  }
  return "Não foi possível falar com o Mercado Livre agora. Tente de novo."
}

/**
 * Executa uma ação numa reclamação, a pedido do vendedor: confere no ML se a ação ainda está liberada, executa, grava no
 * histórico imutável (sucesso ou falha) e lê a reclamação de novo. Dinheiro e mediação: só dono/administrador (a tela e
 * a Server Action conferem antes).
 */
export async function executeClaimAction(input: {
  organizationId: string
  userId: string
  claimRowId: string
  canManage: boolean
  action: ClaimActionInput
}): Promise<ClaimActionResult> {
  const loaded = await loadClaim(input.organizationId, input.claimRowId)
  if (!loaded) return { ok: false, message: "Reclamação não encontrada." }
  const { claim, account } = loaded
  const kind = input.action.kind
  if (isRestrictedAction(kind) && !input.canManage) {
    return { ok: false, message: "Só o dono ou um administrador da loja pode fazer esta ação." }
  }

  let details: Record<string, unknown> = {}
  if (input.action.kind === "message_buyer" || input.action.kind === "message_mediator") {
    const invalid = validateClaimMessage(input.action.message) ?? validateAttachments(input.action.files)
    if (invalid) return { ok: false, message: invalid }
  }

  const budget = new CallBudget(15)
  const claimId = Number(claim.claim_id)
  let mlStatus: number | null = null
  try {
    // A ação ainda está liberada? (A tela pode estar desatualizada.)
    const current = toClaimRow(await fetchClaim(account.id, claimId, budget), account.ml_user_id)
    const available = claimActions(current?.seller_actions ?? [], current?.status ?? claim.status).available
    if (!available.some((action) => action.kind === kind)) {
      await syncClaimNow(input.organizationId, input.claimRowId).catch(() => {})
      return { ok: false, message: "Esta ação não está mais disponível no Mercado Livre. Atualizamos a reclamação." }
    }

    let response: unknown = null
    if (input.action.kind === "message_buyer" || input.action.kind === "message_mediator") {
      const names: string[] = []
      for (const file of input.action.files) {
        names.push(await uploadClaimAttachment(account.id, claimId, file, sanitizeAttachmentName(file.name, file.type), budget))
      }
      const receiverRole = input.action.kind === "message_buyer" ? "complainant" : "mediator"
      details = { message: input.action.message.trim(), attachments: names }
      response = (
        await sendClaimMessage(account.id, claimId, { receiverRole, message: input.action.message.trim(), attachments: names }, budget)
      ).body
    } else if (input.action.kind === "partial_refund") {
      const offers = parsePartialRefundOffers(await fetchPartialRefundOffers(account.id, claimId, budget))
      const offer = offers.offers.find((item) => item.percentage === (input.action as { percentage: number }).percentage)
      if (!offer) return { ok: false, message: "Esse percentual não está entre as ofertas do Mercado Livre agora." }
      details = { percentage: offer.percentage, amount: offer.amount, currency: offers.currency }
      response = (await partialRefundClaim(account.id, claimId, offer.percentage, budget)).body
    } else if (input.action.kind === "refund") {
      const summary = claim.order_summary as OrderSummary | null
      details = { amount: summary?.total_amount ?? null, currency: summary?.currency_id ?? null }
      response = (await refundClaim(account.id, claimId, budget)).body
    } else if (input.action.kind === "allow_return") {
      response = (await allowReturnClaim(account.id, claimId, budget)).body
    } else {
      response = (await openClaimDispute(account.id, claimId, budget)).body
    }
    mlStatus = 200
    await recordAction({ claim, userId: input.userId, kind, details, status: "success", mlStatus, response })
  } catch (error) {
    mlStatus = error instanceof MlApiError ? error.status : null
    await recordAction({ claim, userId: input.userId, kind, details, status: "failed", mlStatus, error: errorMessage(error) })
    console.error("[reputação] ação " + kind + " na reclamação " + claimId + ":", errorMessage(error))
    return { ok: false, message: friendlyMlError(error) }
  }

  await syncClaimNow(input.organizationId, input.claimRowId).catch((error) =>
    console.error("[reputação] reler reclamação " + claimId + ":", errorMessage(error))
  )
  return { ok: true, message: SUCCESS[kind] }
}

async function recordAction(input: {
  claim: ClaimRow
  userId: string
  kind: ClaimActionKind | "exclusion_requested"
  details: Record<string, unknown>
  status: "success" | "failed"
  mlStatus?: number | null
  response?: unknown
  error?: string
}) {
  const response = input.response === undefined || input.response === null ? null : JSON.stringify(input.response)
  const { error } = await createServiceClient()
    .from("reputation_claim_actions")
    .insert({
      organization_id: input.claim.organization_id,
      ml_account_id: input.claim.ml_account_id,
      claim_row_id: input.claim.id,
      claim_id: Number(input.claim.claim_id),
      action: input.kind === "exclusion_requested" ? "exclusion_requested" : ACTION_RECORD[input.kind],
      receiver_role: input.kind === "message_buyer" ? "complainant" : input.kind === "message_mediator" ? "mediator" : null,
      details: input.details as Json,
      status: input.status,
      ml_status: input.mlStatus ?? null,
      ml_response: response && response.length <= 7000 ? (JSON.parse(response) as Json) : null,
      error: input.error?.slice(0, 500) ?? null,
      performed_by: input.userId,
    })
  // O histórico não pode impedir a resposta ao vendedor, mas a falha precisa aparecer nos logs.
  if (error) console.error("[reputação] histórico da ação:", error.message)
}

/** Ofertas de reembolso parcial do ML (para a tela escolher). */
export async function partialRefundOffersFor(organizationId: string, claimRowId: string): Promise<PartialRefundOffers | null> {
  const loaded = await loadClaim(organizationId, claimRowId)
  if (!loaded) return null
  return parsePartialRefundOffers(
    await fetchPartialRefundOffers(loaded.account.id, Number(loaded.claim.claim_id), new CallBudget(2))
  )
}

/** "Pedi a exclusão": registra o pedido (feito pelo vendedor no ML) e passa a acompanhar se a reclamação deixa de contar. */
export async function markExclusionRequested(input: { organizationId: string; userId: string; claimRowId: string }) {
  const loaded = await loadClaim(input.organizationId, input.claimRowId)
  if (!loaded) return { ok: false, message: "Reclamação não encontrada." }
  if (loaded.claim.exclusion_requested_at) return { ok: true, message: "O pedido de exclusão já estava registrado." }
  const now = new Date()
  const { error } = await createServiceClient()
    .from("reputation_claims")
    .update({ exclusion_requested_at: now.toISOString(), exclusion_requested_by: input.userId, affects_checked_at: null })
    .eq("id", loaded.claim.id)
  if (error) throw error
  const analysis = readClaimAnalysis(loaded.claim.ai_result)
  await recordAction({
    claim: loaded.claim,
    userId: input.userId,
    kind: "exclusion_requested",
    details: { exclusion_case: analysis?.exclusionCase ?? null },
    status: "success",
  })
  await refreshClaimAlerts(loaded.account, now)
  return { ok: true, message: "Anotado. Avisamos aqui quando a reclamação deixar de contar." }
}
