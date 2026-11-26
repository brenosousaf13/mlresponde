import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { REPUTATION_POST_PURCHASE_CALLS_PER_RUN } from "@/lib/mercadolivre/claims-pause"
import { supabaseFixture } from "./helpers/supabase-fixture"

const mocks = vi.hoisted(() => ({ service: vi.fn(), rpc: vi.fn(), token: vi.fn() }))
vi.mock("@/lib/supabase/admin", () => ({ createServiceClient: mocks.service }))
vi.mock("@/lib/mercadolivre/accounts", () => ({
  getValidAccessToken: mocks.token, forgetAccessToken: vi.fn(), MlAccountUnavailableError: class extends Error {},
}))
vi.mock("@/lib/email/resend", () => ({ emailEnabled: () => false, sendEmail: vi.fn() }))

const ml = await import("@/lib/mercadolivre/reputation")
const { runReputationSync, syncAccountNow } = await import("@/lib/reputation/engine")
const { DETAILS_PER_RUN, claimsHook, needsDetails } = await import("@/lib/reputation/claims-engine")
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

describe("E4b.1: reputação respeita ritmo e pausa só de /post-purchase", () => {
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
    const until = new Date(NOW.getTime() + MINUTE).toISOString()
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

  it("as agendas respeitam pausa vigente, sem ler recovery_sync e com as demais partes funcionando", async () => {
    const db = database()
    for (const sync of db.syncs) sync.next_claims_at = new Date(NOW.getTime() + MINUTE).toISOString()
    const hook = vi.fn()
    expect(await runReputationSync({ claimsHook: hook })).toMatchObject({ accounts: 4, failures: 0 })
    expect(postPaths()).toEqual([])
    expect(paths().filter((path) => path.startsWith("/users/"))).toHaveLength(4)
    expect(paths().filter((path) => path.startsWith("/shipments/"))).toHaveLength(4)
    expect(hook).not.toHaveBeenCalled()
    expect(db.requests.filter((r) => r.method === "GET" && r.url.pathname.endsWith("/recovery_sync"))).toHaveLength(0)
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

  it("limita o app a 6 chamadas por rodada e mantém termômetro e envios das demais contas", async () => {
    const db = database(8)
    expect(REPUTATION_POST_PURCHASE_CALLS_PER_RUN).toBe(6)
    expect(await runReputationSync()).toMatchObject({ accounts: 8, failures: 0, rateLimited: false })
    expect(postPaths()).toHaveLength(6)
    expect(paths().filter((path) => path.startsWith("/users/"))).toHaveLength(8)
    expect(paths().filter((path) => path.startsWith("/shipments/"))).toHaveLength(8)
    const updates = db.requests.filter((r) => r.method === "PATCH" && r.url.pathname.endsWith("/reputation_sync")
      && r.url.searchParams.has("ml_account_id")).map((r) => r.body as Row)
    expect(updates.filter((update) => update.next_claims_at === new Date(NOW.getTime() + MINUTE).toISOString())).toHaveLength(2)
    for (const update of updates) expect(update.last_error).toBeNull()
    expect(db.requests.filter((r) => r.url.pathname.endsWith("/recovery_sync"))).toHaveLength(0)
    fetchMock.mockClear()
    await runReputationSync()
    expect(postPaths()).toHaveLength(6)
  })

  it.each(["detail", "messages", "expected-resolutions", "affects-reputation", "returns"] as const)("soma busca e %s no mesmo limite de 6, sem bloquear /orders", async (endpoint) => {
    const db = database(1)
    const calls = { detail: ml.fetchClaimDetail, messages: ml.fetchClaimMessages,
      "expected-resolutions": ml.fetchClaimExpectedResolutions, "affects-reputation": ml.fetchClaimAffects,
      returns: ml.fetchClaimReturn }
    const hook = vi.fn(async (account, _changed, budget) => {
      for (let index = 0; index < REPUTATION_POST_PURCHASE_CALLS_PER_RUN - 1; index++) {
        await calls[endpoint](account.id, 123 + index, budget)
      }
      await ml.fetchClaimOrder(account.id, 456, budget)
      await ml.fetchClaimMessages(account.id, 456, budget)
    })
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input, init) => new URL(String(input)).pathname.startsWith("/orders/")
      ? respond(200, {}) : original(input, init))
    expect(await runReputationSync({ claimsHook: hook })).toMatchObject({ failures: 0, rateLimited: false })
    expect(postPaths()).toHaveLength(6)
    expect(postPaths()[0]).toBe("/post-purchase/v1/claims/search")
    expect(postPaths()[1]).toMatch(new RegExp("/" + endpoint + "$"))
    expect(postPaths().slice(1).every((path) => path.endsWith("/" + endpoint))).toBe(true)
    expect(paths()).toContain("/orders/456")
    const update = db.requests.filter((r) => r.method === "PATCH" && r.url.pathname.endsWith("/reputation_sync")
      && r.url.searchParams.has("ml_account_id")).at(-1)?.body as Row
    expect(update).toMatchObject({ next_claims_at: new Date(NOW.getTime() + MINUTE).toISOString(), last_error: null })
  })

  it.each([null, OLD])("detalhe interrompido continua elegível e conclui na rodada seguinte (leitura anterior: %s)", async (previousSync) => {
    const db = database(1)
    const raw = {
      id: 123, claim_version: 2, type: "fulfillment", status: "opened", stage: "claim",
      resource: null, reason_id: "PDD1", date_created: OLD, last_updated: NOW.toISOString(), players: [],
    }
    const claim = {
      id: "reclamacao-123", claim_id: 123, ml_account_id: "conta-0", organization_id: "org-0",
      type: raw.type, status: raw.status, stage: raw.stage, resource: null, reason_id: raw.reason_id,
      ml_created_at: OLD, ml_updated_at: raw.last_updated, details_synced_at: previousSync,
      next_due_at: null, seller_actions: [], reason_detail: null, ai_status: null, ai_analyses: 0,
    }
    db.tables.reputation_claims = [claim]
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname
      if (path === "/post-purchase/v1/claims/123") return respond(200, raw)
      if (path.endsWith("/messages")) return respond(200, [{
        sender_role: "complainant", receiver_role: "respondent", message: "Produto com problema", date_created: OLD,
      }])
      if (path.endsWith("/expected-resolutions")) return respond(200, [])
      if (path.endsWith("/reasons/PDD1")) return respond(200, { detail: "Produto com defeito" })
      return original(input, init)
    })
    // Uma leitura anterior da rodada deixa só 4 chamadas para o detalhe: falta a consulta do motivo.
    const interruptedHook: typeof claimsHook = async (account, changed, budget, now) => {
      await ml.fetchClaimAffects(account.id, 456, budget)
      return claimsHook(account, changed, budget, now)
    }
    expect(await runReputationSync({ claimsHook: interruptedHook })).toMatchObject({ failures: 0, rateLimited: false })
    expect(postPaths()).toHaveLength(6)
    expect(postPaths()).toContain("/post-purchase/v1/claims/123/expected-resolutions")
    expect(postPaths()).not.toContain("/post-purchase/v1/claims/reasons/PDD1")
    const detailUpdates = () => db.requests.filter((r) => r.method === "PATCH"
      && r.url.pathname.endsWith("/reputation_claims") && (r.body as Row)?.details_synced_at)
    expect(detailUpdates()).toHaveLength(0)
    expect(needsDetails(claim, NOW)).toBe(true)
    const schedule = db.requests.filter((r) => r.method === "PATCH" && r.url.pathname.endsWith("/reputation_sync")).at(-1)?.body as Row
    expect(schedule).toMatchObject({ next_claims_at: new Date(NOW.getTime() + MINUTE).toISOString(), last_error: null })

    // Aplica à fixture a agenda gravada; a próxima execução do cron ocorre 2 minutos depois.
    Object.assign(db.syncs[0], schedule)
    vi.setSystemTime(NOW.getTime() + 2 * MINUTE)
    fetchMock.mockClear()
    db.requests.length = 0
    expect(await runReputationSync({ claimsHook })).toMatchObject({ failures: 0, rateLimited: false })
    expect(postPaths()).toEqual([
      "/post-purchase/v1/claims/search", "/post-purchase/v1/claims/123",
      "/post-purchase/v1/claims/123/detail", "/post-purchase/v1/claims/123/messages",
      "/post-purchase/v1/claims/123/expected-resolutions", "/post-purchase/v1/claims/reasons/PDD1",
    ])
    expect(detailUpdates()).toHaveLength(1)
    const update = detailUpdates()[0].body as Row
    expect(update).toMatchObject({
      details_synced_at: new Date(NOW.getTime() + 2 * MINUTE).toISOString(),
      reason_detail: "Produto com defeito", messages_count: 1,
    })
    const messages = db.requests.find((r) => r.method === "POST" && r.url.pathname.endsWith("/reputation_claim_messages"))
    expect(messages?.body).toEqual([expect.objectContaining({ claim_row_id: claim.id, message: "Produto com problema" })])
    expect(db.requests.indexOf(messages!)).toBeLessThan(db.requests.indexOf(detailUpdates()[0]))
    Object.assign(claim, update)
    expect(needsDetails(claim, new Date())).toBe(false)
  })

  it.each([undefined, "0", "30", "180", "3600"])("429 com Retry-After %s grava pausa curta ou o cabeçalho limitado a 5 min", async (retryAfter) => {
    const db = database(1)
    vi.mocked(Math.random).mockReturnValue(1)
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input, init) => {
      if (!new URL(String(input)).pathname.startsWith("/post-purchase/")) return original(input, init)
      return new Response("{}", { status: 429, headers: retryAfter === undefined ? {} : { "retry-after": retryAfter } })
    })
    await runReputationSync()
    const delay = retryAfter === undefined ? 78_000 : Math.min(5 * MINUTE, Math.max(MINUTE, Number(retryAfter) * 1000))
    const until = new Date(NOW.getTime() + delay).toISOString()
    const updates = db.requests.filter((r) => r.method === "PATCH"
      && (r.url.searchParams.has("next_returns_at") || r.url.searchParams.has("next_claims_at")))
    expect(updates.map((r) => r.body)).toEqual([{ next_returns_at: until }, { next_claims_at: until }])
    expect(postPaths()).toHaveLength(1)
  })

  it("reduz detalhes de 12 para 6 por conta e rodada", () => {
    expect(DETAILS_PER_RUN).toBe(6)
  })

  it("atualização manual ignora a pausa do cron e não escreve pausa global", async () => {
    const db = database(1)
    db.tables.recovery_sync[0].next_returns_at = new Date(NOW.getTime() + 8 * MINUTE).toISOString()
    expect(await syncAccountNow("conta-0")).toBe("done")
    expect(postPaths()).toEqual(["/post-purchase/v1/claims/search"])
    expect(db.requests.filter((r) => r.url.pathname.endsWith("/recovery_sync"))).toHaveLength(0)
  })
})
