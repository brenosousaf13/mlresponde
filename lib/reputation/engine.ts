import "server-only"

import { PURCHASE_STATUSES } from "@/lib/customers/orders"
import { emailEnabled, sendEmail } from "@/lib/email/resend"
import { dayKey } from "@/lib/format"
import { MlAccountUnavailableError } from "@/lib/mercadolivre/accounts"
import { MlApiError } from "@/lib/mercadolivre/api"
import {
  BudgetExhaustedError,
  CallBudget,
  fetchClaimAffects,
  fetchOrderDate,
  fetchSellerReputation,
  fetchShipmentCosts,
  fetchShipmentInfo,
  fetchShipmentSla,
  searchSellerClaims,
} from "@/lib/mercadolivre/reputation"
import {
  ALERT_SEVERITY,
  REPUTATION_ALERT_KINDS,
  SHIPMENT_ALERT_KINDS,
  colorAlertStillValid,
  planAlertChanges,
  planEmails,
  reputationAlerts,
  shipmentAlerts,
  type AlertDraft,
  type AlertKind,
  type ExistingAlert,
} from "@/lib/reputation/alerts"
import {
  REPUTATION_CLAIM_TYPES,
  claimsBackfillSince,
  countsForReputation,
  mlRangeDate,
  readAffects,
  toClaimRow,
  type ClaimRow,
} from "@/lib/reputation/claims"
import { buildAlertEmail, claimLink, reputationUrl } from "@/lib/reputation/email"
import { computeSlack, readReputation, reputationRaw, reputationSignature } from "@/lib/reputation/metrics"
import { classifyShipment, nextShipmentCheck, readShipmentCosts, readSla, shipmentRisk } from "@/lib/reputation/shipments"
import type { ReputationColor } from "@/lib/reputation/thresholds"
import type { Database, Json } from "@/lib/supabase/database.types"
import { createServiceClient } from "@/lib/supabase/admin"

// Escudo de Reputação: rodadas por conta (termômetro, despachos, reclamações), alertas e e-mails. Regras puras em
// lib/reputation/{metrics,shipments,claims,alerts,email}.ts. Só LÊ ml_accounts e ml_orders; escreve só nas tabelas
// reputation_* (migração 20261019230000_reputacao.sql).

type SyncRow = Database["public"]["Tables"]["reputation_sync"]["Row"]
type SyncUpdate = Database["public"]["Tables"]["reputation_sync"]["Update"]
type ShipmentUpdate = Database["public"]["Tables"]["reputation_shipments"]["Update"]
type ClaimUpdate = Database["public"]["Tables"]["reputation_claims"]["Update"]

export type ReputationAccount = { id: string; organization_id: string; ml_user_id: number; nickname: string | null }

export const REPUTATION_CRON_LIMITS = {
  accounts: 20,
  /** Chamadas ao ML por rodada (todas as contas). */
  calls: 80,
  concurrency: 3,
  /** Tempo máximo da rodada antes de deixar o resto para o próximo minuto. */
  budgetMs: 45_000,
} as const

const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE
const INTERVALS = {
  reputation: 30 * MINUTE,
  shipments: 10 * MINUTE,
  claims: 5 * MINUTE,
  /** Parte que não terminou (limite de chamadas): volta no próximo minuto. */
  unfinished: MINUTE,
  error: 5 * MINUTE,
  rateLimited: 2 * MINUTE,
  accountUnavailable: 30 * MINUTE,
} as const

/** Vendas pagas dos últimos 15 dias entram nos despachos; a conferência segue até 30 dias da venda. */
const NEW_SHIPMENTS_DAYS = 15
const TRACK_SHIPMENTS_DAYS = 30
const SHIPMENT_CHECKS_PER_RUN = 40
const COSTS_PER_RUN = 30
const CLAIM_PAGE_SIZE = 100
const CLAIM_BACKFILL_PAGES = 10
const CLAIM_POLL_PAGES = 3
const CLAIM_ENRICH_PER_RUN = 40

function errorMessage(error: unknown) {
  const text = error instanceof Error ? error.message : String(error)
  return text.replace(/\s+/g, " ").trim().slice(0, 500) || "Erro desconhecido."
}

/** Interrompe a parte e a conta: limite de chamadas, 429 ou conta sem token. */
export function isStopError(error: unknown) {
  return (
    error instanceof BudgetExhaustedError ||
    error instanceof MlAccountUnavailableError ||
    (error instanceof MlApiError && error.status === 429)
  )
}

/** Erro 4xx definitivo do ML (não adianta tentar de novo agora). */
export function isClientError(error: unknown) {
  return error instanceof MlApiError && error.status >= 400 && error.status < 500 && error.status !== 429
}

function iso(time: number) {
  return new Date(time).toISOString()
}

// ---------------------------------------------------------------------------------------------- alertas

/** Grava as mudanças dos alertas de uma conta (abrir, atualizar, reabrir, resolver) para os tipos avaliados. */
export async function applyAlerts(
  account: ReputationAccount,
  drafts: readonly AlertDraft[],
  scope: readonly AlertKind[],
  stillValid?: (alert: ExistingAlert) => boolean,
  now: Date = new Date()
) {
  const admin = createServiceClient()
  const columns = "id, kind, dedupe_key, status, opened_at, resolved_at, expires_at, email_status, data, title, body"
  const [open, previous] = await Promise.all([
    admin.from("reputation_alerts").select(columns).eq("ml_account_id", account.id).eq("status", "open").in("kind", [...scope]),
    drafts.length
      ? admin
          .from("reputation_alerts")
          .select(columns)
          .eq("ml_account_id", account.id)
          .eq("status", "resolved")
          .in("dedupe_key", drafts.map((draft) => draft.key))
      : Promise.resolve({ data: [], error: null }),
  ])
  if (open.error) throw open.error
  if (previous.error) throw previous.error
  const existing = [...open.data, ...previous.data]
  const byId = new Map(existing.map((alert) => [alert.id, alert]))
  const plan = planAlertChanges({ existing, drafts, scope, stillValid, now })
  const at = now.toISOString()
  const fields = (draft: AlertDraft) => ({
    title: draft.title,
    body: draft.body,
    data: draft.data as Json,
    expires_at: draft.expiresAt ?? null,
  })
  const urgent = (draft: AlertDraft) => ALERT_SEVERITY[draft.kind] === "urgent"

  if (plan.inserts.length) {
    const { error } = await admin.from("reputation_alerts").upsert(
      plan.inserts.map((draft) => ({
        organization_id: account.organization_id,
        ml_account_id: account.id,
        kind: draft.kind,
        dedupe_key: draft.key,
        severity: ALERT_SEVERITY[draft.kind],
        ...fields(draft),
        email_status: urgent(draft) ? "pending" : null,
      })),
      { onConflict: "ml_account_id,dedupe_key", ignoreDuplicates: true }
    )
    if (error) throw error
  }
  const updates: PromiseLike<{ error: unknown }>[] = []
  for (const { id, draft } of plan.reopenLoud) {
    updates.push(
      admin
        .from("reputation_alerts")
        .update({
          ...fields(draft),
          status: "open",
          opened_at: at,
          last_seen_at: at,
          resolved_at: null,
          email_status: urgent(draft) ? "pending" : null,
          emailed_at: null,
          email_error: null,
        })
        .eq("id", id)
    )
  }
  for (const { id, draft } of plan.reopenSilent) {
    updates.push(
      admin.from("reputation_alerts").update({ ...fields(draft), status: "open", last_seen_at: at, resolved_at: null }).eq("id", id)
    )
  }
  for (const { id, draft } of plan.refresh) {
    const current = byId.get(id)
    if (current && current.title === draft.title && current.body === draft.body) continue
    updates.push(admin.from("reputation_alerts").update({ ...fields(draft), last_seen_at: at }).eq("id", id))
  }
  for (const { id, skipEmail } of plan.resolve) {
    updates.push(
      admin
        .from("reputation_alerts")
        .update({
          status: "resolved",
          resolved_at: at,
          ...(skipEmail ? { email_status: "skipped", email_error: "Resolvido antes do envio." } : {}),
        })
        .eq("id", id)
    )
  }
  for (const result of await Promise.all(updates)) if (result.error) throw result.error
}

// ---------------------------------------------------------------------------------------------- termômetro

async function latestSnapshot(accountId: string) {
  const { data, error } = await createServiceClient()
    .from("reputation_snapshots")
    .select("color, signature, captured_at, period_days")
    .eq("ml_account_id", accountId)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

/** Termômetro: lê o ML, grava 1 registro por dia (ou a cada mudança) e avalia folga e mudança de cor. */
export async function syncReputation(account: ReputationAccount, budget: CallBudget, now: Date = new Date()) {
  const raw = await fetchSellerReputation(account.id, account.ml_user_id, budget)
  const reading = readReputation(raw)
  const signature = reputationSignature(reading)
  const latest = await latestSnapshot(account.id)

  if (!latest || latest.signature !== signature || dayKey(latest.captured_at) !== dayKey(now)) {
    const { error } = await createServiceClient()
      .from("reputation_snapshots")
      .insert({
        organization_id: account.organization_id,
        ml_account_id: account.id,
        captured_at: now.toISOString(),
        level_id: reading.levelId,
        color: reading.color,
        power_seller_status: reading.powerSellerStatus,
        protected: reading.protected,
        protection_end_date: reading.protectionEndDate,
        real_color: reading.realColor,
        period_days: reading.periodDays,
        sales_completed: reading.salesCompleted,
        claims_value: reading.metrics.claims.value,
        claims_rate: reading.metrics.claims.rate,
        cancellations_value: reading.metrics.cancellations.value,
        cancellations_rate: reading.metrics.cancellations.rate,
        delayed_value: reading.metrics.delayed.value,
        delayed_rate: reading.metrics.delayed.rate,
        signature,
        raw: reputationRaw(raw) as Json,
      })
    if (error) throw error
  }

  const drafts = reputationAlerts({
    previousColor: (latest?.color as ReputationColor | undefined) ?? null,
    color: reading.color,
    slack: computeSlack(reading),
    periodDays: reading.periodDays,
    now,
  })
  await applyAlerts(account, drafts, REPUTATION_ALERT_KINDS, (alert) => colorAlertStillValid(alert, reading.color), now)
}

// ---------------------------------------------------------------------------------------------- despachos

type OrderItem = { title?: unknown }

/** Vendas pagas recentes (de ml_orders, só leitura) viram envios a acompanhar. */
async function registerNewShipments(account: ReputationAccount, now: Date) {
  const admin = createServiceClient()
  const { data: orders, error } = await admin
    .from("ml_orders")
    .select("ml_order_id, pack_id, shipment_id, ordered_at, items")
    .eq("ml_account_id", account.id)
    .gte("ordered_at", iso(now.getTime() - NEW_SHIPMENTS_DAYS * DAY))
    .not("shipment_id", "is", null)
    .in("status", [...PURCHASE_STATUSES])
    .order("ordered_at", { ascending: true })
    .limit(1000)
  if (error) throw error
  if (!orders.length) return

  const byShipment = new Map<number, (typeof orders)[number]>()
  for (const order of orders) {
    const shipmentId = Number(order.shipment_id)
    if (shipmentId > 0 && !byShipment.has(shipmentId)) byShipment.set(shipmentId, order)
  }
  const rows = [...byShipment.entries()].map(([shipmentId, order]) => {
    const items = Array.isArray(order.items) ? (order.items as OrderItem[]) : []
    const title = typeof items[0]?.title === "string" ? items[0].title.slice(0, 300) : null
    return {
      organization_id: account.organization_id,
      ml_account_id: account.id,
      shipment_id: shipmentId,
      ml_order_id: Number(order.ml_order_id),
      pack_id: order.pack_id ? Number(order.pack_id) : null,
      item_title: title,
      ordered_at: order.ordered_at,
      // Já vencido nesta rodada (o padrão now() do banco seria depois do "agora" da rodada).
      next_check_at: now.toISOString(),
    }
  })
  for (let index = 0; index < rows.length; index += 200) {
    const { error: upsertError } = await admin
      .from("reputation_shipments")
      .upsert(rows.slice(index, index + 200), { onConflict: "ml_account_id,shipment_id", ignoreDuplicates: true })
    if (upsertError) throw upsertError
  }
}

/** Despachos: novos envios, situação e prazo dos que esperam o vendedor, custo do frete e alertas. true = terminou. */
export async function syncShipments(account: ReputationAccount, budget: CallBudget, now: Date = new Date()): Promise<boolean> {
  const admin = createServiceClient()
  await registerNewShipments(account, now)
  let complete = true
  let stop: unknown = null

  const { data: due, error: dueError } = await admin
    .from("reputation_shipments")
    .select("id, shipment_id, stage, shipped_at, check_attempts")
    .eq("ml_account_id", account.id)
    .in("stage", ["pending", "waiting"])
    .lte("next_check_at", now.toISOString())
    .gte("ordered_at", iso(now.getTime() - TRACK_SHIPMENTS_DAYS * DAY))
    .order("next_check_at", { ascending: true })
    .limit(SHIPMENT_CHECKS_PER_RUN)
  if (dueError) throw dueError
  if (due.length === SHIPMENT_CHECKS_PER_RUN) complete = false

  for (const row of due) {
    try {
      const shipment = classifyShipment(await fetchShipmentInfo(account.id, row.shipment_id, budget))
      const fields: ShipmentUpdate = {
        stage: shipment.stage,
        status: shipment.status,
        substatus: shipment.substatus,
        logistic_type: shipment.logisticType,
        checked_at: now.toISOString(),
        check_attempts: 0,
      }
      if (shipment.stage === "waiting") {
        const sla = readSla(await fetchShipmentSla(account.id, row.shipment_id, budget))
        fields.sla_status = sla.status
        fields.sla_service = sla.service
        fields.sla_expected_at = sla.expectedAt
        fields.next_check_at = nextShipmentCheck("waiting", shipmentRisk(sla.expectedAt, now), now)?.toISOString()
      } else {
        if (shipment.stage === "shipped" && !row.shipped_at) fields.shipped_at = now.toISOString()
        fields.next_check_at = iso(now.getTime() + TRACK_SHIPMENTS_DAYS * DAY)
      }
      const { error } = await admin.from("reputation_shipments").update(fields).eq("id", row.id)
      if (error) throw error
    } catch (error) {
      if (isStopError(error)) {
        stop = error
        complete = false
        break
      }
      const notFound = error instanceof MlApiError && error.status === 404
      const { error: saveError } = await admin
        .from("reputation_shipments")
        .update(
          notFound
            ? { stage: "cancelled", status: "not_found", checked_at: now.toISOString() }
            : { check_attempts: row.check_attempts + 1, next_check_at: iso(now.getTime() + INTERVALS.shipments) }
        )
        .eq("id", row.id)
      if (saveError) throw saveError
      if (!notFound) console.error("[reputação] envio " + row.shipment_id + ":", errorMessage(error))
    }
  }

  if (!stop) {
    const { data: costRows, error: costsError } = await admin
      .from("reputation_shipments")
      .select("id, shipment_id")
      .eq("ml_account_id", account.id)
      .is("costs_checked_at", null)
      .in("stage", ["shipped", "fulfillment"])
      .gte("ordered_at", iso(now.getTime() - 30 * DAY))
      .order("ordered_at", { ascending: false })
      .limit(COSTS_PER_RUN)
    if (costsError) throw costsError
    if (costRows.length === COSTS_PER_RUN) complete = false
    for (const row of costRows) {
      try {
        const costs = readShipmentCosts(await fetchShipmentCosts(account.id, row.shipment_id, budget), account.ml_user_id)
        const { error } = await admin
          .from("reputation_shipments")
          .update({
            costs_checked_at: now.toISOString(),
            sender_cost: costs.senderCost,
            sender_discount: costs.senderDiscount,
            gross_amount: costs.grossAmount,
            currency_id: "BRL",
          })
          .eq("id", row.id)
        if (error) throw error
      } catch (error) {
        if (isStopError(error)) {
          stop = error
          complete = false
          break
        }
        if (isClientError(error)) {
          const { error: saveError } = await admin
            .from("reputation_shipments")
            .update({ costs_checked_at: now.toISOString() })
            .eq("id", row.id)
          if (saveError) throw saveError
        } else console.error("[reputação] custo do envio " + row.shipment_id + ":", errorMessage(error))
      }
    }
  }

  // Alertas com o que já se sabe (o risco anda com o relógio, sem chamar o ML).
  const { data: waiting, error: waitingError } = await admin
    .from("reputation_shipments")
    .select("shipment_id, sla_expected_at, item_title, ml_order_id, pack_id")
    .eq("ml_account_id", account.id)
    .eq("stage", "waiting")
    .gte("ordered_at", iso(now.getTime() - TRACK_SHIPMENTS_DAYS * DAY))
  if (waitingError) throw waitingError
  await applyAlerts(account, shipmentAlerts(waiting, now), SHIPMENT_ALERT_KINDS, undefined, now)

  if (stop) throw stop
  return complete
}

// ---------------------------------------------------------------------------------------------- reclamações

/** Grava as reclamações da busca. Alterada no ML = confere de novo se afeta a reputação. Devolve as novas/alteradas. */
async function upsertClaims(account: ReputationAccount, rows: readonly ClaimRow[]): Promise<ClaimRow[]> {
  if (!rows.length) return []
  const admin = createServiceClient()
  const { data: existing, error } = await admin
    .from("reputation_claims")
    .select("claim_id, ml_updated_at")
    .eq("ml_account_id", account.id)
    .in("claim_id", rows.map((row) => row.claim_id))
  if (error) throw error
  const known = new Map(existing.map((row) => [Number(row.claim_id), row.ml_updated_at]))
  const changed = rows.filter((row) => {
    if (!known.has(row.claim_id)) return true
    const before = known.get(row.claim_id)
    return !before || !row.ml_updated_at || Date.parse(row.ml_updated_at) > Date.parse(before)
  })
  if (!changed.length) return []
  const { error: upsertError } = await admin.from("reputation_claims").upsert(
    changed.map((row) => ({
      organization_id: account.organization_id,
      ml_account_id: account.id,
      ...row,
      seller_actions: row.seller_actions as unknown as Json,
      resolution: row.resolution as Json | null,
      ...(known.has(row.claim_id) && countsForReputation(row.type) ? { affects_checked_at: null } : {}),
    })),
    { onConflict: "ml_account_id,claim_id" }
  )
  if (upsertError) throw upsertError
  return changed
}

/** Reclamações: primeiro o período inteiro (+30 dias), depois só as alteradas. complete = nada ficou para a próxima. */
export async function syncClaims(
  account: ReputationAccount,
  sync: Pick<SyncRow, "claims_backfilled_at" | "last_claims_at">,
  budget: CallBudget,
  now: Date = new Date()
): Promise<{ complete: boolean; changed: ClaimRow[] }> {
  const admin = createServiceClient()
  const backfill = !sync.claims_backfilled_at || !sync.last_claims_at
  let params: Record<string, string>
  if (backfill) {
    const latest = await latestSnapshot(account.id)
    params = { range: "date_created:after:" + mlRangeDate(claimsBackfillSince(latest?.period_days ?? null, now)), sort: "date_created:desc" }
  } else {
    const since = Date.parse(sync.last_claims_at as string) - 10 * MINUTE
    params = { range: "last_updated:after:" + mlRangeDate(new Date(since)), sort: "last_updated:desc" }
  }
  const maxPages = backfill ? CLAIM_BACKFILL_PAGES : CLAIM_POLL_PAGES
  const changed: ClaimRow[] = []
  let searchDone = false
  for (let page = 0; page < maxPages; page++) {
    const result = await searchSellerClaims(
      account.id,
      account.ml_user_id,
      { ...params, limit: String(CLAIM_PAGE_SIZE), offset: String(page * CLAIM_PAGE_SIZE) },
      budget
    )
    const data = result.data ?? []
    changed.push(...(await upsertClaims(account, data.flatMap((claim) => toClaimRow(claim, account.ml_user_id) ?? []))))
    const total = Number(result.paging?.total ?? 0) || 0
    if (data.length < CLAIM_PAGE_SIZE || (page + 1) * CLAIM_PAGE_SIZE >= total) {
      searchDone = true
      break
    }
  }
  // Na busca inicial, mais de 1.000 reclamações no período: fica com as mais recentes (o resto é antigo demais).
  if (backfill && !searchDone) console.warn("[reputação] conta " + account.id + ": mais de 1.000 reclamações no período")

  // Tipos que não contam na reputação (cancelamentos, trocas, Full...): não precisam de conferência.
  const { error: otherError } = await admin
    .from("reputation_claims")
    .update({ affects_checked_at: now.toISOString() })
    .eq("ml_account_id", account.id)
    .is("affects_checked_at", null)
    .not("type", "in", "(" + REPUTATION_CLAIM_TYPES.join(",") + ")")
  if (otherError) throw otherError

  const complete = await enrichClaims(account, budget, now)
  return { complete, changed }
}

/** Afeta a reputação? Data da venda? (1 vez e de novo quando mudar; as que contam, 1 vez por dia.) */
async function enrichClaims(account: ReputationAccount, budget: CallBudget, now: Date): Promise<boolean> {
  const admin = createServiceClient()
  const dayAgo = iso(now.getTime() - DAY)
  const { data: pending, error } = await admin
    .from("reputation_claims")
    .select("id, claim_id, type, resource, resource_id, ml_created_at, sale_at, affects_reputation, enrich_attempts")
    .eq("ml_account_id", account.id)
    .in("type", [...REPUTATION_CLAIM_TYPES])
    .or("affects_checked_at.is.null,and(affects_reputation.eq.affected,affects_checked_at.lt." + dayAgo + ")")
    .order("ml_created_at", { ascending: false })
    .limit(CLAIM_ENRICH_PER_RUN)
  if (error) throw error

  const orderIds = pending.flatMap((claim) =>
    claim.resource === "order" && claim.resource_id && !claim.sale_at ? [Number(claim.resource_id)] : []
  )
  const known = new Map<number, string | null>()
  if (orderIds.length) {
    const { data: orders, error: ordersError } = await admin
      .from("ml_orders")
      .select("ml_order_id, ordered_at")
      .eq("ml_account_id", account.id)
      .in("ml_order_id", orderIds)
    if (ordersError) throw ordersError
    for (const order of orders) known.set(Number(order.ml_order_id), order.ordered_at)
  }

  for (const claim of pending) {
    const fields: ClaimUpdate = { affects_checked_at: now.toISOString() }
    try {
      try {
        const affects = readAffects(await fetchClaimAffects(account.id, Number(claim.claim_id), budget))
        fields.affects_reputation = affects.affects
        fields.has_incentive = affects.hasIncentive
        fields.affects_due_at = affects.dueAt
      } catch (error) {
        // 4xx em reclamação antiga ("Claims 1.0") ou de pagamento: sem informação, não tenta de novo agora.
        if (!isClientError(error)) throw error
        fields.affects_reputation = claim.affects_reputation === "affected" ? "affected" : null
      }
      if (!claim.sale_at) {
        const orderId = claim.resource === "order" && claim.resource_id ? Number(claim.resource_id) : null
        let saleAt = orderId ? (known.get(orderId) ?? null) : null
        if (orderId && !saleAt) {
          try {
            saleAt = await fetchOrderDate(account.id, orderId, budget)
          } catch (error) {
            if (!isClientError(error)) throw error
          }
        }
        fields.sale_at = saleAt ? new Date(saleAt).toISOString() : claim.ml_created_at
        fields.sale_source = saleAt ? "order" : "claim"
      }
      fields.enrich_attempts = 0
    } catch (error) {
      if (isStopError(error)) throw error
      fields.affects_checked_at = null
      fields.enrich_attempts = claim.enrich_attempts + 1
      // Depois de 5 falhas, desiste por hoje (fica como "não sei se conta").
      if (claim.enrich_attempts + 1 >= 5) fields.affects_checked_at = now.toISOString()
      console.error("[reputação] reclamação " + claim.claim_id + ":", errorMessage(error))
    }
    const { error: saveError } = await admin.from("reputation_claims").update(fields).eq("id", claim.id)
    if (saveError) throw saveError
  }
  return pending.length < CLAIM_ENRICH_PER_RUN
}

// ---------------------------------------------------------------------------------------------- rodada por conta

type Part = {
  key: "reputation" | "shipments" | "claims"
  next: "next_reputation_at" | "next_shipments_at" | "next_claims_at"
  last: "last_reputation_at" | "last_shipments_at" | "last_claims_at"
  interval: number
}

const PARTS: readonly Part[] = [
  { key: "reputation", next: "next_reputation_at", last: "last_reputation_at", interval: INTERVALS.reputation },
  { key: "shipments", next: "next_shipments_at", last: "last_shipments_at", interval: INTERVALS.shipments },
  { key: "claims", next: "next_claims_at", last: "last_claims_at", interval: INTERVALS.claims },
]

/** Ganchos da etapa 2 (reclamações com IA) rodam depois das reclamações; vazio na etapa 1. */
export type ClaimsHook = (account: ReputationAccount, changed: ClaimRow[], budget: CallBudget, now: Date) => Promise<void>

/**
 * Uma conta (já reservada): roda as partes vencidas (ou todas, com force) até o limite de chamadas ou de tempo e solta a
 * trava. Erros ficam em reputation_sync.last_error e a parte volta em 5 min (429: 2 min; conta sem token: 30 min).
 */
export async function syncAccount(
  row: SyncRow,
  account: ReputationAccount,
  budget: CallBudget,
  deadline: number,
  options: { force?: boolean; claimsHook?: ClaimsHook } = {}
) {
  const now = new Date()
  const update: SyncUpdate = { locked_until: null }
  let lastError: string | null = null

  for (const part of PARTS) {
    const due = options.force || Date.parse(row[part.next]) <= now.getTime()
    if (!due) continue
    if (budget.exhausted || Date.now() > deadline) {
      update[part.next] = iso(now.getTime() + (budget.rateLimited ? INTERVALS.rateLimited : INTERVALS.unfinished))
      continue
    }
    try {
      let complete = true
      if (part.key === "reputation") await syncReputation(account, budget, now)
      else if (part.key === "shipments") complete = await syncShipments(account, budget, now)
      else {
        const result = await syncClaims(account, row, budget, now)
        complete = result.complete
        if (!row.claims_backfilled_at) update.claims_backfilled_at = now.toISOString()
        if (options.claimsHook) await options.claimsHook(account, result.changed, budget, now)
      }
      update[part.last] = now.toISOString()
      update[part.next] = iso(now.getTime() + (complete ? part.interval : INTERVALS.unfinished))
    } catch (error) {
      if (error instanceof BudgetExhaustedError) {
        update[part.next] = iso(now.getTime() + (budget.rateLimited ? INTERVALS.rateLimited : INTERVALS.unfinished))
        continue
      }
      if (error instanceof MlApiError && error.status === 429) {
        budget.rateLimited = true
        update[part.next] = iso(now.getTime() + INTERVALS.rateLimited)
        continue
      }
      lastError = errorMessage(error)
      if (error instanceof MlAccountUnavailableError) {
        for (const other of PARTS) update[other.next] = iso(now.getTime() + INTERVALS.accountUnavailable)
        break
      }
      update[part.next] = iso(now.getTime() + INTERVALS.error)
      console.error("[reputação] " + part.key + " da conta " + account.id + ":", lastError)
    }
  }
  update.last_error = lastError
  update.last_error_at = lastError ? now.toISOString() : null
  const { error } = await createServiceClient().from("reputation_sync").update(update).eq("ml_account_id", account.id)
  if (error) throw error
}

export async function loadAccounts(ids: string[]) {
  if (!ids.length) return new Map<string, ReputationAccount>()
  const { data, error } = await createServiceClient()
    .from("ml_accounts")
    .select("id, organization_id, ml_user_id, nickname")
    .in("id", ids)
  if (error) throw error
  return new Map(data.map((account) => [account.id, { ...account, ml_user_id: Number(account.ml_user_id) }]))
}

async function releaseLock(accountId: string) {
  const { error } = await createServiceClient().from("reputation_sync").update({ locked_until: null }).eq("ml_account_id", accountId)
  if (error) console.error("[reputação] trava da conta " + accountId + ":", error.message)
}

/** Executa task em todos os itens, no máximo limit ao mesmo tempo. */
async function forEachLimit<T>(items: readonly T[], limit: number, task: (item: T) => Promise<unknown>) {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await task(items[next++])
  })
  await Promise.all(workers)
}

// ---------------------------------------------------------------------------------------------- e-mails

async function recipientsFor(organizationId: string): Promise<string[]> {
  const admin = createServiceClient()
  const { data, error } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .in("role", ["owner", "admin"])
  if (error) throw error
  const emails = await Promise.all(
    data.map(async (member) => {
      const { data: user, error: userError } = await admin.auth.admin.getUserById(member.user_id)
      if (userError || !user.user?.email || user.user.banned_until) return null
      return user.user.email
    })
  )
  return [...new Set(emails.filter((email): email is string => Boolean(email)))]
}

async function markEmail(ids: string[], fields: Database["public"]["Tables"]["reputation_alerts"]["Update"]) {
  if (!ids.length) return
  const { error } = await createServiceClient().from("reputation_alerts").update(fields).in("id", ids).eq("email_status", "pending")
  if (error) throw error
}

/** E-mails dos alertas urgentes pendentes (1 por conta e tipo a cada 30 min). Devolve quantos e-mails saíram. */
export async function sendPendingEmails(deadline: number, now: Date = new Date()): Promise<number> {
  const admin = createServiceClient()
  if (!emailEnabled()) {
    const { error } = await admin
      .from("reputation_alerts")
      .update({ email_status: "skipped", email_error: "E-mails desligados na maanu (sem RESEND_API_KEY)." })
      .eq("email_status", "pending")
    if (error) throw error
    return 0
  }

  const { data: pending, error } = await admin
    .from("reputation_alerts")
    .select("id, organization_id, ml_account_id, kind, status, created_at, opened_at, title, body, data")
    .eq("email_status", "pending")
    .order("created_at", { ascending: true })
    .limit(200)
  if (error) throw error
  if (!pending.length) return 0

  const accountIds = [...new Set(pending.map((alert) => alert.ml_account_id))]
  const organizationIds = [...new Set(pending.map((alert) => alert.organization_id))]
  const [recent, accounts, organizations, settings] = await Promise.all([
    admin
      .from("reputation_alerts")
      .select("ml_account_id, kind, emailed_at")
      .in("ml_account_id", accountIds)
      .gte("emailed_at", iso(now.getTime() - 30 * MINUTE)),
    admin.from("ml_accounts").select("id, nickname, ml_user_id").in("id", accountIds),
    admin.from("organizations").select("id, name").in("id", organizationIds),
    admin.from("reputation_settings").select("organization_id, email_alerts").in("organization_id", organizationIds),
  ])
  if (recent.error) throw recent.error
  if (accounts.error) throw accounts.error
  if (organizations.error) throw organizations.error
  if (settings.error) throw settings.error

  const lastSent = new Map<string, string>()
  for (const row of recent.data) {
    const key = row.ml_account_id + ":" + row.kind
    if (row.emailed_at && (!lastSent.has(key) || row.emailed_at > (lastSent.get(key) as string))) lastSent.set(key, row.emailed_at)
  }
  const plan = planEmails(pending, lastSent, now)
  await markEmail(plan.skip, { email_status: "skipped", email_error: "Resolvido ou antigo demais para e-mail." })

  const disabled = new Set(settings.data.filter((row) => !row.email_alerts).map((row) => row.organization_id))
  const accountName = new Map(accounts.data.map((account) => [account.id, account.nickname || "Conta " + account.ml_user_id]))
  const storeName = new Map(organizations.data.map((organization) => [organization.id, organization.name]))
  const byId = new Map(pending.map((alert) => [alert.id, alert]))
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://app.maanu.com.br"
  const recipients = new Map<string, string[]>()
  let sent = 0

  for (const group of plan.groups) {
    if (Date.now() > deadline) break
    if (disabled.has(group.organizationId)) {
      await markEmail(group.ids, { email_status: "skipped", email_error: "Alertas por e-mail desligados pela loja." })
      continue
    }
    if (!recipients.has(group.organizationId)) recipients.set(group.organizationId, await recipientsFor(group.organizationId))
    const to = recipients.get(group.organizationId) ?? []
    if (!to.length) {
      await markEmail(group.ids, { email_status: "skipped", email_error: "Sem dono ou administrador com e-mail." })
      continue
    }
    const email = buildAlertEmail({
      kind: group.kind,
      accountName: accountName.get(group.accountId) ?? "sua conta",
      storeName: storeName.get(group.organizationId) ?? "sua loja",
      items: group.ids.map((id) => ({ title: byId.get(id)?.title ?? "", body: byId.get(id)?.body ?? "" })),
      url: reputationUrl(siteUrl, group.accountId, claimLink(group.kind, group.ids.map((id) => byId.get(id)?.data))),
    })
    const results = await Promise.all(
      to.map((address, index) => sendEmail({ to: address, ...email, idempotencyKey: "reputacao-" + group.ids[0] + "-" + index }))
    )
    const failure = results.find((result) => !result.ok)
    if (results.some((result) => result.ok)) {
      await markEmail(group.ids, { email_status: "sent", emailed_at: now.toISOString(), email_error: null })
      sent++
    } else {
      const message = failure && !failure.ok ? failure.error : "Falha no envio."
      await markEmail(group.ids, { email_status: "failed", email_error: message })
      console.error("[reputação] e-mail:", message)
    }
  }
  return sent
}

// ---------------------------------------------------------------------------------------------- cron e "atualizar agora"

export type ReputationSyncResult = { accounts: number; emails: number; failures: number; rateLimited: boolean }

/** Cron do Escudo (1 vez por minuto): contas com rodada vencida (até 80 chamadas ao ML) e os e-mails pendentes. */
export async function runReputationSync(options: { claimsHook?: ClaimsHook } = {}): Promise<ReputationSyncResult> {
  const deadline = Date.now() + REPUTATION_CRON_LIMITS.budgetMs
  const budget = new CallBudget(REPUTATION_CRON_LIMITS.calls)
  const result: ReputationSyncResult = { accounts: 0, emails: 0, failures: 0, rateLimited: false }

  try {
    const { data: rows, error } = await createServiceClient().rpc("claim_reputation_sync", {
      p_limit: REPUTATION_CRON_LIMITS.accounts,
      p_lock_seconds: 120,
    })
    if (error) throw error
    const accounts = await loadAccounts((rows ?? []).map((row) => row.ml_account_id))
    await forEachLimit(rows ?? [], REPUTATION_CRON_LIMITS.concurrency, async (row) => {
      const account = accounts.get(row.ml_account_id)
      if (!account || budget.exhausted || Date.now() > deadline) {
        await releaseLock(row.ml_account_id)
        return
      }
      try {
        await syncAccount(row, account, budget, deadline, { claimsHook: options.claimsHook })
        result.accounts++
      } catch (error) {
        result.failures++
        console.error("[reputação] conta " + row.ml_account_id + ":", errorMessage(error))
        await releaseLock(row.ml_account_id)
      }
    })
  } catch (error) {
    result.failures++
    console.error("[reputação] rodada:", errorMessage(error))
  }

  try {
    result.emails = await sendPendingEmails(Date.now() + 10_000)
  } catch (error) {
    result.failures++
    console.error("[reputação] e-mails:", errorMessage(error))
  }
  result.rateLimited = budget.rateLimited
  return result
}

/** "Atualizar agora" na tela: roda tudo de uma conta já (se não estiver em andamento). */
export async function syncAccountNow(
  accountId: string,
  options: { claimsHook?: ClaimsHook } = {}
): Promise<"done" | "busy" | "unavailable"> {
  const { data: rows, error } = await createServiceClient().rpc("claim_reputation_sync", {
    p_limit: 1,
    p_lock_seconds: 90,
    p_ml_account_id: accountId,
  })
  if (error) throw error
  const row = rows?.[0]
  if (!row) return "busy"
  const account = (await loadAccounts([accountId])).get(accountId)
  if (!account) {
    await releaseLock(accountId)
    return "unavailable"
  }
  await syncAccount(row, account, new CallBudget(40), Date.now() + 25_000, { force: true, claimsHook: options.claimsHook })
  return "done"
}
