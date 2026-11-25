import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { supabaseFixture } from "./helpers/supabase-fixture"
import { MlApiError } from "@/lib/mercadolivre/api"

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
}))

const { CallBudget, BudgetExhaustedError } = await import("@/lib/mercadolivre/reputation")
const { syncRecoveryAccount } = await import("@/lib/recovery/engine")
const NOW = new Date("2026-11-04T12:00:00.000Z")
const DUE = "2026-11-07T12:00:00.000Z"
const OLD = "2026-11-04T10:00:00.000Z"
const account = { id: "conta", organization_id: "org", ml_user_id: 123, nickname: "Loja" }

function database() {
  const claim: Record<string, unknown> = {
    id: "claim", claim_id: 1, ml_account_id: "conta", type: "returns", status: "opened",
    seller_actions: [{ action: "return_review_fail", due_date: DUE }],
    ml_created_at: OLD, ml_updated_at: OLD, next_due_at: null, detail: null, resolution: null,
    order_summary: null, resource_id: 100, reason_id: null, reason_detail: "Arrependimento", sale_at: null,
  }
  const review = {
    order_id: 100, method: null, stage: "seller_review_pending", status: null,
    product_condition: "unsaleable", product_destination: "discard", reason_id: "damaged",
    benefited: "buyer", seller_status: "pending", seller_reason: null, updated_at: OLD,
  }
  const order = { order_id: 100, item_id: null, return_quantity: 1, total_quantity: 1 }
  const parsed = {
    returnId: 77, status: "delivered", subtype: null, statusMoney: "refunded", refundAt: null,
    closedAt: null, orders: [order], destination: "warehouse", shipmentStatus: "delivered",
    viaTriage: false, arrivedAt: OLD, isCart: false,
  }
  const row: Record<string, unknown> = {
    id: "return", organization_id: "org", ml_account_id: "conta", claim_row_id: "claim", claim_id: 1,
    return_id: 77, phase: "needs_review", claim_status: "opened", return_status: "delivered",
    return_subtype: null, status_money: "refunded", refund_at: null, shipment_status: "delivered",
    destination: "warehouse", is_cart: false, orders: [order], can_review_ok: false, can_review_fail: true,
    deadline_at: DUE, reviews: [review], order_id: 100, item_title: "Produto", sale_at: null,
    amount: 80, currency_id: "BRL", claim_created_at: OLD, claim_updated_at: OLD,
    ml_closed_at: null, recovered_at: null, recovered_amount: null, synced_at: OLD,
    review_submitted_at: null, review_kind: null,
  }
  const finding: Record<string, unknown> = {
    organization_id: "org", ml_account_id: "conta", return_row_id: "return", dedupe_key: "return:1",
    kind: "return_unsaleable_unreimbursed", confidence: "high", amount: 80, currency_id: "BRL", status: "open",
    evidence: {
      claim_id: 1, order_id: 100, item_title: "Produto", product_condition: "unsaleable",
      product_destination: "discard", reason_id: "damaged", benefited: "buyer", seller_status: "pending",
      status_money: "refunded", buyer_reason: "Arrependimento", reviewed_at: OLD,
      deadline_at: DUE, outcome: "contestable",
    },
  }
  const scan = {
    ml_account_id: "conta", status: "done", started_at: OLD, returns_total: 1, returns_done: 1,
    window_days: 90, completed_at: OLD,
  }
  const db = supabaseFixture({
    reputation_claims: [claim], recovery_returns: [row], recovery_findings: [finding], recovery_scans: [scan],
    reputation_sync: [{ ml_account_id: "conta", claims_backfilled_at: OLD }],
  })
  mocks.service.mockReturnValue(db.client)
  mocks.readReturn.mockResolvedValue(parsed)
  mocks.reviews.mockResolvedValue([review])
  const writes = (table: string, method = "POST") => db.requests.filter((r) => r.method === method && r.url.pathname.endsWith("/" + table))
  const run = () => syncRecoveryAccount(account, new CallBudget(60), Date.now() + 40_000)
  const interval = () => {
    const update = writes("recovery_sync", "PATCH").at(-1)!.body as Record<string, unknown>
    return Date.parse(String(update.next_returns_at)) - NOW.getTime()
  }
  return { ...db, claim, row, finding, scan, parsed, review, order, writes, run, interval }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Rede real proibida neste teste.") }))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe("Recuperador: gravações somente com mudança", () => {
  it("sem mudança, só atualiza synced_at por id e preserva o id usado pelo achado", async () => {
    const db = database()
    // Formatos equivalentes de timestamptz e ordem de chaves JSONB não são mudanças.
    db.row.claim_created_at = "2026-11-04T10:00:00+00:00"
    db.row.claim_updated_at = "2026-11-04T10:00:00+00:00"
    db.row.deadline_at = "2026-11-07T09:00:00-03:00"
    db.row.reviews = [Object.fromEntries(Object.entries(db.review).reverse())]
    db.row.orders = [Object.fromEntries(Object.entries(db.order).reverse())]
    db.finding.evidence = Object.fromEntries(Object.entries(db.finding.evidence as object).reverse())
    await db.run()
    expect(mocks.readReturn).toHaveBeenCalledTimes(1)
    expect(mocks.log.mock.calls.filter(([entry]) => entry.resultado === "falha")).toEqual([])
    for (const table of ["recovery_returns", "recovery_findings", "recovery_scans"]) expect(db.writes(table)).toHaveLength(0)
    expect(db.writes("recovery_returns", "PATCH")).toHaveLength(1)
    expect(db.writes("recovery_returns", "PATCH")[0].body).toEqual({ synced_at: NOW.toISOString() })
    expect(db.writes("recovery_returns", "PATCH")[0].url.searchParams.get("id")).toBe("eq.return")
    const read = db.requests.find((r) => r.method === "GET" && r.url.pathname.endsWith("/recovery_findings"))!
    expect(read.url.searchParams.get("ml_account_id")).toBe("eq.conta")
    expect(read.url.searchParams.get("dedupe_key")).toBe("eq.return:1")
    expect(read.url.searchParams.get("select")).not.toContain("*")
  })

  it("só a versão da reclamação mudou: grava os dois timestamps, sem upsert completo", async () => {
    const db = database()
    db.claim.ml_updated_at = "2026-11-04T11:00:00.000Z"
    await db.run()
    expect(db.writes("recovery_returns")).toHaveLength(0)
    expect(db.writes("recovery_returns", "PATCH")[0].body).toEqual({ synced_at: NOW.toISOString(), claim_updated_at: db.claim.ml_updated_at })
  })

  it.each([
    ["claim_status", "closed"], ["return_subtype", "other"], ["status_money", "retained"],
    ["refund_at", OLD], ["orders", []], ["deadline_at", OLD], ["claim_created_at", null],
    ["ml_closed_at", OLD], ["recovered_amount", 80], ["reviews", []],
  ])("não perde mudança em %s, inclusive nas colunas adicionadas à projeção", async (column, previous) => {
    const db = database()
    db.row[column as string] = previous
    await db.run()
    expect(db.writes("recovery_returns")).toHaveLength(1)
    expect((db.writes("recovery_returns")[0].body as Record<string, unknown>)[column as string]).not.toEqual(previous)
  })

  it("insere uma devolução e um achado novos com o id retornado pelo upsert", async () => {
    const db = database()
    db.tables.recovery_returns = []
    db.tables.recovery_findings = []
    // Evita buscar a venda no ML para a linha nova.
    db.claim.order_summary = { order_id: 100, total_amount: 80, currency_id: "BRL", items: [{ title: "Produto" }] }
    await db.run()
    expect(db.writes("recovery_returns")).toHaveLength(1)
    expect(db.writes("recovery_findings")[0].body).toMatchObject({ return_row_id: "salvo", amount: 80 })
  })

  it.each([
    ["kind", "return_reimbursed"], ["confidence", "low"], ["amount", 1], ["currency_id", "USD"],
    ["evidence", { changed: true }], ["status", "resolved"], ["return_row_id", null],
  ])("atualiza achado se %s mudou, sem regravar a devolução", async (column, previous) => {
    const db = database()
    db.finding[column as string] = previous
    await db.run()
    expect(db.writes("recovery_returns")).toHaveLength(0)
    expect(db.writes("recovery_findings")).toHaveLength(1)
    expect((db.writes("recovery_findings")[0].body as Record<string, unknown>)[column as string]).not.toEqual(previous)
  })

  it.each([
    ["returns_total", 0], ["returns_done", 0], ["window_days", 30], ["status", "running"],
  ])("atualiza progresso se %s mudou", async (column, previous) => {
    const db = database()
    Object.assign(db.scan, { [column]: previous })
    await db.run()
    expect(db.writes("recovery_scans")).toHaveLength(1)
    if (column === "status") expect(db.writes("recovery_scans")[0].body).toMatchObject({ status: "done", completed_at: NOW.toISOString() })
  })

  it("cria o progresso quando ainda não existe", async () => {
    const db = database()
    db.tables.recovery_scans = []
    await db.run()
    expect(db.writes("recovery_scans")[0].body).toMatchObject({ returns_total: 1, returns_done: 1, status: "done", completed_at: NOW.toISOString() })
  })
})

describe("Recuperador: ritmo da conta", () => {
  function arrival(due: string | null, fresh = false) {
    const db = database()
    Object.assign(db.row, { destination: "seller_address", can_review_ok: true, reviews: [], deadline_at: due, synced_at: NOW.toISOString() })
    if (fresh) db.tables.recovery_returns = []
    Object.assign(db.claim, { seller_actions: [{ action: "return_review_ok", due_date: due }], detail: null,
      order_summary: { order_id: 100, total_amount: 80, currency_id: "BRL", items: [] } })
    Object.assign(db.parsed, { destination: "seller_address", arrivedAt: null })
    mocks.reviews.mockResolvedValue([])
    return db
  }

  it.each([
    ["2026-11-06T12:00:00.000Z", 5], ["2026-11-05T11:59:00.000Z", 2],
    ["2026-11-05T12:00:00.000Z", 2], [OLD, 5], [null, 5],
  ])("chegada já conhecida com prazo %s: %i minutos", async (due, minutes) => {
    const db = arrival(due)
    await db.run()
    expect(mocks.readReturn).not.toHaveBeenCalled()
    expect(db.interval()).toBe(minutes * 60_000)
  })

  it.each([false, true])("chegada nova, prazo nulo ou estimado (estimado=%s): 2 minutos só nesta rodada", async (estimated) => {
    const db = arrival(null, true)
    if (estimated) db.parsed.arrivedAt = NOW.toISOString()
    await db.run()
    expect(db.writes("recovery_returns")).toHaveLength(1)
    expect(db.interval()).toBe(2 * 60_000)
    const saved = db.writes("recovery_returns")[0].body as Record<string, unknown>
    db.tables.recovery_returns = [{ ...db.row, ...saved, id: "salvo" }]
    await db.run()
    expect(db.interval()).toBe(5 * 60_000)
  })

  it("prazo real distante não acelera nem uma chegada nova", async () => {
    const db = arrival(DUE, true)
    await db.run()
    expect(db.interval()).toBe(5 * 60_000)
  })

  it("usa o prazo atualizado nesta rodada, em vez da linha antiga", async () => {
    const db = arrival(DUE)
    db.row.synced_at = OLD
    db.claim.seller_actions = [{ action: "return_review_ok", due_date: "2026-11-04T13:00:00.000Z" }]
    await db.run()
    expect(db.interval()).toBe(2 * 60_000)
  })

  it("fila inacabada mantém 1 minuto", async () => {
    const db = database()
    await syncRecoveryAccount(account, new CallBudget(0), Date.now() + 40_000)
    expect(db.interval()).toBe(60_000)
  })

  it.each([new BudgetExhaustedError(), new MlApiError("limite", 429)])("preserva interrupções e rate limit: %s", async (error) => {
    const db = database()
    mocks.readReturn.mockRejectedValue(error)
    await db.run()
    expect(db.interval()).toBe(error instanceof BudgetExhaustedError ? 60_000 : 2 * 60_000)
  })
})
