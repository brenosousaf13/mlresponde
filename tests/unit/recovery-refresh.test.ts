import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MlAccountUnavailableError } from "@/lib/mercadolivre/accounts"
import { MlApiError } from "@/lib/mercadolivre/api"
import type { RecoveryLogEntry } from "@/lib/recovery/log"
import {
  NEEDS_REVIEW_FAR_REFRESH_MS,
  NEEDS_REVIEW_REFRESH_MS,
  SLOW_REFRESH_MS,
  refreshInterval,
  returnsQueue,
  type KnownReturn,
  type QueueClaim,
} from "@/lib/recovery/returns"
import { supabaseFixture } from "./helpers/supabase-fixture"

const mocks = vi.hoisted(() => ({ service: vi.fn(), readReturn: vi.fn(), reviews: vi.fn() }))
vi.mock("@/lib/supabase/admin", () => ({ createServiceClient: mocks.service }))
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
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const OLD = "2026-11-04T10:00:00.000Z"
const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR).toISOString()
const account = { id: "account-1234", organization_id: "org", ml_user_id: 123, nickname: "Loja privada" }
const lines: string[] = []

beforeEach(() => {
  vi.clearAllMocks()
  mocks.readReturn.mockReset()
  mocks.reviews.mockReset()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Rede real proibida neste teste.") }))
  lines.length = 0
  vi.spyOn(console, "log").mockImplementation((line) => { lines.push(String(line)) })
  vi.spyOn(console, "error").mockImplementation((line) => { lines.push(String(line)) })
})
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals() })

function known(overrides: Partial<KnownReturn> = {}): KnownReturn {
  return {
    phase: "needs_review", mode: "arrival", deadline_at: at(30),
    claim_updated_at: OLD, synced_at: new Date(NOW.getTime() - 15 * MINUTE).toISOString(),
    ...overrides,
  }
}
const claim: QueueClaim = { claim_id: 1, status: "opened", ml_updated_at: OLD, ml_created_at: OLD }

describe("intervalo de releitura das revisões", () => {
  it("arrival com prazo em 30h: 30 minutos; fora da fila aos 15 e aos 30, dentro aos 31", () => {
    const row = known()
    const state = new Map([[1, row]])
    expect(NEEDS_REVIEW_FAR_REFRESH_MS).toBe(30 * MINUTE)
    expect(refreshInterval("opened", row, NOW)).toBe(NEEDS_REVIEW_FAR_REFRESH_MS)
    expect(returnsQueue([claim], state, NOW)).toEqual([])
    expect(returnsQueue([claim], state, new Date(Date.parse(row.synced_at) + 30 * MINUTE))).toEqual([])
    expect(returnsQueue([claim], state, new Date(Date.parse(row.synced_at) + 31 * MINUTE))).toEqual([claim])
  })

  it.each([at(10), at(24), null, undefined, "invalido", NOW.toISOString(), at(-1)])(
    "arrival com prazo %s: mantém 10 minutos, inclusive sem prazo e vencido", (deadline_at) => {
      const row = known({ deadline_at })
      expect(NEEDS_REVIEW_REFRESH_MS).toBe(10 * MINUTE)
      expect(refreshInterval("opened", row, NOW)).toBe(NEEDS_REVIEW_REFRESH_MS)
      expect(returnsQueue([claim], new Map([[1, row]]), NOW)).toEqual([claim])
      row.synced_at = new Date(NOW.getTime() - 9 * MINUTE).toISOString()
      expect(returnsQueue([claim], new Map([[1, row]]), NOW)).toEqual([])
    }
  )

  it("usa o relógio da rodada e passa para 10 minutos exatamente ao entrar nas últimas 24h", () => {
    const row = known({ deadline_at: at(24 + 1 / 60), synced_at: new Date(NOW.getTime() - 11 * MINUTE).toISOString() })
    const state = new Map([[1, row]])
    expect(returnsQueue([claim], state, NOW)).toEqual([])
    expect(returnsQueue([claim], state, new Date(NOW.getTime() + MINUTE))).toEqual([claim])
  })

  it.each([at(30), at(10), null, "invalido", at(-1)])("appeal com prazo %s: mantém 60 minutos", (deadline_at) => {
    const row = known({ mode: "appeal", deadline_at, synced_at: new Date(NOW.getTime() - 31 * MINUTE).toISOString() })
    expect(SLOW_REFRESH_MS).toBe(60 * MINUTE)
    expect(refreshInterval("closed", row, NOW)).toBe(SLOW_REFRESH_MS)
    expect(returnsQueue([{ ...claim, status: "closed" }], new Map([[1, row]]), NOW)).toEqual([])
    row.synced_at = new Date(NOW.getTime() - 61 * MINUTE).toISOString()
    expect(returnsQueue([{ ...claim, status: "closed" }], new Map([[1, row]]), NOW)).toEqual([{ ...claim, status: "closed" }])
  })

  it.each(["arrival", "appeal"] as const)("reclamação alterada no ML entra imediatamente, modo %s", (mode) => {
    const updated = { ...claim, ml_updated_at: NOW.toISOString() }
    expect(returnsQueue([updated], new Map([[1, known({ mode, synced_at: NOW.toISOString() })]]), NOW)).toEqual([updated])
  })

  it("E4b: novidades antes das regras antigas com ação; mantém a elegibilidade dos intervalos", () => {
    const claims = [5, 4, 3, 2, 1].map((claim_id) => ({ ...claim, claim_id, hasReviewAction: claim_id === 3 }))
    const state = new Map([
      [2, known({ synced_at: NOW.toISOString(), claim_updated_at: null })],
      [3, known({ synced_at: "2026-11-04T11:58:00.000Z" })],
      [4, known({ synced_at: "2026-11-04T11:29:00.000Z" })],
      [5, known()],
    ])
    expect(returnsQueue(claims, state, NOW, "2026-11-04T11:59:00.000Z").map((row) => row.claim_id)).toEqual([1, 2, 3, 4, 5])
  })
})

function database(total = 1, minutesSinceSync = 15) {
  const claims = Array.from({ length: total }, (_, i) => ({
    id: `claim-${i}`, claim_id: i + 1, ml_account_id: account.id, type: "returns", status: "opened",
    seller_actions: [{ action: "return_review_ok", due_date: at(30) }], ml_created_at: OLD, ml_updated_at: OLD,
    next_due_at: null, detail: null, resolution: null, resource_id: 100 + i, reason_id: null,
    reason_detail: null, sale_at: null,
    order_summary: { order_id: 100 + i, total_amount: 80, currency_id: "BRL", items: [] },
  }))
  const rows = claims.map((candidate, i) => ({
    id: `return-${i}`, organization_id: account.organization_id, ml_account_id: account.id,
    claim_row_id: candidate.id, claim_id: candidate.claim_id, claim_updated_at: OLD,
    synced_at: new Date(NOW.getTime() - minutesSinceSync * MINUTE).toISOString(),
    phase: "needs_review", return_id: 77 + i, return_status: "delivered", order_id: 100 + i,
    can_review_ok: true, can_review_fail: false, destination: "seller_address", shipment_status: "delivered",
    reviews: [], review_submitted_at: null, review_kind: null, deadline_at: at(30),
    amount: 80, item_title: "Produto privado", currency_id: "BRL", sale_at: null, recovered_at: null, is_cart: false,
  }))
  const db = supabaseFixture({
    reputation_claims: claims, recovery_returns: rows,
    reputation_sync: [{ ml_account_id: account.id, claims_backfilled_at: OLD }],
    recovery_scans: [{ ml_account_id: account.id, status: "done", started_at: OLD }],
  })
  mocks.service.mockReturnValue(db.client)
  mocks.readReturn.mockImplementation(async (_accountId, claimId: number, budget: InstanceType<typeof CallBudget>) => {
    budget.take()
    return {
      returnId: 76 + claimId, status: "delivered", subtype: null, statusMoney: null, refundAt: null, closedAt: null,
      orders: [{ order_id: 99 + claimId, item_id: null, return_quantity: 1, total_quantity: 1 }],
      destination: "seller_address", shipmentStatus: "delivered", viaTriage: false, arrivedAt: null, isCart: false,
    }
  })
  mocks.reviews.mockImplementation(async (_accountId, _returnId, budget: InstanceType<typeof CallBudget>) => {
    budget.take()
    return []
  })
  const run = (budget = new CallBudget(60), deadline = Date.now() + 40_000) => syncRecoveryAccount(account, budget, deadline)
  return { ...db, claims, rows, run }
}

type RoundLog = Extract<RecoveryLogEntry, { etapa: "rodada" }>
function expectRound(db: ReturnType<typeof database>, expected: Pick<RoundLog, "fila" | "lidas" | "proxima_minutos" | "motivo"> & { resultado?: "ok" | "falha" }) {
  const rounds = lines.filter((line) => line.startsWith("[recuperador] "))
    .map((line) => JSON.parse(line.slice("[recuperador] ".length)))
    .filter((entry) => entry.etapa === "rodada")
  expect(rounds).toEqual([{ etapa: "rodada", conta: "1234", resultado: "ok", urgentes: expected.motivo === "revisao_24h" ? 1 : 0, urgentes_lidos: expected.motivo === "revisao_24h" ? 1 : 0, ...expected }])
  const update = db.requests.filter((r) => r.method === "PATCH" && r.url.pathname.endsWith("/recovery_sync")).at(-1)!
  expect(Date.parse(String((update.body as Record<string, unknown>).next_returns_at)) - Date.now()).toBe(expected.proxima_minutos * MINUTE)
}

describe("rodada da conta: prazo gravado e log estruturado sem dados pessoais", () => {
  it("passa deadline_at para a fila: não lê aos 15 minutos e lê aos 31", async () => {
    const db = database()
    await db.run()
    expect(mocks.readReturn).not.toHaveBeenCalled()
    expectRound(db, { fila: 0, lidas: 0, proxima_minutos: 5, motivo: "normal" })
    const columns = db.requests.find((r) => r.method === "GET" && r.url.pathname.endsWith("/recovery_returns"))!.url.searchParams.get("select")!
    expect(columns.split(",")).toContain("deadline_at")
    lines.length = 0
    vi.setSystemTime(new Date(NOW.getTime() + 16 * MINUTE))
    await db.run()
    expect(mocks.readReturn).toHaveBeenCalledTimes(1)
    expectRound(db, { fila: 1, lidas: 1, proxima_minutos: 5, motivo: "normal" })
  })

  it("usa o prazo de 10h para a releitura e registra revisao_24h", async () => {
    const db = database()
    db.rows[0].deadline_at = at(10)
    db.claims[0].seller_actions[0].due_date = at(10)
    await db.run()
    expect(mocks.readReturn).toHaveBeenCalledTimes(1)
    expectRound(db, { fila: 1, lidas: 1, proxima_minutos: 2, motivo: "revisao_24h" })
  })

  it("registra chegada_nova ao descobrir chegada sem prazo", async () => {
    const db = database()
    db.tables.recovery_returns = []
    db.claims[0].seller_actions = [{ action: "return_review_ok", due_date: "" }]
    await db.run()
    expectRound(db, { fila: 1, lidas: 1, proxima_minutos: 2, motivo: "chegada_nova" })
  })

  it("registra aguardando antes da busca inicial do Escudo", async () => {
    const db = database()
    db.tables.reputation_sync = []
    await db.run()
    expect(mocks.readReturn).not.toHaveBeenCalled()
    expectRound(db, { fila: 0, lidas: 0, proxima_minutos: 2, motivo: "aguardando" })
  })

  it("registra o tamanho total da fila e as 15 lidas quando a rodada fica inacabada", async () => {
    const db = database(16, 31)
    await db.run()
    expect(mocks.readReturn).toHaveBeenCalledTimes(15)
    expectRound(db, { fila: 16, lidas: 15, proxima_minutos: 1, motivo: "inacabado" })
  })

  it.each(["chamadas", "tempo"])("registra orcamento ao esgotar %s antes da primeira leitura", async (kind) => {
    const db = database(1, 31)
    await db.run(new CallBudget(kind === "chamadas" ? 0 : 60), Date.now() + (kind === "tempo" ? -1 : 40_000))
    expect(mocks.readReturn).not.toHaveBeenCalled()
    expectRound(db, { fila: 1, lidas: 0, proxima_minutos: 1, motivo: "orcamento" })
  })

  it("preserva lidas e usa o next final quando o orçamento acaba depois de uma devolução", async () => {
    const db = database(2, 31)
    await db.run(new CallBudget(2))
    expectRound(db, { fila: 2, lidas: 1, proxima_minutos: 1, motivo: "orcamento" })
  })

  it("registra rate_limit já atingido por outra conta, preservando o next de fila inacabada", async () => {
    const db = database(1, 31)
    const budget = new CallBudget(60)
    budget.rateLimited = true
    await db.run(budget)
    expect(mocks.readReturn).not.toHaveBeenCalled()
    expectRound(db, { fila: 1, lidas: 0, proxima_minutos: 1, motivo: "rate_limit" })
  })

  it.each([
    { error: new BudgetExhaustedError(), motivo: "orcamento", minutes: 1, limited: false, resultado: "ok" },
    { error: new BudgetExhaustedError(), motivo: "rate_limit", minutes: 2, limited: true, resultado: "ok" },
    { error: new MlApiError("limite", 429), motivo: "rate_limit", minutes: 2, limited: false, resultado: "ok" },
    { error: new MlAccountUnavailableError("Conta indisponível"), motivo: "indisponivel", minutes: 30, limited: false, resultado: "falha" },
  ] as const)("registra $motivo com o intervalo final de $minutes minutos", async ({ error, motivo, minutes, limited, resultado }) => {
    const db = database(1, 31)
    const budget = new CallBudget(60)
    mocks.readReturn.mockImplementation(async () => { budget.rateLimited = limited; throw error })
    await db.run(budget)
    expectRound(db, { fila: 1, lidas: 0, proxima_minutos: minutes, motivo, resultado })
  })

  it("registra erro de consulta mesmo antes de montar a fila", async () => {
    const db = database()
    const from = db.client.from.bind(db.client)
    vi.spyOn(db.client, "from").mockImplementation((table) => {
      if (table === "reputation_sync") throw new Error("Falha de consulta")
      return from(table)
    })
    await db.run()
    expectRound(db, { fila: 0, lidas: 0, proxima_minutos: 5, motivo: "erro", resultado: "falha" })
  })

  it("emite uma única linha de rodada mesmo se falhar ao gravar o próximo horário", async () => {
    const db = database()
    const from = db.client.from.bind(db.client)
    vi.spyOn(db.client, "from").mockImplementation((table) => {
      if (table === "recovery_sync") throw new Error("Falha de gravação")
      return from(table)
    })
    await expect(db.run()).rejects.toThrow("Falha de gravação")
    const rounds = lines.filter((line) => line.includes('"etapa":"rodada"'))
    expect(rounds).toHaveLength(1)
    expect(JSON.parse(rounds[0].slice("[recuperador] ".length))).toEqual({
      etapa: "rodada", conta: "1234", resultado: "falha", fila: 0, lidas: 0, urgentes: 0, urgentes_lidos: 0, proxima_minutos: 5, motivo: "erro",
    })
  })
})
