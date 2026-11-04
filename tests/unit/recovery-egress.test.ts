import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { supabaseFixture } from "./helpers/supabase-fixture"

const mocks = vi.hoisted(() => ({ service: vi.fn(), readReturn: vi.fn(), reviews: vi.fn(), log: vi.fn() }))
vi.mock("@/lib/supabase/admin", () => ({ createServiceClient: mocks.service }))
vi.mock("@/lib/recovery/log", () => ({ logRecovery: mocks.log, shortAccount: (id: string) => id }))
vi.mock("@/lib/reputation/claims-engine", () => ({ syncClaimNow: vi.fn() }))
vi.mock("@/lib/reputation/engine", async (original) => ({
  ...await original<typeof import("@/lib/reputation/engine")>(), applyAlerts: vi.fn(),
}))
vi.mock("@/lib/mercadolivre/reputation", async (original) => ({
  ...await original<typeof import("@/lib/mercadolivre/reputation")>(),
  fetchClaimReturn: mocks.readReturn, fetchReturnReviews: mocks.reviews,
  fetchClaimOrder: vi.fn(async () => { throw new Error("A venda anterior deveria ter sido preservada.") }),
}))

const NOW = new Date("2026-11-04T12:00:00.000Z")
const account = { id: "conta", organization_id: "org", ml_user_id: 123, nickname: "Loja" }
const { CallBudget } = await import("@/lib/mercadolivre/reputation")
let engine: typeof import("@/lib/recovery/engine")

function database(total = 1) {
  const claims = Array.from({ length: total }, (_, i) => ({
    id: `claim-${i}`, claim_id: i + 1, ml_account_id: "conta", type: "returns", status: "closed",
    seller_actions: [], ml_created_at: "2026-11-01T00:00:00Z", ml_updated_at: "2026-11-03T00:00:00Z",
    next_due_at: null, detail: { due_date: "2026-11-06T00:00:00Z" }, resolution: null, order_summary: null,
    resource_id: null, reason_id: null, reason_detail: "Arrependimento", sale_at: null,
  }))
  const returns = claims.map((claim, i) => ({
    id: `return-${i}`, organization_id: "org", ml_account_id: "conta", claim_row_id: claim.id,
    claim_id: claim.claim_id, claim_updated_at: claim.ml_updated_at, synced_at: NOW.toISOString(),
    phase: "closed", return_status: "closed", review_kind: "fail", return_id: 77, order_id: 100 + i,
    review_submitted_at: "2026-11-01T00:00:00Z", reviews: [], amount: 80, item_title: "Produto anterior",
    sale_at: "2026-10-20T00:00:00Z", currency_id: "BRL", recovered_at: "2026-11-02T00:00:00Z",
    can_review_ok: false, can_review_fail: false, destination: "seller_address", shipment_status: "delivered", is_cart: false,
  }))
  const db = supabaseFixture({
    reputation_claims: claims, recovery_returns: returns,
    reputation_sync: [{ ml_account_id: "conta", claims_backfilled_at: NOW.toISOString() }],
    recovery_scans: [{ ml_account_id: "conta", status: "done", started_at: NOW.toISOString() }],
  })
  mocks.service.mockReturnValue(db.client)
  return { ...db, claims, returns }
}

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Rede real proibida neste teste.") }))
  mocks.readReturn.mockResolvedValue(null)
  mocks.reviews.mockResolvedValue([])
  engine = await import("@/lib/recovery/engine")
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe("Recuperador: projeções e leitura em duas etapas", () => {
  it("pagina a fila acima de 1.000 e só lê dados pesados das 15 devoluções escolhidas", async () => {
    const db = database(1020)
    // As 20 depois da primeira página mudaram; uma sem alteração também precisa voltar pelo intervalo.
    for (const row of db.returns.slice(1000)) row.claim_updated_at = "2026-11-02T00:00:00Z"
    Object.assign(db.returns[999], { phase: "reviewed", synced_at: "2026-11-04T10:00:00Z" })
    await engine.syncRecoveryAccount(account, new CallBudget(60), Date.now() + 40_000)

    const reads = db.requests.filter((r) => r.method === "GET" && r.url.pathname.endsWith("/reputation_claims"))
    const pages = reads.filter((r) => r.url.searchParams.has("offset"))
    expect(pages.map((r) => r.url.searchParams.get("offset"))).toEqual(["0", "1000"])
    for (const { url } of pages) {
      expect(url.searchParams.get("select")?.split(",")).toEqual(expect.arrayContaining(["id", "claim_id", "status", "ml_updated_at", "ml_created_at", "seller_actions"]))
      expect(url.searchParams.get("select")).not.toMatch(/\*|detail|resolution|order_summary/)
    }
    const detailed = reads.filter((r) => r.url.searchParams.get("id")?.startsWith("in.("))
    expect(detailed).toHaveLength(1)
    expect(detailed[0].url.searchParams.get("id")?.slice(4, -1).split(",")).toEqual(Array.from({ length: 15 }, (_, i) => `claim-${1000 + i}`))
    expect(mocks.readReturn.mock.calls.map((args) => args[1])).toEqual(Array.from({ length: 15 }, (_, i) => 1001 + i))
    const knownPages = db.requests.filter((r) => r.method === "GET" && r.url.pathname.endsWith("/recovery_returns") && !r.url.searchParams.has("or"))
    expect(knownPages.map((r) => r.url.searchParams.get("offset"))).toEqual(["0", "1000"])
    expect(knownPages[0].url.searchParams.get("select")).not.toContain("*")
    expect(db.requests.find((r) => r.method === "POST" && r.url.pathname.endsWith("/recovery_scans"))?.body).toMatchObject({ returns_total: 1020, returns_done: 1020 })
  })

  it("preserva os valores anteriores, a revisão enviada, o ressarcimento e os pedidos irmãos", async () => {
    const db = database(2)
    Object.assign(db.returns[0], { claim_updated_at: null })
    Object.assign(db.claims[0], { resolution: { benefited: ["respondent"], date_created: "2026-11-02T00:00:00Z" } })
    mocks.readReturn.mockResolvedValue({
      returnId: 77, status: "closed", subtype: null, statusMoney: null, refundAt: null, closedAt: null,
      orders: [{ order_id: 100, item_id: null, return_quantity: null, total_quantity: null }],
      destination: "seller_address", shipmentStatus: "delivered", viaTriage: false, arrivedAt: null, isCart: false,
    })
    await engine.syncRecoveryAccount(account, new CallBudget(60), Date.now() + 40_000)
    expect(mocks.log.mock.calls.filter(([entry]) => entry.resultado === "falha")).toEqual([])
    expect(db.requests.find((r) => r.method === "POST" && r.url.pathname.endsWith("/recovery_returns"))?.body).toMatchObject({
      claim_id: 1, order_id: 100, return_id: 77, item_title: "Produto anterior", amount: 80,
      sale_at: "2026-10-20T00:00:00Z", currency_id: "BRL", recovered_at: "2026-11-02T00:00:00Z", recovered_amount: 80, is_cart: true,
    })
    const columns = db.requests.find((r) => r.url.pathname.endsWith("/recovery_returns") && r.method === "GET")!.url.searchParams.get("select")!.split(",")
    expect(columns).toEqual(expect.arrayContaining(["return_id", "order_id", "claim_id", "review_submitted_at", "review_kind", "reviews", "can_review_ok", "can_review_fail", "destination", "shipment_status", "return_status"]))
  })

  it("mantém a releitura periódica mesmo sem alteração na reclamação", async () => {
    const db = database()
    Object.assign(db.returns[0], { phase: "reviewed", synced_at: "2026-11-04T10:00:00Z" })
    await engine.syncRecoveryAccount(account, new CallBudget(60), Date.now() + 40_000)
    expect(mocks.readReturn).toHaveBeenCalledTimes(1)
  })

  it("usa o modo de revisão gravado para respeitar o intervalo mais longo da contestação", async () => {
    const db = database()
    Object.assign(db.returns[0], {
      phase: "needs_review", synced_at: "2026-11-04T11:40:00Z", destination: "warehouse", can_review_fail: true,
      reviews: [{ order_id: 100, stage: "seller_review_pending", seller_status: "pending" }],
    })
    await engine.syncRecoveryAccount(account, new CallBudget(60), Date.now() + 40_000)
    expect(mocks.readReturn).not.toHaveBeenCalled()
    Object.assign(db.returns[0], { destination: "seller_address", reviews: [], can_review_ok: true })
    await engine.syncRecoveryAccount(account, new CallBudget(60), Date.now() + 40_000)
    expect(mocks.readReturn).toHaveBeenCalledTimes(1)
  })

  it("não busca dados pesados quando nenhuma devolução precisa de atualização", async () => {
    const db = database()
    await engine.syncRecoveryAccount(account, new CallBudget(60), Date.now() + 40_000)
    expect(db.requests.filter((r) => r.method === "GET" && r.url.pathname.endsWith("/reputation_claims") && r.url.searchParams.has("id"))).toHaveLength(0)
    expect(mocks.readReturn).not.toHaveBeenCalled()
  })
})

describe("monitor do Recuperador", () => {
  it("só consulta nos minutos UTC múltiplos de 15, inclusive em instância nova", async () => {
    const db = database()
    await engine.monitorRecoveryHealth(new Date("2026-11-04T12:01:00Z"))
    expect(db.requests).toHaveLength(0)
    await engine.monitorRecoveryHealth(NOW)
    expect(db.requests).toHaveLength(1)
  })

  it("reserva antes do await, ignora chamadas simultâneas e libera após 15 minutos", async () => {
    const db = database()
    await Promise.all([engine.monitorRecoveryHealth(NOW), engine.monitorRecoveryHealth(NOW)])
    await engine.monitorRecoveryHealth(new Date("2026-11-04T12:00:59Z"))
    expect(db.requests).toHaveLength(1)
    await engine.monitorRecoveryHealth(new Date("2026-11-04T12:15:00Z"))
    expect(db.requests).toHaveLength(2)
  })

  it("preserva o diagnóstico e a gravação do motivo das contas paradas dentro da janela permitida", async () => {
    const db = database()
    db.tables.ml_accounts = [{ id: "conta", organization_id: "org", status: "active", token_status: "valid" }]
    db.tables.organizations = [{ id: "org", billing_exempt: true, subscription_status: "active", current_period_end: null, trial_ends_at: "2026-12-01T00:00:00Z" }]
    db.tables.recovery_sync = [{ ml_account_id: "conta", last_returns_at: "2026-11-04T10:00:00Z", last_error: null, last_error_at: null }]
    await engine.monitorRecoveryHealth(NOW)
    expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({ etapa: "sync_parado", conta: "conta" }))
    expect(db.requests.filter((r) => r.method === "PATCH" && r.url.pathname.endsWith("/recovery_sync"))).toHaveLength(1)
    const count = db.requests.length
    await engine.monitorRecoveryHealth(new Date("2026-11-04T12:01:00Z"))
    expect(db.requests).toHaveLength(count)
  })
})
