import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { encodePauseUntil } from "@/lib/mercadolivre/claims-pause"
import { supabaseFixture } from "./helpers/supabase-fixture"

const mocks = vi.hoisted(() => ({ service: vi.fn(), rpc: vi.fn(), token: vi.fn() }))
vi.mock("@/lib/supabase/admin", () => ({ createServiceClient: mocks.service }))
vi.mock("@/lib/mercadolivre/accounts", () => ({
  getValidAccessToken: mocks.token, forgetAccessToken: vi.fn(), MlAccountUnavailableError: class extends Error {},
}))
vi.mock("@/lib/email/resend", () => ({ emailEnabled: () => false, sendEmail: vi.fn() }))

const ml = await import("@/lib/mercadolivre/reputation")
const { runReputationSync, syncAccountNow } = await import("@/lib/reputation/engine")
const { DETAILS_PER_RUN } = await import("@/lib/reputation/claims-engine")
const MINUTE = 60_000
const NOW = new Date("2026-11-26T12:01:00Z")
const OLD = "2026-11-26T10:00:00Z"
const FUTURE = "2026-11-27T12:00:00Z"
const fetchMock = vi.fn<typeof fetch>()
type Row = Record<string, unknown>

function database(count = 4) {
  const accounts = Array.from({ length: count }, (_, i) => ({
    id: "conta-" + i, organization_id: "org-" + i, ml_user_id: i + 1, nickname: "Loja fictícia",
  }))
  const syncs = accounts.map((account) => ({
    ml_account_id: account.id, organization_id: account.organization_id, next_reputation_at: OLD,
    next_shipments_at: OLD, next_claims_at: OLD, last_claims_at: OLD, claims_backfilled_at: OLD,
  }))
  const db = supabaseFixture({
    ml_accounts: accounts, reputation_sync: syncs,
    recovery_sync: accounts.map((account) => ({ ml_account_id: account.id, next_returns_at: OLD })),
    reputation_shipments: accounts.map((account, i) => ({
      id: "envio-" + i, ml_account_id: account.id, shipment_id: 100 + i,
      stage: "pending", next_check_at: OLD, ordered_at: OLD, check_attempts: 0,
    })),
  })
  mocks.service.mockReturnValue({ from: db.client.from.bind(db.client), rpc: mocks.rpc })
  mocks.rpc.mockImplementation(async () => ({ data: syncs, error: null }))
  return { ...db, syncs }
}

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}
const paths = () => fetchMock.mock.calls.map(([input]) => new URL(String(input)).pathname)
const postPaths = () => paths().filter((path) => path.startsWith("/post-purchase/"))

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.spyOn(Math, "random").mockReturnValue(0)
  vi.spyOn(console, "warn").mockImplementation(() => {})
  mocks.token.mockResolvedValue("token-ficticio")
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (input) => {
    const url = new URL(String(input))
    if (url.origin !== "https://api.mercadolibre.com") throw new Error("Rede real proibida.")
    if (url.pathname.startsWith("/users/")) return respond(200, { seller_reputation: null })
    if (url.pathname.startsWith("/shipments/")) return respond(200, { status: "delivered" })
    if (url.pathname.endsWith("/search")) return respond(200, { data: [], paging: { total: 0 } })
    if (url.pathname.startsWith("/post-purchase/")) return respond(200, {})
    throw new Error("Caminho inesperado: " + url.pathname)
  })
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe("E4b: reputação respeita pausa só de /post-purchase", () => {
  it("429 na busca interrompe só post-purchase; termômetro e envios seguem nas contas restantes", async () => {
    const db = database()
    const original = fetchMock.getMockImplementation()!
    let release: () => void = () => {}
    const paused = new Promise<void>((resolve) => { release = resolve })
    vi.mocked(console.warn).mockImplementation((line) => { if (String(line).startsWith("[ml-pausa] ")) release() })
    let received429 = false
    const afterPause: string[] = []
    fetchMock.mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname
      if (received429) afterPause.push(path)
      if (path.startsWith("/post-purchase/")) {
        received429 = true
        return respond(429, { error: "too_many_requests_error" })
      }
      // Mantém as outras contas antes de claims até a primeira pausa ficar gravada.
      if (path === "/users/2" || path === "/users/3") await paused
      return original(input, init)
    })
    expect(await runReputationSync()).toMatchObject({ accounts: 4, failures: 0, rateLimited: true })
    expect(postPaths()).toEqual(["/post-purchase/v1/claims/search"])
    expect(afterPause).toContain("/users/4")
    expect(afterPause).toContain("/shipments/103")
    const until = encodePauseUntil(NOW.getTime() + 2 * MINUTE, 0)
    const globalUpdates = db.requests.filter((r) => r.method === "PATCH"
      && (r.url.searchParams.has("next_returns_at") || r.url.searchParams.has("next_claims_at")))
    expect(globalUpdates.map((r) => r.body)).toEqual([{ next_returns_at: until }, { next_claims_at: until }])
    const accountUpdates = db.requests.filter((r) => r.method === "PATCH" && r.url.pathname.endsWith("/reputation_sync")
      && r.url.searchParams.has("ml_account_id"))
    expect(accountUpdates).toHaveLength(4)
    for (const request of accountUpdates) expect(request.body).not.toHaveProperty("next_claims_at")
  })

  it.each(["detail", "messages", "expected-resolutions"] as const)("429 em %s do gancho também pausa o app e barra a próxima chamada", async (endpoint) => {
    const db = database(1)
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input, init) => new URL(String(input)).pathname.endsWith("/" + endpoint)
      ? respond(429, { error: "limited" }) : original(input, init))
    const calls = {
      detail: ml.fetchClaimDetail, messages: ml.fetchClaimMessages, "expected-resolutions": ml.fetchClaimExpectedResolutions,
    }
    const hook = vi.fn(async (account, _changed, budget) => {
      try { await calls[endpoint](account.id, 123, budget) } finally {
        await expect(ml.fetchClaimMessages(account.id, 456, budget)).rejects.toBeInstanceOf(ml.BudgetExhaustedError)
      }
    })
    expect((await runReputationSync({ claimsHook: hook })).rateLimited).toBe(true)
    expect(postPaths()).toEqual(["/post-purchase/v1/claims/search", "/post-purchase/v1/claims/123/" + endpoint])
    expect(db.requests.some((r) => r.method === "PATCH" && r.url.pathname.endsWith("/recovery_sync"))).toBe(true)
  })

  it("pausa vigente é lida uma vez e pula claims, com as demais partes funcionando", async () => {
    const db = database()
    db.tables.recovery_sync[0].next_returns_at = encodePauseUntil(NOW.getTime() + 8 * MINUTE, 2)
    const hook = vi.fn()
    expect(await runReputationSync({ claimsHook: hook })).toMatchObject({ accounts: 4, failures: 0 })
    expect(postPaths()).toEqual([])
    expect(paths().filter((path) => path.startsWith("/users/"))).toHaveLength(4)
    expect(paths().filter((path) => path.startsWith("/shipments/"))).toHaveLength(4)
    expect(hook).not.toHaveBeenCalled()
    expect(db.requests.filter((r) => r.method === "GET" && r.url.pathname.endsWith("/recovery_sync"))).toHaveLength(1)
    expect(db.requests.filter((r) => r.method === "PATCH" && (r.body as Row)?.next_claims_at)).toHaveLength(0)
  })

  it("sem pausa, claims só roda quando next_claims_at vence", async () => {
    const db = database(1)
    db.syncs[0].next_claims_at = FUTURE
    const hook = vi.fn()
    await runReputationSync({ claimsHook: hook })
    expect(postPaths()).toEqual([])
    expect(hook).not.toHaveBeenCalled()
    expect(paths()).toContain("/users/1")
    expect(paths()).toContain("/shipments/100")
  })

  it("reduz detalhes de 12 para 6 por conta e rodada", () => {
    expect(DETAILS_PER_RUN).toBe(6)
  })

  it("atualização manual ignora a pausa do cron e não escreve pausa global", async () => {
    const db = database(1)
    db.tables.recovery_sync[0].next_returns_at = encodePauseUntil(NOW.getTime() + 8 * MINUTE, 2)
    expect(await syncAccountNow("conta-0")).toBe("done")
    expect(postPaths()).toEqual(["/post-purchase/v1/claims/search"])
    expect(db.requests.filter((r) => r.url.pathname.endsWith("/recovery_sync"))).toHaveLength(0)
  })
})
