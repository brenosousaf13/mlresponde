import { beforeEach, describe, expect, it, vi } from "vitest"

// Gancho das reclamações do cron do Escudo com banco e ML simulados: confere que as gravações saem agrupadas
// (1 leitura das vendas, 1 gravação das mensagens, mensagens antes das reclamações) e que um limite de chamadas no meio
// ainda grava o que já foi lido.

type Call = { table: string; op: string; payload?: unknown; filters: [string, unknown][]; columns?: string }

const mocks = vi.hoisted(() => {
  const state = { calls: [] as Call[], candidates: [] as Record<string, unknown>[], orders: [] as Record<string, unknown>[] }
  function builder(table: string) {
    const call: Call = { table, op: "select", filters: [] }
    state.calls.push(call)
    const result = () => {
      if (call.op !== "select") return { data: null, error: null }
      if (table === "ml_orders") return { data: state.orders, error: null }
      if (table === "reputation_claims" && call.columns === "*") return { data: state.candidates, error: null }
      return { data: [], error: null }
    }
    const query: Record<string, unknown> = {
      select: (columns: string) => {
        call.columns = columns
        return query
      },
      update: (payload: unknown) => {
        call.op = "update"
        call.payload = payload
        return query
      },
      upsert: (payload: unknown) => {
        call.op = "upsert"
        call.payload = payload
        return query
      },
      eq: (column: string, value: unknown) => {
        call.filters.push([column, value])
        return query
      },
      in: (column: string, value: unknown) => {
        call.filters.push([column, value])
        return query
      },
      or: () => query,
      order: () => query,
      limit: () => query,
      maybeSingle: () => query,
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve, reject),
    }
    return query
  }
  return { state, supabase: { from: (table: string) => builder(table) } }
})

vi.mock("@/lib/supabase/admin", () => ({ createServiceClient: () => mocks.supabase }))
vi.mock("@/lib/mercadolivre/reputation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mercadolivre/reputation")>()
  const call = <T>(budget: InstanceType<typeof actual.CallBudget>, value: T) => {
    budget.take()
    return Promise.resolve(value)
  }
  return {
    ...actual,
    fetchClaim: vi.fn((_account: string, claimId: number, budget: InstanceType<typeof actual.CallBudget>) =>
      call(budget, {
        id: claimId,
        type: "mediations",
        status: "opened",
        stage: "claim",
        resource: "order",
        resource_id: 9000 + claimId,
        date_created: "2026-10-19T10:00:00.000Z",
        last_updated: "2026-10-20T10:00:00.000Z",
        players: [],
      })
    ),
    fetchClaimDetail: vi.fn((_a: string, _c: number, budget: InstanceType<typeof actual.CallBudget>) => call(budget, {})),
    fetchClaimMessages: vi.fn((_a: string, claimId: number, budget: InstanceType<typeof actual.CallBudget>) =>
      call(budget, [{ sender_role: "complainant", receiver_role: "respondent", message: "Mensagem " + claimId, date_created: "2026-10-20T09:00:00.000Z" }])
    ),
    fetchClaimExpectedResolutions: vi.fn((_a: string, _c: number, budget: InstanceType<typeof actual.CallBudget>) => call(budget, [])),
    fetchClaimReasonDetail: vi.fn((_a: string, _r: string, budget: InstanceType<typeof actual.CallBudget>) => call(budget, "Motivo")),
    fetchShipmentInfo: vi.fn((_a: string, _s: number, budget: InstanceType<typeof actual.CallBudget>) => call(budget, { status: "delivered" })),
    fetchClaimOrder: vi.fn((_a: string, _o: number, budget: InstanceType<typeof actual.CallBudget>) => call(budget, null)),
  }
})
vi.mock("@/lib/reputation/engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/reputation/engine")>()),
  applyAlerts: vi.fn(async () => undefined),
}))

const { BudgetExhaustedError, CallBudget } = await import("@/lib/mercadolivre/reputation")
const { claimsHook } = await import("@/lib/reputation/claims-engine")

const account = { id: "conta-1", organization_id: "org-1", ml_user_id: 123, nickname: "LOJA" }
const now = new Date("2026-10-20T12:00:00.000Z")

function candidate(claimId: number) {
  return {
    id: "row-" + claimId,
    claim_id: claimId,
    type: "mediations",
    status: "opened",
    stage: "claim",
    resource: "order",
    resource_id: 9000 + claimId,
    reason_id: "PDD1",
    reason_detail: "Motivo",
    details_synced_at: null,
    ml_updated_at: "2026-10-20T10:00:00.000Z",
    next_due_at: null,
    seller_actions: [],
    order_summary: null,
    buyer_nickname: null,
    shipping: null,
    ai_input_hash: null,
    ai_status: null,
    ai_analyses: 0,
  }
}

const writes = () => mocks.state.calls.filter((call) => call.op !== "select")

describe("claimsHook (gravações agrupadas)", () => {
  beforeEach(() => {
    mocks.state.calls = []
    mocks.state.candidates = [candidate(1), candidate(2), candidate(3)]
    mocks.state.orders = [
      { ml_order_id: 9001, pack_id: null, ordered_at: "2026-10-10T10:00:00.000Z", total_amount: 100, currency_id: "BRL", items: [], shipment_id: 555, ml_customers: { nickname: "COMPRADOR" } },
    ]
  })

  it("lê as vendas numa consulta só e grava mensagens (1 vez) antes das reclamações", async () => {
    const pending = await claimsHook(account, [], new CallBudget(100), now)

    expect(pending).toBe(false)
    const orderReads = mocks.state.calls.filter((call) => call.table === "ml_orders")
    expect(orderReads).toHaveLength(1)
    expect(orderReads[0].filters).toContainEqual(["ml_order_id", [9001, 9002, 9003]])

    const [messages, ...updates] = writes()
    expect(messages).toMatchObject({ table: "reputation_claim_messages", op: "upsert" })
    expect(messages.payload).toHaveLength(3)
    expect(updates).toHaveLength(3)
    expect(updates.every((call) => call.table === "reputation_claims" && call.op === "update")).toBe(true)
    expect(updates.map((call) => call.filters[0][1]).sort()).toEqual(["row-1", "row-2", "row-3"])
    const first = updates.find((call) => call.filters[0][1] === "row-1")?.payload as Record<string, unknown>
    expect(first).toMatchObject({ buyer_nickname: "COMPRADOR", messages_count: 1, details_synced_at: now.toISOString(), ai_status: "pending" })
  })

  it("limite de chamadas no meio: grava o que já leu e avisa a rodada", async () => {
    const reputation = await import("@/lib/mercadolivre/reputation")
    vi.mocked(reputation.fetchClaim).mockImplementationOnce(async () => {
      throw new BudgetExhaustedError()
    })
    await expect(claimsHook(account, [], new CallBudget(100), now)).rejects.toBeInstanceOf(BudgetExhaustedError)
    const updates = writes().filter((call) => call.table === "reputation_claims")
    expect(updates.map((call) => call.filters[0][1]).sort()).toEqual(["row-2", "row-3"])
    expect(writes()[0]).toMatchObject({ table: "reputation_claim_messages", op: "upsert" })
  })

  it("vendas que não estão gravadas não geram uma consulta ao banco por reclamação", async () => {
    await claimsHook(account, [], new CallBudget(100), now)
    expect(mocks.state.calls.filter((call) => call.table === "ml_orders")).toHaveLength(1)
  })
})
