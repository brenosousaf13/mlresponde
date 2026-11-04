import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { supabaseFixture } from "./helpers/supabase-fixture"

const mocks = vi.hoisted(() => ({ service: vi.fn(), token: vi.fn(), fetch: vi.fn() }))
vi.mock("@/lib/supabase/admin", () => ({ createServiceClient: mocks.service }))
vi.mock("@/lib/mercadolivre/accounts", async (original) => ({
  ...await original<typeof import("@/lib/mercadolivre/accounts")>(),
  getValidAccessToken: mocks.token,
}))

let engine: typeof import("@/lib/customers/engine")
beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-04T12:00:00Z"))
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  mocks.token.mockImplementation(async (id: string) => `ficticio-${id}`)
  mocks.fetch.mockImplementation(async (_url, init) => {
    const seller = new Headers(init.headers).get("authorization")?.endsWith("conta-2") ? 456 : 123
    return new Response(JSON.stringify({ id: 999, seller: { id: seller }, buyer: { id: 888 }, status: "paid", date_created: "2026-11-04T12:00:00Z", order_items: [], total_amount: 50, currency_id: "BRL" }))
  })
  vi.stubGlobal("fetch", mocks.fetch)
  engine = await import("@/lib/customers/engine")
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

function database() {
  const organizations = { trial_ends_at: "2026-12-01T00:00:00Z", subscription_status: "trialing", billing_exempt: false, current_period_end: null }
  const db = supabaseFixture({ ml_accounts: [
    { id: "conta-1", ml_user_id: 123, status: "active", organizations },
    { id: "conta-2", ml_user_id: 456, status: "active", organizations },
  ] })
  mocks.service.mockReturnValue(db.client)
  return db
}

describe("notificações de venda: deduplicação por conta e pedido", () => {
  it("deduplica chamadas simultâneas e lê conta e token uma única vez", async () => {
    const db = database()
    await Promise.all([engine.handleOrder(123, 999), engine.handleOrder(123, 999), engine.handleOrder(123, 999)])
    expect(db.requests.filter((r) => r.url.pathname.endsWith("/ml_accounts"))).toHaveLength(1)
    expect(mocks.token).toHaveBeenCalledTimes(1)
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(db.requests.filter((r) => r.url.pathname.endsWith("/ingest_ml_orders"))).toHaveLength(1)
    vi.advanceTimersByTime(59_999)
    await engine.handleOrder(123, 999)
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    await engine.handleOrder(123, 999)
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
  })

  it("não mistura pedidos diferentes ou contas diferentes", async () => {
    database()
    await engine.handleOrder(123, 999)
    await engine.handleOrder(123, 1000)
    await engine.handleOrder(456, 999)
    expect(mocks.fetch).toHaveBeenCalledTimes(3)
    expect(mocks.token.mock.calls.map((args) => args[0])).toEqual(["conta-1", "conta-1", "conta-2"])
  })

  it("também deduplica quando a conta já veio carregada pelo consumidor", async () => {
    const db = database()
    const account = {
      id: "conta-1", ml_user_id: 123, status: "active",
      organizations: { trial_ends_at: "2026-12-01T00:00:00Z", subscription_status: "trialing", billing_exempt: false, current_period_end: null },
    }
    await Promise.all([engine.handleOrderNotification(account, 999), engine.handleOrderNotification(account, 999)])
    await engine.handleOrder(123, 999)
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(mocks.token).toHaveBeenCalledTimes(1)
    expect(db.requests.filter((r) => r.url.pathname.endsWith("/ml_accounts"))).toHaveLength(0)
    expect(db.requests.filter((r) => r.url.pathname.endsWith("/ingest_ml_orders"))).toHaveLength(1)
  })

  it("permite nova tentativa imediata se a leitura do ML falhar", async () => {
    const db = database()
    mocks.fetch.mockRejectedValueOnce(new Error("Falha passageira simulada"))
    await engine.handleOrder(123, 999)
    await engine.handleOrder(123, 999)
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    expect(db.requests.filter((r) => r.url.pathname.endsWith("/ingest_ml_orders"))).toHaveLength(1)
  })

  it("mantém os bloqueios de acesso e ignora venda cujo vendedor é outra conta", async () => {
    const db = database()
    db.tables.ml_accounts[0].status = "inactive"
    await engine.handleOrder(123, 999)
    expect(mocks.token).not.toHaveBeenCalled()
    db.tables.ml_accounts[0].status = "active"
    db.tables.ml_accounts[0].organizations = { trial_ends_at: "2026-01-01T00:00:00Z", subscription_status: "canceled", billing_exempt: false, current_period_end: null }
    await engine.handleOrder(123, 999)
    expect(mocks.token).not.toHaveBeenCalled()
    db.tables.ml_accounts[0].organizations = { trial_ends_at: "2026-12-01T00:00:00Z", subscription_status: "trialing", billing_exempt: false, current_period_end: null }
    mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 999, seller: { id: 789 } })))
    await engine.handleOrder(123, 999)
    expect(db.requests.filter((r) => r.url.pathname.endsWith("/ingest_ml_orders"))).toHaveLength(0)
  })

  it("permite nova tentativa quando a primeira consulta da conta falha", async () => {
    const db = database()
    mocks.service.mockImplementationOnce(() => { throw new Error("Banco simulado indisponível") })
    await engine.handleOrder(123, 999)
    await engine.handleOrder(123, 999)
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(db.requests.filter((r) => r.url.pathname.endsWith("/ingest_ml_orders"))).toHaveLength(1)
  })
})
