import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RECOVERY_POST_PURCHASE_CALLS_PER_MINUTE } from "@/lib/mercadolivre/claims-pause"

import type { MlApiError } from "@/lib/mercadolivre/api"
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

const ml = await import("@/lib/mercadolivre/reputation")
const { runRecoverySync, syncRecoveryAccount, RECOVERY_CRON_LIMITS } = await import("@/lib/recovery/engine")
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
    if (url.pathname.startsWith("/orders/")) return respond(200, { order_items: [] })
    throw new Error("Caminho inesperado: " + url.pathname)
  })
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe("cron do Recuperador: isolamento e ritmo", () => {
  it("429 em A pausa B; conta a pausa curta desde o recebimento após uma chamada demorada", async () => {
    const db = database([1, 1])
    vi.mocked(Math.random).mockReturnValue(0.5)
    fetchMock.mockImplementationOnce(async () => {
      vi.setSystemTime(new Date(NOW.getTime() + 12_000))
      return respond(429, { error: "too_many_requests_error" })
    })
    expect(await runRecoverySync()).toEqual({ accounts: 1, failures: 0, rateLimited: true })
    expect(paths()).toEqual(["/post-purchase/v2/claims/100/returns"])
    expect(db.updates("conta-0")[0]).toMatchObject({ last_returns_at: NOW.toISOString(), next_returns_at: new Date(NOW.getTime() + 12_000 + 69_000).toISOString(), last_error: null })
    expect(round("conta-0")).toMatchObject({ motivo: "rate_limit", proxima_minutos: 1.2 })
    expect(db.updates("conta-1")).toEqual([{ locked_until: null }])
    expect(round("conta-1")).toBeUndefined()
    expect(mocks.token.mock.calls.map(([id]) => id)).toEqual(["conta-0"])
    expect(db.requests.filter((request) => request.method === "GET" && request.url.pathname.endsWith("/recovery_sync"))).toHaveLength(0)
  })

  it("compartilha as 5 chamadas somando /returns e /reviews; a conta atual volta por ritmo e as seguintes soltam a trava", async () => {
    const db = database([2, 5, 1])
    // O retorno do UPDATE do claim pode vir fora de ordem.
    mocks.claim.mockResolvedValue({ data: [...db.syncs].reverse(), error: null })
    expect(RECOVERY_POST_PURCHASE_CALLS_PER_MINUTE).toBe(5)
    expect(RECOVERY_CRON_LIMITS.concurrency).toBe(1)
    expect(await runRecoverySync()).toEqual({ accounts: 2, failures: 0, rateLimited: false })
    expect(paths().filter((path) => path.includes("/v2/claims/"))).toEqual([
      "/post-purchase/v2/claims/100/returns", "/post-purchase/v2/claims/101/returns",
      "/post-purchase/v2/claims/200/returns",
    ])
    expect(paths()).toHaveLength(5)
    expect(paths().filter((path) => path.endsWith("/reviews"))).toHaveLength(2)
    expect(round("conta-1")).toMatchObject({ motivo: "ritmo", proxima_minutos: 1, fila: 5, lidas: 0, resultado: "ok" })
    expect(db.updates("conta-1")[0]).toMatchObject({ next_returns_at: new Date(NOW.getTime() + MINUTE).toISOString(), last_error: null })
    expect(db.updates("conta-2")).toEqual([{ locked_until: null }])
    expect(round("conta-2")).toBeUndefined()
    expect(mocks.token).toHaveBeenCalledTimes(2)
  })

  it("um segundo 429 seguido da mesma conta continua em 1 min", async () => {
    const db = database([1])
    fetchMock.mockResolvedValue(respond(429, { error: "too_many_requests_error" }))
    await runRecoverySync()
    expect(round("conta-0")).toMatchObject({ motivo: "rate_limit", proxima_minutos: 1 })
    const first = db.updates("conta-0")[0]
    Object.assign(db.syncs[0], first)
    vi.setSystemTime(new Date(String(first.next_returns_at)))
    // Cada fetch recebe uma resposta nova (o corpo de Response só pode ser lido uma vez).
    fetchMock.mockImplementation(async () => respond(429, { error: "too_many_requests_error" }))
    await runRecoverySync()
    const second = db.updates("conta-0")[1]
    expect(Date.parse(String(second.next_returns_at)) - Date.parse(String(second.last_returns_at))).toBe(MINUTE)
    expect(round("conta-0")).toMatchObject({ motivo: "rate_limit", proxima_minutos: 1 })
  })

  it.each(["180", new Date(NOW.getTime() + 8 * MINUTE).toUTCString()])("leva Retry-After %s do ML até o agendamento, sem jitter", async (header) => {
    const db = database([1])
    vi.mocked(Math.random).mockReturnValue(0.9)
    fetchMock.mockImplementation(async () => respond(429, { error: "too_many_requests_error" }, header))
    await runRecoverySync()
    const minutes = header === "180" ? 3 : 5
    expect(db.updates("conta-0")[0]).toMatchObject({ next_returns_at: new Date(NOW.getTime() + minutes * MINUTE).toISOString() })
    expect(round("conta-0")).toMatchObject({ motivo: "rate_limit", proxima_minutos: minutes })
  })

  it("E4b: um 429 em /reviews também pausa as demais contas", async () => {
    const db = database([1, 1])
    fetchMock.mockImplementationOnce(async () => respond(200, { id: 777, status: "pending" }))
      .mockImplementationOnce(async () => respond(429, { error: "too_many_requests_error" }))
    expect((await runRecoverySync()).rateLimited).toBe(true)
    expect(round("conta-0").motivo).toBe("rate_limit")
    expect(round("conta-1")).toBeUndefined()
    expect(db.updates("conta-1")).toEqual([{ locked_until: null }])
  })

  it("E4b: conta a chamada recusada e interrompe no primeiro 429, antes do teto", async () => {
    const db = database([1, 1, 1, 1, 1])
    fetchMock.mockImplementation(async () => respond(429, { error: "too_many_requests_error" }))
    expect(await runRecoverySync()).toEqual({ accounts: 1, failures: 0, rateLimited: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(round("conta-0").motivo).toBe("rate_limit")
    for (let index = 1; index < 5; index++) expect(db.updates("conta-" + index)).toEqual([{ locked_until: null }])
  })

  it.each(["detail", "messages", "expected-resolutions", "affects-reputation"])("conta também %s no ritmo de 5 chamadas do Recuperador", async (endpoint) => {
    const db = database([7, 1])
    const readReturn = ml.fetchClaimReturn
    const reads = { detail: ml.fetchClaimDetail, messages: ml.fetchClaimMessages,
      "expected-resolutions": ml.fetchClaimExpectedResolutions, "affects-reputation": ml.fetchClaimAffects }
    vi.spyOn(ml, "fetchClaimReturn").mockImplementation(async (accountId, claimId, budget) => {
      await reads[endpoint as keyof typeof reads](accountId, claimId, budget)
      return readReturn(accountId, claimId, budget)
    })
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input, init) => new URL(String(input)).pathname.endsWith("/" + endpoint)
      ? respond(200, {}) : original(input, init))
    await runRecoverySync()
    expect(paths()).toHaveLength(5)
    expect(paths().filter((path) => path.endsWith("/" + endpoint))).toHaveLength(2)
    expect(round("conta-0")).toMatchObject({ motivo: "ritmo", proxima_minutos: 1, lidas: 1 })
    expect(db.updates("conta-1")).toEqual([{ locked_until: null }])
  })

  it("429 fora de /post-purchase usa 60–78 s por conta, sem escada nem pausa global", async () => {
    const db = database([1, 1])
    vi.mocked(Math.random).mockReturnValue(0.5)
    const readReturn = ml.fetchClaimReturn
    vi.spyOn(ml, "fetchClaimReturn").mockImplementation(async (accountId, claimId, budget) => {
      await ml.fetchClaimOrder(accountId, claimId, budget)
      return readReturn(accountId, claimId, budget)
    })
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input, init) => {
      if (new URL(String(input)).pathname.startsWith("/orders/")) {
        vi.setSystemTime(Date.now() + 12_000)
        return respond(429, { error: "limited" })
      }
      return original(input, init)
    })
    await runRecoverySync()
    for (const account of db.accounts) {
      expect(round(account.id)).toMatchObject({ motivo: "rate_limit", proxima_minutos: 1.2 })
      const update = db.updates(account.id)[0]
      expect(Date.parse(String(update.next_returns_at)) - Date.parse(String(update.last_returns_at))).toBe(81_000)
    }
    expect(db.requests.filter((r) => r.method === "PATCH" && !r.url.searchParams.has("ml_account_id"))).toHaveLength(0)
    Object.assign(db.syncs[0], db.updates("conta-0")[0])
    vi.setSystemTime(new Date(String(db.syncs[0].next_returns_at)))
    mocks.claim.mockResolvedValue({ data: [db.syncs[0]], error: null })
    await runRecoverySync()
    expect(round("conta-0").proxima_minutos).toBe(1.2)
  })

  it("preserva o teto geral de 60 chamadas somando os orçamentos de cada conta", async () => {
    const db = database([1, 1, 1])
    const readReturn = ml.fetchClaimReturn
    vi.spyOn(ml, "fetchClaimReturn").mockImplementation(async (accountId, claimId, budget) => {
      // Simula outras leituras necessárias antes de cada devolução, passando pelo cliente real com fetch simulado.
      for (let index = 0; index < 29; index++) await ml.fetchClaimOrder(accountId, claimId, budget)
      return readReturn(accountId, claimId, budget)
    })
    expect(RECOVERY_CRON_LIMITS.calls).toBe(60)
    expect(await runRecoverySync()).toEqual({ accounts: 2, failures: 0, rateLimited: false })
    expect(fetchMock).toHaveBeenCalledTimes(60)
    expect(round("conta-1")).toMatchObject({ motivo: "orcamento", proxima_minutos: 1 })
    expect(db.updates("conta-2")).toEqual([{ locked_until: null }])
  })

  it("recomeça o contador de devoluções a cada execução do cron", async () => {
    database([7])
    await runRecoverySync()
    await runRecoverySync()
    expect(paths().filter((path) => path.includes("/v2/claims/"))).toHaveLength(6)
    expect(fetchMock).toHaveBeenCalledTimes(10)
  })

  it("atualização manual mantém orçamento próprio e 429 em 2 min, sem pausa global", async () => {
    const db = database([7])
    await syncRecoveryAccount(db.accounts[0], new ml.CallBudget(30, "recuperador_conta"), NOW.getTime() + MINUTE)
    expect(fetchMock).toHaveBeenCalledTimes(14)
    fetchMock.mockClear()
    // Mesmo Retry-After acima de 2 min não altera o comportamento manual já existente.
    fetchMock.mockImplementation(async () => respond(429, { error: "limited" }, "180"))
    await syncRecoveryAccount(db.accounts[0], new ml.CallBudget(30, "recuperador_conta"), NOW.getTime() + MINUTE)
    expect(db.updates("conta-0").at(-1)?.next_returns_at).toBe(new Date(NOW.getTime() + 2 * MINUTE).toISOString())
    expect(db.requests.filter((r) => r.method === "PATCH" && !r.url.searchParams.has("ml_account_id"))).toHaveLength(0)
  })

  it("não inclui Retry-After em erros de outros status", async () => {
    fetchMock.mockResolvedValue(respond(503, { error: "unavailable" }, "180"))
    await expect(ml.fetchClaim("conta-0", 100, new ml.CallBudget(1))).rejects.toMatchObject({
      status: 503, retryAfterMs: undefined,
    } satisfies Partial<MlApiError>)
  })
})
