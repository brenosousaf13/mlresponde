import "server-only"

import { computeAccess } from "@/lib/access/access"
import {
  IMPORT_PAGE_SIZE,
  MAX_IMPORT_ATTEMPTS,
  MAX_POLL_PAGES,
  importRetryDelayMs,
  mlDateParam,
  nextImportCursor,
  pollFallbackSince,
  pollSince,
  resumeImport,
  type ImportCursor,
} from "@/lib/customers/import"
import { buyerName, mlId, shipmentLocation, toIngestOrders, type MlSearchOrder } from "@/lib/customers/orders"
import { MlAccountUnavailableError } from "@/lib/mercadolivre/accounts"
import { MlApiError } from "@/lib/mercadolivre/api"
import { fetchOrder, fetchShipmentDestination, searchSellerOrders } from "@/lib/mercadolivre/orders"
import type { Database } from "@/lib/supabase/database.types"
import { createServiceClient } from "@/lib/supabase/admin"

// Aba Clientes: importação dos últimos 12 meses, conferência a cada 10 minutos, notificação orders_v2 e cidade/UF.
// Regras puras em lib/customers/{orders,import}.ts; gravação em public.ingest_ml_orders (idempotente).

type SyncRow = Database["public"]["Tables"]["ml_customer_sync"]["Row"]

/**
 * Limites por rodada do cron (1 por minuto). As 10 páginas de importação são divididas entre as contas importando
 * (no mínimo 2 por conta): uma loja sozinha importa 500 vendas por minuto (55 mil vendas ≈ 2 horas).
 */
export const CUSTOMER_CRON_LIMITS = {
  importAccounts: 5,
  importPagesPerAccount: 2,
  importPages: 10,
  /** Chamadas ao ML para cidade/UF (envio) e nome (venda) por rodada. */
  locations: 60,
  pollAccounts: 30,
  /** Tempo máximo da rodada antes de deixar o resto para o próximo minuto. */
  budgetMs: 45_000,
} as const

function errorMessage(error: unknown) {
  const text = error instanceof Error ? error.message : String(error)
  return text.replace(/\s+/g, " ").trim().slice(0, 500) || "Erro desconhecido."
}

function isPermanentMlError(error: unknown) {
  return error instanceof MlApiError && error.status >= 400 && error.status < 500 && error.status !== 429
}

/** Grava um lote de vendas de uma conta. Devolve quantas vendas válidas (com comprador) havia no lote. */
export async function ingestOrders(accountId: string, orders: readonly MlSearchOrder[]): Promise<number> {
  const rows = toIngestOrders(orders)
  if (!rows.length) return 0
  const { error } = await createServiceClient().rpc("ingest_ml_orders", { p_ml_account_id: accountId, p_orders: rows })
  if (error) throw error
  return rows.length
}

async function sellerIds(accountIds: string[]) {
  if (!accountIds.length) return new Map<string, number>()
  const { data, error } = await createServiceClient().from("ml_accounts").select("id, ml_user_id").in("id", accountIds)
  if (error) throw error
  return new Map(data.map((account) => [account.id, Number(account.ml_user_id)]))
}

/** Páginas de importação por conta nesta rodada (as 10 da rodada divididas, no mínimo 2). */
export function importPagesPerAccount(accounts: number): number {
  if (accounts <= 0) return 0
  return Math.max(CUSTOMER_CRON_LIMITS.importPagesPerAccount, Math.floor(CUSTOMER_CRON_LIMITS.importPages / accounts))
}

async function claim(kind: "import" | "poll", limit: number): Promise<SyncRow[]> {
  const { data, error } = await createServiceClient().rpc("claim_customer_sync", { p_kind: kind, p_limit: limit })
  if (error) throw error
  return data ?? []
}

async function saveSync(accountId: string, fields: Database["public"]["Tables"]["ml_customer_sync"]["Update"]) {
  const { error } = await createServiceClient().from("ml_customer_sync").update(fields).eq("ml_account_id", accountId)
  if (error) throw error
}

function cursorFields(cursor: ImportCursor) {
  return {
    import_since: cursor.importSince,
    window_from: cursor.windowFrom,
    window_to: cursor.windowTo,
    window_offset: cursor.offset,
  }
}

/** Lê até maxPages páginas da importação de uma conta (já reservada) e grava o progresso. Devolve as páginas lidas. */
export async function importAccount(row: SyncRow, sellerId: number, maxPages: number, deadline: number): Promise<number> {
  const now = new Date()
  const { cursor: start, started } = resumeImport(row, now)
  let cursor = start
  let imported = row.orders_imported
  let pages = 0
  const startFields = started ? { import_started_at: now.toISOString(), last_polled_at: now.toISOString() } : {}

  try {
    let done = false
    while (pages < maxPages && !done && (pages === 0 || Date.now() < deadline)) {
      const page = await searchSellerOrders(row.ml_account_id, sellerId, {
        "order.date_created.from": mlDateParam(cursor.windowFrom),
        "order.date_created.to": mlDateParam(cursor.windowTo),
        sort: "date_desc",
        limit: String(IMPORT_PAGE_SIZE),
        offset: String(cursor.offset),
      })
      pages++
      const results = page.results ?? []
      imported += await ingestOrders(row.ml_account_id, results)
      const next = nextImportCursor(cursor, { received: results.length, total: Number(page.paging?.total ?? results.length) || 0 })
      cursor = next.cursor
      done = next.done
    }
    await saveSync(row.ml_account_id, {
      ...startFields,
      ...cursorFields(cursor),
      orders_imported: imported,
      status: done ? "done" : "running",
      import_finished_at: done ? new Date().toISOString() : null,
      attempts: 0,
      last_error: null,
      next_attempt_at: new Date().toISOString(),
      locked_until: null,
    })
    if (done) console.info("[clientes] importação concluída da conta " + row.ml_account_id + ": " + imported + " vendas")
  } catch (error) {
    // O progresso até a falha fica gravado; a próxima tentativa continua de onde parou.
    const unavailable = error instanceof MlAccountUnavailableError
    const failed = !unavailable && row.attempts >= MAX_IMPORT_ATTEMPTS
    await saveSync(row.ml_account_id, {
      ...startFields,
      ...cursorFields(cursor),
      orders_imported: imported,
      status: failed ? "failed" : "running",
      last_error: errorMessage(error),
      next_attempt_at: new Date(Date.now() + (unavailable ? 10 * 60 * 1000 : importRetryDelayMs(row.attempts))).toISOString(),
      locked_until: null,
    })
    console.error("[clientes] importação da conta " + row.ml_account_id + ":", errorMessage(error))
  }
  return pages
}

/** Conferência de uma conta (já reservada): vendas alteradas desde a última (até MAX_POLL_PAGES páginas). */
export async function pollAccount(row: SyncRow, sellerId: number) {
  const startedAt = new Date()
  const read = async (filter: Record<string, string>) => {
    for (let index = 0; index < MAX_POLL_PAGES; index++) {
      const page = await searchSellerOrders(row.ml_account_id, sellerId, {
        ...filter,
        sort: "date_desc",
        limit: String(IMPORT_PAGE_SIZE),
        offset: String(index * IMPORT_PAGE_SIZE),
      })
      const results = page.results ?? []
      await ingestOrders(row.ml_account_id, results)
      const total = Number(page.paging?.total ?? 0) || 0
      if (results.length < IMPORT_PAGE_SIZE || (index + 1) * IMPORT_PAGE_SIZE >= total) break
    }
  }

  try {
    try {
      await read({ "order.date_last_updated.from": mlDateParam(pollSince(row.last_polled_at, row.import_started_at, startedAt)) })
    } catch (error) {
      // Filtro recusado pelo ML: lê as vendas criadas nos últimos dias.
      if (!(error instanceof MlApiError && error.status === 400)) throw error
      await read({ "order.date_created.from": mlDateParam(pollFallbackSince(startedAt)) })
    }
    await saveSync(row.ml_account_id, { last_polled_at: startedAt.toISOString(), last_error: null, locked_until: null })
  } catch (error) {
    await saveSync(row.ml_account_id, {
      last_error: errorMessage(error),
      next_attempt_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      locked_until: null,
    })
    console.error("[clientes] conferência da conta " + row.ml_account_id + ":", errorMessage(error))
  }
}

type LocationCandidate = { id: string; ml_account_id: string; location_ml_order_id: number; needsName: boolean }

/**
 * Cidade e UF (do envio) e, para quem ainda não tem, nome e sobrenome (da venda: a busca da importação não traz o nome)
 * dos clientes com a compra mais recente ainda não lida. maxCalls = chamadas ao ML nesta rodada. Devolve quantos foram
 * resolvidos. accountIds limita a algumas contas (testes); sem ele, vale para todas.
 */
export async function resolveLocations(maxCalls: number, deadline: number, accountIds?: string[]): Promise<number> {
  const admin = createServiceClient()
  let query = admin
    .from("ml_customers")
    .select(
      "id, ml_account_id, location_ml_order_id, first_name, ml_accounts!inner(status, token_status, organizations!inner(trial_ends_at, subscription_status, billing_exempt, current_period_end))"
    )
    .eq("location_pending", true)
    .eq("ml_accounts.status", "active")
    .eq("ml_accounts.token_status", "valid")
  if (accountIds) query = query.in("ml_account_id", accountIds)
  // Quem comprou por último primeiro: é o topo da lista (lojas grandes levam horas para completar todos).
  const { data, error } = await query.order("last_order_at", { ascending: false, nullsFirst: false }).limit(maxCalls * 2)
  if (error) throw error

  // Cada cliente custa 1 chamada (envio) + 1 se ainda não tiver nome (venda).
  const candidates: LocationCandidate[] = []
  let calls = 0
  for (const row of data) {
    if (!row.location_ml_order_id || !row.ml_accounts?.organizations) continue
    if (computeAccess(row.ml_accounts.organizations).state === "blocked") continue
    const needsName = !row.first_name
    const cost = needsName ? 2 : 1
    if (calls + cost > maxCalls) break
    calls += cost
    candidates.push({ id: row.id, ml_account_id: row.ml_account_id, location_ml_order_id: Number(row.location_ml_order_id), needsName })
  }
  if (!candidates.length) return 0

  const { data: orderRows, error: ordersError } = await admin
    .from("ml_orders")
    .select("ml_account_id, ml_order_id, shipment_id")
    .in("ml_account_id", [...new Set(candidates.map((candidate) => candidate.ml_account_id))])
    .in("ml_order_id", candidates.map((candidate) => candidate.location_ml_order_id))
  if (ordersError) throw ordersError
  const shipments = new Map(orderRows.map((row) => [row.ml_account_id + ":" + row.ml_order_id, mlId(row.shipment_id)]))

  let resolved = 0
  let rateLimited = false
  const finish = async (
    candidate: LocationCandidate,
    location: { city: string | null; state: string | null } | null,
    name: { first: string | null; last: string | null } | null = null
  ) => {
    const fields: Database["public"]["Tables"]["ml_customers"]["Update"] = { location_pending: false }
    if (location?.city || location?.state) {
      fields.city = location.city
      fields.state = location.state
    }
    if (name?.first) {
      fields.first_name = name.first
      fields.last_name = name.last
    }
    // Só se a compra mais recente continua a mesma (uma venda nova no meio do caminho pede outra cidade).
    const { error: updateError } = await admin
      .from("ml_customers")
      .update(fields)
      .eq("id", candidate.id)
      .eq("location_ml_order_id", candidate.location_ml_order_id)
    if (updateError) throw updateError
    resolved++
  }

  await forEachLimit(candidates, 4, async (candidate) => {
    if (rateLimited || Date.now() > deadline) return
    const shipmentId = shipments.get(candidate.ml_account_id + ":" + candidate.location_ml_order_id) ?? null
    const [shipment, order] = await Promise.allSettled([
      shipmentId ? fetchShipmentDestination(candidate.ml_account_id, shipmentId) : Promise.resolve(null),
      candidate.needsName ? fetchOrder(candidate.ml_account_id, candidate.location_ml_order_id) : Promise.resolve(null),
    ])
    const failures = [shipment, order].flatMap((result) => (result.status === "rejected" ? [result.reason as unknown] : []))
    if (failures.some((error) => error instanceof MlApiError && error.status === 429)) rateLimited = true
    // Falha passageira (rede, 5xx, 429, conta sem token): fica pendente para a próxima rodada.
    const transient = failures.find((error) => !isPermanentMlError(error))
    if (transient) {
      if (!(transient instanceof MlAccountUnavailableError) && !(transient instanceof MlApiError && transient.status === 429)) {
        console.error("[clientes] cidade do cliente " + candidate.id + ":", errorMessage(transient))
      }
      return
    }
    // Erro definitivo (403/404) numa das leituras: usa o que veio da outra.
    await finish(
      candidate,
      shipment.status === "fulfilled" && shipment.value ? shipmentLocation(shipment.value) : null,
      order.status === "fulfilled" && order.value ? buyerName(order.value.buyer?.first_name, order.value.buyer?.last_name) : null
    )
  })
  return resolved
}

/** Executa task em todos os itens, no máximo limit ao mesmo tempo. */
async function forEachLimit<T>(items: readonly T[], limit: number, task: (item: T) => Promise<unknown>) {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await task(items[next++])
  })
  await Promise.all(workers)
}

export type CustomerSyncResult = { importPages: number; polled: number; locations: number; failures: number }

/**
 * Cron de clientes (1 vez por minuto): importação (até 10 páginas, 2 por conta), conferência das contas já importadas
 * (a cada 10 minutos por conta) e cidade/UF dos clientes novos (até 60 envios). Cada parte para no limite de tempo.
 */
export async function runCustomerSync(): Promise<CustomerSyncResult> {
  const deadline = Date.now() + CUSTOMER_CRON_LIMITS.budgetMs
  const result: CustomerSyncResult = { importPages: 0, polled: 0, locations: 0, failures: 0 }

  try {
    const rows = await claim("import", CUSTOMER_CRON_LIMITS.importAccounts)
    const sellers = await sellerIds(rows.map((row) => row.ml_account_id))
    const perAccount = importPagesPerAccount(rows.length)
    for (const row of rows) {
      const left = CUSTOMER_CRON_LIMITS.importPages - result.importPages
      const sellerId = sellers.get(row.ml_account_id)
      if (left <= 0 || Date.now() > deadline || !sellerId) {
        // Fica para o próximo minuto (devolve a reserva sem contar tentativa).
        await saveSync(row.ml_account_id, { locked_until: null, attempts: Math.max(0, row.attempts - 1) })
        continue
      }
      result.importPages += await importAccount(row, sellerId, Math.min(perAccount, left), deadline)
    }
  } catch (error) {
    result.failures++
    console.error("[clientes] importação:", errorMessage(error))
  }

  try {
    if (Date.now() < deadline) {
      const rows = await claim("poll", CUSTOMER_CRON_LIMITS.pollAccounts)
      const sellers = await sellerIds(rows.map((row) => row.ml_account_id))
      await forEachLimit(rows, 4, async (row) => {
        const sellerId = sellers.get(row.ml_account_id)
        if (!sellerId || Date.now() > deadline) {
          await saveSync(row.ml_account_id, { locked_until: null })
          return
        }
        await pollAccount(row, sellerId)
        result.polled++
      })
    }
  } catch (error) {
    result.failures++
    console.error("[clientes] conferência:", errorMessage(error))
  }

  try {
    if (Date.now() < deadline) result.locations = await resolveLocations(CUSTOMER_CRON_LIMITS.locations, deadline)
  } catch (error) {
    result.failures++
    console.error("[clientes] cidades:", errorMessage(error))
  }

  return result
}

type NotifiedAccount = {
  id: string
  ml_user_id: number
  status: string
  organizations: { trial_ends_at: string; subscription_status: string; billing_exempt: boolean; current_period_end: string | null } | null
}

/** Notificação orders_v2: lê a venda no ML e grava (só vendas da própria conta, de organizações com acesso). */
export async function handleOrderNotification(account: NotifiedAccount, orderId: number) {
  if (account.status !== "active" || !account.organizations) return
  if (computeAccess(account.organizations).state === "blocked") return
  try {
    const order = await fetchOrder(account.id, orderId)
    // O ML avisa das vendas da conta; se a conta for a compradora, não é cliente desta loja.
    if (mlId(order.seller?.id) !== Number(account.ml_user_id)) return
    await ingestOrders(account.id, [order])
  } catch (error) {
    // A conferência a cada 10 minutos pega a venda se esta leitura falhar.
    if (!(error instanceof MlAccountUnavailableError)) console.error("[clientes] venda " + orderId + ":", errorMessage(error))
  }
}

/** "Tentar de novo" da tela: volta a importação que falhou para a fila (continua de onde parou). */
export async function retryFailedImport(organizationId: string, accountId: string): Promise<boolean> {
  const { data, error } = await createServiceClient()
    .from("ml_customer_sync")
    .update({ status: "pending", attempts: 0, last_error: null, next_attempt_at: new Date().toISOString(), locked_until: null })
    .eq("ml_account_id", accountId)
    .eq("organization_id", organizationId)
    .eq("status", "failed")
    .select("ml_account_id")
  if (error) throw error
  return data.length > 0
}
