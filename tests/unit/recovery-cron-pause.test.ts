import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RECOVERY_POST_PURCHASE_CALLS_PER_MINUTE } from "@/lib/mercadolivre/claims-pause"

import type { RecoveryLogEntry } from "@/lib/recovery/log"
import { supabaseFixture } from "./helpers/supabase-fixture"

const mocks = vi.hoisted(() => ({ service: vi.fn(), claim: vi.fn(), accounts: vi.fn(), log: vi.fn(), token: vi.fn() }))
vi.mock("@/lib/supabase/admin", () => ({ createServiceClient: mocks.service }))
vi.mock("@/lib/mercadolivre/accounts", () => ({
  getValidAccessToken: mocks.token, forgetAccessToken: vi.fn(), MlAccountUnavailableError: class extends Error {},
}))
vi.mock("@/lib/recovery/log", () => ({ logRecovery: mocks.log, shortAccount: (id: string) => id.slice(-4) }))
vi.mock("@/lib/reputation/claims-engine", () => ({ syncClaimNow: vi.fn() }))
vi.mock("@/lib/reputation/engine", async (original) => ({
  ...await original<typeof import("@/lib/reputation/engine")>(), applyAlerts: vi.fn(), loadAccounts: mocks.accounts,
}))

const { runRecoverySync, RECOVERY_CRON_LIMITS } = await import("@/lib/recovery/engine")
const MINUTE = 60_000
// Fora da janela do monitor de saúde (múltiplos de 15 min).
const NOW = new Date("2026-11-26T12:01:00.000Z")
const OLD = "2026-11-26T10:00:00.000Z"
type Row = Record<string, unknown>
type Round = Extract<RecoveryLogEntry, { etapa: "rodada" }>

function respond(status: number, body: unknown, retryAfter?: string) {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json", ...(retryAfter ? { "retry-after": retryAfter } : {}) },
  })
}

function database(counts: number[]) {
  const accounts = counts.map((_, index) => ({ id: "conta-" + index, organization_id: "org-" + index, ml_user_id: index + 1, nickname: "Loja fictícia" }))
  const syncs = accounts.map((account, index) => ({
    ml_account_id: account.id, organization_id: account.organization_id,
    last_returns_at: new Date(NOW.getTime() - (10 - index) * MINUTE).toISOString(),
    next_returns_at: new Date(NOW.getTime() - (5 - index) * MINUTE).toISOString(),
  }))
  const claims = accounts.flatMap((account, index) => Array.from({ length: counts[index] }, (_, n) => ({
    id: `claim-${index}-${n}`, claim_id: 100 * (index + 1) + n, ml_account_id: account.id, type: "returns", status: "opened",
    seller_actions: [], ml_created_at: OLD, ml_updated_at: OLD, next_due_at: null, detail: null, resolution: null,
    order_summary: null, resource_id: null, reason_id: null, reason_detail: null, sale_at: null,
  })))
  const db = supabaseFixture({
    recovery_sync: syncs, reputation_claims: claims, recovery_returns: [],
    reputation_sync: accounts.map((account) => ({ ml_account_id: account.id, claims_backfilled_at: OLD })),
    recovery_scans: accounts.map((account) => ({ ml_account_id: account.id, status: "done", started_at: OLD })),
  })
  mocks.service.mockReturnValue({ from: db.client.from.bind(db.client), rpc: mocks.claim })
  mocks.claim.mockImplementation(async () => ({ data: syncs.map((row) => ({ ...row })), error: null }))
  mocks.accounts.mockResolvedValue(new Map(accounts.map((account) => [account.id, account])))
  const updates = (accountId: string) => db.requests
    .filter((request) => request.method === "PATCH" && request.url.pathname.endsWith("/recovery_sync")
      && request.url.searchParams.get("ml_account_id") === "eq." + accountId)
    .map((request) => request.body as Row)
  return { ...db, accounts, syncs, updates }
}

function round(accountId: string): Round {
  return mocks.log.mock.calls.map(([entry]) => entry as RecoveryLogEntry)
    .filter((entry): entry is Round => entry.etapa === "rodada" && entry.conta === accountId).at(-1)!
}

const fetchMock = vi.fn<typeof fetch>()
function paths() {
  return fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.spyOn(Math, "random").mockReturnValue(0)
  vi.spyOn(console, "warn").mockImplementation(() => {})
  mocks.token.mockImplementation(async (accountId: string) => "token-" + accountId)
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (input) => {
    const url = new URL(String(input))
    if (url.origin !== "https://api.mercadolibre.com") throw new Error("Rede real proibida neste teste.")
    if (/\/v2\/claims\/\d+\/returns$/.test(url.pathname)) return respond(200, { id: 777, status: "pending" })
    if (/\/v1\/returns\/\d+\/reviews$/.test(url.pathname)) return respond(200, { reviews: [] })
    if (/\/v1\/claims\/\d+$/.test(url.pathname)) return respond(200, { id: 1 })
    throw new Error("Caminho inesperado: " + url.pathname)
  })
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe("E4b.1: pausa global curta e rodízio com urgentes", () => {
  it("429 em A faz exatamente um UPDATE condicional por agenda; B apenas solta a trava", async () => {
    const db = database([1, 1])
    fetchMock.mockImplementation(async () => respond(429, { error: "too_many_requests_error" }))
    await runRecoverySync()
    const until = new Date(NOW.getTime() + MINUTE).toISOString()
    const updates = db.requests.filter((r) => r.method === "PATCH" && !r.url.searchParams.has("ml_account_id"))
    expect(updates.map((r) => r.body)).toEqual([{ next_returns_at: until }, { next_claims_at: until }])
    expect(updates[0].url.searchParams.get("next_returns_at")).toBe("lt." + until)
    expect(updates[1].url.searchParams.get("next_claims_at")).toBe("lt." + until)
    expect(db.updates("conta-0")[0].next_returns_at).toBe(until)
    expect(round("conta-0").motivo).toBe("rate_limit")
    expect(db.updates("conta-1")).toEqual([{ locked_until: null }])
    expect(paths()).toEqual(["/post-purchase/v2/claims/100/returns"])
    const lines = vi.mocked(console.warn).mock.calls.map(([line]) => String(line)).filter((line) => line.startsWith("[ml-pausa] "))
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0].slice("[ml-pausa] ".length))).toEqual({
      origem: "recuperador_cron", conta: "ta-0", endpoint: "/post-purchase/v2/claims/:id/returns",
      pausa_s: 60, ate: until, retry_after: null,
    })
  })

  it("a agenda do RPC respeita a pausa vigente sem SELECT extra nem regravação", async () => {
    const db = database([1, 1])
    for (const sync of db.syncs) sync.next_returns_at = new Date(NOW.getTime() + MINUTE).toISOString()
    // Simula a seleção de contas vencidas que claim_recovery_sync já faz no banco.
    mocks.claim.mockImplementation(async () => ({ data: db.syncs.filter((row) => Date.parse(row.next_returns_at) <= Date.now()), error: null }))
    expect(await runRecoverySync()).toEqual({ accounts: 0, failures: 0, rateLimited: false })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(db.requests.filter((r) => r.url.pathname.endsWith("/recovery_sync"))).toHaveLength(0)
  })

  it("pausas antigas e agendas normais maiores não aumentam a nova pausa", async () => {
    const db = database([1])
    db.tables.recovery_sync.push({ next_returns_at: "2026-11-26T12:00:00.920777Z" })
    db.tables.recovery_sync.push({ next_returns_at: new Date(NOW.getTime() + 60 * MINUTE).toISOString() })
    fetchMock.mockImplementation(async () => respond(429, { error: "limited" }))
    await runRecoverySync()
    expect(db.updates("conta-0")[0].next_returns_at).toBe(new Date(NOW.getTime() + MINUTE).toISOString())
    expect(round("conta-0").proxima_minutos).toBe(1)
    expect(db.tables.recovery_sync.at(-1)?.next_returns_at).toBe(new Date(NOW.getTime() + 60 * MINUTE).toISOString())
  })

  it("busca urgentes uma vez; conta urgente vai primeiro e recebe prioridade de novo após parar por ritmo", async () => {
    const db = database([1, 7, 1])
    const urgent = {
      id: "urgente", ml_account_id: "conta-1", claim_id: 200, claim_row_id: "claim-1-0",
      synced_at: OLD, claim_updated_at: OLD, phase: "needs_review", deadline_at: new Date(NOW.getTime() + 10 * MINUTE).toISOString(),
      // Dados suficientes para a leitura da fila e para rowReviewMode; sem pedidos extras ao ML.
      destination: "seller_address", shipment_status: "delivered", return_status: "delivered", reviews: [], order_id: null,
    }
    db.tables.recovery_returns.push(urgent)
    // O RPC não garante ordem. A conta mais antiga é conta-0, mas a urgente é conta-1.
    mocks.claim.mockResolvedValue({ data: [...db.syncs].reverse(), error: null })
    expect(RECOVERY_POST_PURCHASE_CALLS_PER_MINUTE).toBe(5)
    expect(RECOVERY_CRON_LIMITS.concurrency).toBe(1)
    await runRecoverySync()
    expect(paths()[0]).toBe("/post-purchase/v2/claims/200/returns")
    expect(round("conta-1")).toMatchObject({ motivo: "ritmo", lidas: 2, urgentes: 1, urgentes_lidos: 1 })
    expect(db.updates("conta-0")).toEqual([{ locked_until: null }])
    expect(db.updates("conta-2")).toEqual([{ locked_until: null }])
    const urgentQueries = db.requests.filter((r) => r.method === "GET" && r.url.searchParams.get("select") === "ml_account_id")
    expect(urgentQueries).toHaveLength(1)
    expect(urgentQueries[0].url.searchParams.get("ml_account_id")).toBe("in.(conta-2,conta-1,conta-0)")
    Object.assign(db.syncs[1], db.updates("conta-1")[0])
    vi.setSystemTime(new Date(NOW.getTime() + MINUTE))
    fetchMock.mockClear()
    mocks.claim.mockResolvedValue({ data: db.syncs, error: null })
    await runRecoverySync()
    expect(paths()[0]).toBe("/post-purchase/v2/claims/200/returns")
  })

  it("prazo vencido ou acima de 24h não dá prioridade à conta", async () => {
    const db = database([1, 1, 1])
    db.tables.recovery_returns.push(
      { ml_account_id: "conta-1", phase: "needs_review", deadline_at: new Date(NOW.getTime() - MINUTE).toISOString() },
      { ml_account_id: "conta-2", phase: "needs_review", deadline_at: new Date(NOW.getTime() + 25 * 60 * MINUTE).toISOString() },
    )
    await runRecoverySync()
    expect(paths()[0]).toBe("/post-purchase/v2/claims/100/returns")
  })
})

