import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Recovery429Deferrals, RECOVERY_429_DEFERRAL_CAP } from "@/lib/recovery/rate-limit-deferrals"
import { returnsQueue, type KnownReturn } from "@/lib/recovery/returns"
import { supabaseFixture } from "./helpers/supabase-fixture"

const mocks = vi.hoisted(() => ({ service: vi.fn(), readReturn: vi.fn(), reviews: vi.fn(), order: vi.fn(), log: vi.fn(), accounts: vi.fn() }))
vi.mock("@/lib/supabase/admin", () => ({ createServiceClient: mocks.service }))
vi.mock("@/lib/recovery/log", () => ({ logRecovery: mocks.log, shortAccount: (id: string) => id.slice(-4) }))
vi.mock("@/lib/reputation/claims-engine", () => ({ syncClaimNow: vi.fn() }))
vi.mock("@/lib/reputation/engine", async (original) => ({
  ...await original<typeof import("@/lib/reputation/engine")>(), applyAlerts: vi.fn(), loadAccounts: mocks.accounts,
}))
vi.mock("@/lib/mercadolivre/reputation", async (original) => ({
  ...await original<typeof import("@/lib/mercadolivre/reputation")>(),
  fetchClaimReturn: mocks.readReturn, fetchReturnReviews: mocks.reviews, fetchClaimOrder: mocks.order,
}))

let NOW = new Date("2026-11-26T12:01:00.000Z")
const account = { id: "account-1234", organization_id: "org", ml_user_id: 123, nickname: "Loja" }
let engine: typeof import("@/lib/recovery/engine")
let ml: typeof import("@/lib/mercadolivre/reputation")
let api: typeof import("@/lib/mercadolivre/api")

beforeEach(async () => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  // Expira os adiamentos da instância entre casos sem trocar a identidade das classes dos mocks parciais.
  NOW = new Date(NOW.getTime() + 24 * 60 * 60_000)
  vi.setSystemTime(NOW)
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Rede real proibida neste teste.") }))
  vi.spyOn(Math, "random").mockReturnValue(0.5)
  engine = await import("@/lib/recovery/engine")
  ml = await import("@/lib/mercadolivre/reputation")
  api = await import("@/lib/mercadolivre/api")
})
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals() })

function database(total = 2, accountIds = [account.id]) {
  const claims = accountIds.flatMap((ml_account_id, a) => Array.from({ length: total }, (_, i) => ({
    id: `claim-${a}-${i}`, claim_id: a * 100 + i + 1, ml_account_id, type: "returns", status: "opened",
    seller_actions: [], ml_created_at: NOW.toISOString(), ml_updated_at: NOW.toISOString(),
    next_due_at: null, detail: null, resolution: null, resource_id: 1000 + i, reason_id: null,
    reason_detail: null, sale_at: null,
    order_summary: { order_id: 1000 + i, total_amount: 80, currency_id: "BRL", items: [] },
  })))
  // Nenhum item tem linha em recovery_returns: o adiamento também precisa funcionar no Raio-X inicial.
  const db = supabaseFixture({
    reputation_claims: claims, recovery_returns: [],
    reputation_sync: accountIds.map((ml_account_id) => ({ ml_account_id, claims_backfilled_at: NOW.toISOString() })),
    recovery_scans: [],
  })
  mocks.service.mockReturnValue(db.client)
  mocks.readReturn.mockImplementation(async (_accountId, _claimId, budget: InstanceType<typeof ml.CallBudget>) => {
    budget.take()
    return null
  })
  const round = { rateLimitStopped: false }
  const run = (budget = new ml.CallBudget(60, "recuperador_cron")) => {
    round.rateLimitStopped = false
    return engine.syncRecoveryAccount(account, budget, Date.now() + 40_000, round)
  }
  return { ...db, claims, run, round }
}

function limited(budget: InstanceType<typeof ml.CallBudget>, path = "/post-purchase/v2/claims/1/returns"): never {
  budget.take()
  budget.rateLimited = true
  throw new api.MlApiError("limite", 429, "local_rate_limited", path)
}

function rounds() {
  return mocks.log.mock.calls.map(([entry]) => entry).filter((entry) => entry.etapa === "rodada")
}

function nextMinutes(db: ReturnType<typeof database>, accountId = account.id) {
  const update = db.requests.filter((r) => r.method === "PATCH" && r.url.pathname.endsWith("/recovery_sync") && r.url.searchParams.get("ml_account_id") === "eq." + accountId).at(-1)!
  return (Date.parse(String((update.body as Record<string, unknown>).next_returns_at)) - Date.now()) / 60_000
}

describe("cron do Recuperador: 429 por recurso", () => {
  it("adia o item 1 sem marcá-lo como lido e lê o item 2 na mesma rodada", async () => {
    const db = database()
    mocks.readReturn.mockImplementationOnce(async (_accountId, _claimId, budget) => limited(budget))
    const budget = new ml.CallBudget(60, "recuperador_cron")
    await db.run(budget)
    expect(mocks.readReturn.mock.calls.map((args) => args[1])).toEqual([1, 2])
    expect(budget.remaining).toBe(58)
    expect(budget.rateLimited).toBe(false)
    expect(rounds()).toEqual([expect.objectContaining({ fila: 2, lidas: 1, pulados_429: 1, adiados: 0, motivo: "inacabado" })])
    const writes = db.requests.filter((r) => r.method === "POST" && r.url.pathname.endsWith("/recovery_returns"))
    expect(writes.map((r) => (r.body as Record<string, unknown>).claim_id)).toEqual([2])
  })

  it("não seleciona o item adiado antes de 12,5 min e volta a selecioná-lo no vencimento", async () => {
    const db = database()
    mocks.readReturn.mockImplementationOnce(async (_accountId, _claimId, budget) => limited(budget))
    await db.run()
    mocks.readReturn.mockClear()
    vi.setSystemTime(NOW.getTime() + 12.5 * 60_000 - 1)
    await db.run()
    expect(mocks.readReturn.mock.calls.map((args) => args[1])).toEqual([2])
    expect(rounds().at(-1)).toMatchObject({ fila: 2, lidas: 1, adiados: 1, pulados_429: 0 })
    const selected = db.requests.filter((r) => r.url.pathname.endsWith("/reputation_claims") && r.url.searchParams.has("id")).at(-1)!
    expect(selected.url.searchParams.get("id")).toBe("in.(claim-0-1)")
    vi.advanceTimersByTime(1)
    mocks.readReturn.mockClear()
    await db.run()
    expect(mocks.readReturn.mock.calls.map((args) => args[1])).toEqual([1, 2])
    expect(rounds().at(-1)).toMatchObject({ adiados: 0, pulados_429: 0 })
  })

  it("também adia quando o 429 vem das revisões, sem gravar uma leitura parcial", async () => {
    const db = database()
    mocks.readReturn.mockImplementationOnce(async (_id, _claimId, budget) => {
      budget.take()
      return { returnId: 77, orders: [], destination: "warehouse", status: "opened" }
    })
    mocks.reviews.mockImplementationOnce(async (_id, _returnId, budget) => limited(budget, "/post-purchase/v1/returns/77/reviews"))
    const budget = new ml.CallBudget(60, "recuperador_cron")
    await db.run(budget)
    expect(mocks.readReturn.mock.calls.map((args) => args[1])).toEqual([1, 2])
    expect(budget.remaining).toBe(57)
    expect(rounds().at(-1)).toMatchObject({ lidas: 1, pulados_429: 1, adiados: 0 })
    expect(db.requests.filter((r) => r.method === "POST" && r.url.pathname.endsWith("/recovery_returns"))
      .map((r) => (r.body as Record<string, unknown>).claim_id)).toEqual([2])
  })

  it("preenche as 15 vagas com os próximos itens e preserva a ordem ao filtrar adiados", async () => {
    const db = database(17)
    mocks.readReturn.mockImplementationOnce(async (_id, _claimId, budget) => limited(budget))
    await db.run()
    expect(mocks.readReturn).toHaveBeenCalledTimes(15)
    mocks.readReturn.mockClear()
    await db.run()
    expect(mocks.readReturn.mock.calls.map((args) => args[1])).toEqual(Array.from({ length: 15 }, (_, i) => i + 2))
    expect(rounds().at(-1)).toMatchObject({ fila: 17, lidas: 15, adiados: 1, pulados_429: 0 })
  })

  it("fila inteira adiada não busca detalhes nem altera o intervalo de fila inacabada", async () => {
    const db = database(1)
    mocks.readReturn.mockImplementationOnce(async (_id, _claimId, budget) => limited(budget))
    await db.run()
    mocks.readReturn.mockClear()
    db.requests.length = 0
    await db.run()
    expect(mocks.readReturn).not.toHaveBeenCalled()
    expect(db.requests.some((r) => r.url.pathname.endsWith("/reputation_claims") && r.url.searchParams.has("id"))).toBe(false)
    expect(rounds().at(-1)).toMatchObject({ fila: 1, lidas: 0, adiados: 1, pulados_429: 0, motivo: "inacabado", proxima_minutos: 1 })
  })

  it("no quarto 429 mantém a parada compartilhada, rate_limit e 2 minutos", async () => {
    const db = database(5)
    mocks.readReturn.mockImplementation(async (_accountId, _claimId, budget) => limited(budget))
    const budget = new ml.CallBudget(60, "recuperador_cron")
    await db.run(budget)
    expect(mocks.readReturn.mock.calls.map((args) => args[1])).toEqual([1, 2, 3, 4])
    expect(budget.rateLimited).toBe(true)
    expect(budget.remaining).toBe(56)
    expect(budget.exhausted).toBe(true)
    expect(db.round.rateLimitStopped).toBe(true)
    expect(rounds()).toEqual([expect.objectContaining({ fila: 5, lidas: 0, pulados_429: 3, adiados: 0, motivo: "rate_limit", proxima_minutos: 2 })])
    expect(nextMinutes(db)).toBe(2)
    expect(db.requests.filter((r) => r.method === "POST" && r.url.pathname.endsWith("/recovery_returns"))).toEqual([])
    mocks.readReturn.mockClear()
    await db.run()
    // Os três pulados estão adiados; o quarto volta pelo comportamento normal da E3.
    expect(mocks.readReturn.mock.calls.map((args) => args[1])).toEqual([4, 5])
    expect(rounds().at(-1)).toMatchObject({ lidas: 0, adiados: 3, pulados_429: 2, motivo: "inacabado" })
  })

  it.each([false, true])("runRecoverySync encerra as contas seguintes depois do quarto 429 (429 em voo = %s)", async (other429) => {
    const ids = [account.id, "account-5678", "account-9012"]
    const db = database(5, ids)
    vi.spyOn(db.client, "rpc").mockResolvedValue({ data: ids.map((ml_account_id) => ({ ml_account_id })), error: null } as never)
    mocks.accounts.mockResolvedValue(new Map(ids.map((id) => [id, { ...account, id }])))
    // A segunda conta espera o 4º 429 da primeira; a terceira ainda não começou.
    let releaseSecond!: () => void
    const secondWaiting = new Promise<void>((resolve) => { releaseSecond = resolve })
    mocks.readReturn.mockImplementation(async (id, claimId, budget) => {
      if (id === ids[1]) {
        budget.take()
        await secondWaiting
        if (other429) throw new api.MlApiError("limite em voo", 429, undefined, "/post-purchase/v2/claims/101/returns")
        return null
      }
      if (claimId === 4) releaseSecond()
      return limited(budget)
    })
    const result = await engine.runRecoverySync()
    expect(result).toEqual({ accounts: 2, failures: 0, rateLimited: true })
    expect(mocks.readReturn.mock.calls.filter(([id]) => id === ids[0]).map((args) => args[1])).toEqual([1, 2, 3, 4])
    expect(mocks.readReturn.mock.calls.filter(([id]) => id === ids[1])).toHaveLength(1)
    expect(mocks.readReturn.mock.calls.some(([id]) => id === ids[2])).toBe(false)
    expect(nextMinutes(db)).toBe(2)
    if (other429) {
      expect(rounds().find((entry) => entry.conta === ids[1])).toMatchObject({ pulados_429: 0, motivo: "rate_limit", proxima_minutos: 2 })
    }
    expect(db.requests.filter((r) => r.method === "PATCH" && r.url.searchParams.get("ml_account_id") === "eq." + ids[2]).at(-1)?.body).toEqual({ locked_until: null })
  })

  it("cada conta tem seus três pulos e o orçamento continua compartilhado", async () => {
    const db = database(4, [account.id, "account-5678"])
    const budget = new ml.CallBudget(60, "recuperador_cron")
    mocks.readReturn.mockImplementation(async (_id, claimId, currentBudget) => {
      if (claimId % 100 <= 3) return limited(currentBudget)
      currentBudget.take()
      return null
    })
    await db.run(budget)
    await engine.syncRecoveryAccount({ ...account, id: "account-5678" }, budget, Date.now() + 40_000, db.round)
    expect(rounds().map((entry) => entry.pulados_429)).toEqual([3, 3])
    expect(budget.remaining).toBe(52)
    expect(budget.rateLimited).toBe(false)
  })

  it("não devolve a chamada consumida quando o primeiro 429 esgota o orçamento", async () => {
    const db = database()
    mocks.readReturn.mockImplementationOnce(async (_id, _claimId, budget) => limited(budget))
    const budget = new ml.CallBudget(1, "recuperador_cron")
    await db.run(budget)
    expect(budget.remaining).toBe(0)
    expect(budget.exhausted).toBe(true)
    expect(mocks.readReturn).toHaveBeenCalledTimes(1)
    expect(rounds().at(-1)).toMatchObject({ lidas: 0, pulados_429: 1, motivo: "orcamento", proxima_minutos: 1 })
  })

  it("429 em /orders mantém o comportamento da E3", async () => {
    const db = database()
    mocks.readReturn.mockImplementationOnce(async (_id, _claimId, budget) => limited(budget, "/orders/123"))
    const budget = new ml.CallBudget(60, "recuperador_cron")
    await db.run(budget)
    expect(mocks.readReturn).toHaveBeenCalledTimes(1)
    expect(budget.rateLimited).toBe(true)
    expect(rounds().at(-1)).toMatchObject({ lidas: 0, pulados_429: 0, motivo: "rate_limit", proxima_minutos: 2 })
  })

  it.each([404, 500])("HTTP %s mantém o tratamento anterior e não adia o item", async (status) => {
    const db = database()
    mocks.readReturn.mockImplementationOnce(async (_id, _claimId, budget) => {
      budget.take()
      throw new api.MlApiError("erro do ML", status, undefined, "/post-purchase/v2/claims/1/returns")
    })
    await db.run()
    expect(mocks.readReturn.mock.calls.map((args) => args[1])).toEqual([1, 2])
    expect(rounds().at(-1)).toMatchObject({ lidas: 2, adiados: 0, pulados_429: 0, motivo: "normal", proxima_minutos: 5 })
    mocks.readReturn.mockClear()
    await db.run()
    expect(mocks.readReturn.mock.calls.map((args) => args[1])).toEqual([1, 2])
  })

  it("ações manuais ignoram adiamentos e continuam parando no primeiro 429", async () => {
    const db = database()
    mocks.readReturn.mockImplementationOnce(async (_id, _claimId, budget) => limited(budget))
    await db.run()
    mocks.readReturn.mockClear()
    mocks.readReturn.mockImplementationOnce(async (_id, _claimId, budget) => limited(budget))
    vi.spyOn(db.client, "rpc").mockResolvedValue({ data: [{ ml_account_id: account.id }], error: null } as never)
    mocks.accounts.mockResolvedValue(new Map([[account.id, account]]))
    await expect(engine.syncRecoveryNow(account.id)).resolves.toBe("done")
    expect(mocks.readReturn.mock.calls.map((args) => args[1])).toEqual([1])
    expect(rounds().at(-1)).toMatchObject({ pulados_429: 0, adiados: 0, motivo: "rate_limit", proxima_minutos: 2 })
  })

  it("trava os limites e intervalos da E3", () => {
    expect(engine.RECOVERY_CRON_LIMITS).toEqual({ accounts: 10, calls: 60, concurrency: 2, budgetMs: 40_000 })
    expect(engine.INTERVALS).toEqual({ normal: 300_000, needsReview: 120_000, unfinished: 60_000, waiting: 120_000, error: 300_000, rateLimited: 120_000, accountUnavailable: 1_800_000 })
    expect(engine.RECOVERY_429_SKIPS_PER_ACCOUNT).toBe(3)
  })
})

describe("adiamentos em memória", () => {
  it.each([0, 0.5, 1])("dura 10 a 15 min com random injetável = %s", (random) => {
    const cache = new Recovery429Deferrals(() => random)
    cache.defer(1, 0)
    const expiry = 600_000 * (1 + 0.5 * random)
    expect(cache.isDeferred(1, expiry - 1)).toBe(true)
    expect(cache.isDeferred(1, expiry)).toBe(false)
    expect(cache.size).toBe(0)
  })

  it("limpa vencidos, renova entradas e respeita o teto de 5.000", () => {
    const cache = new Recovery429Deferrals(() => 0)
    expect(RECOVERY_429_DEFERRAL_CAP).toBe(5_000)
    for (let id = 0; id < 5_000; id++) cache.defer(id, 0)
    cache.defer(0, 1)
    cache.defer(5_000, 1)
    expect(cache.size).toBe(5_000)
    expect(cache.isDeferred(0, 1)).toBe(true)
    expect(cache.isDeferred(1, 1)).toBe(false)
    cache.prune(600_000)
    expect(cache.size).toBe(2)
    cache.defer(6_000, 600_001)
    expect(cache.size).toBe(1)
  })
})

it("preserva a ordem completa da returnsQueue da E3", () => {
  const claims = [9, 8, 7, 6, 5, 4, 3, 2, 1].map((claim_id) => ({
    claim_id, status: claim_id === 2 || claim_id === 5 ? "closed" : "opened", hasReviewAction: claim_id === 7 || claim_id === 8,
    ml_created_at: `2026-11-26T10:0${claim_id}:00Z`, ml_updated_at: "2026-11-25T00:00:00Z",
  }))
  const row = (overrides: Partial<KnownReturn> = {}): KnownReturn => ({
    claim_updated_at: "2026-11-25T00:00:00Z", synced_at: "2026-11-26T12:00:00Z", phase: "closed", return_status: "closed", ...overrides,
  })
  const known = new Map([
    [3, row({ claim_updated_at: null })],
    [4, row({ phase: "waiting", synced_at: "2026-11-26T10:00:00Z" })],
    [5, row({ synced_at: "2026-11-20T00:00:00Z" })],
    [6, row()],
    [7, row({ synced_at: "2026-11-20T00:00:00Z" })],
    [8, row({ phase: "waiting", synced_at: "2026-11-26T10:00:00Z" })],
    [9, row({ claim_updated_at: null })],
  ])
  const original = structuredClone(claims)
  expect(returnsQueue(claims, known, new Date("2026-11-26T12:01:00Z"), "2026-11-21T00:00:00Z").map((claim) => claim.claim_id)).toEqual([8, 7, 1, 2, 9, 3, 4, 5])
  expect(claims).toEqual(original)
})
