import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ getValidAccessToken: vi.fn(async (accountId: string) => "token-" + accountId) }))
vi.mock("@/lib/mercadolivre/accounts", () => ({ getValidAccessToken: mocks.getValidAccessToken }))

const { BudgetExhaustedError, CallBudget, fetchClaim } = await import("@/lib/mercadolivre/reputation")

function respond(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

describe("CallBudget (limite de chamadas e token da rodada)", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    mocks.getValidAccessToken.mockClear()
  })

  it("lê o token no banco uma vez por conta na rodada, mesmo com chamadas ao mesmo tempo", async () => {
    const fetchMock = vi.fn(async () => respond(200, { id: 1 }))
    vi.stubGlobal("fetch", fetchMock)
    const budget = new CallBudget(10)

    await Promise.all([fetchClaim("conta-1", 1, budget), fetchClaim("conta-1", 2, budget), fetchClaim("conta-2", 3, budget)])
    await fetchClaim("conta-1", 4, budget)

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(mocks.getValidAccessToken).toHaveBeenCalledTimes(2)
    expect(budget.remaining).toBe(6)
  })

  it("401 do ML: a próxima chamada lê o token de novo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(401, { message: "invalid_token" })))
    const budget = new CallBudget(10)

    await expect(fetchClaim("conta-1", 1, budget)).rejects.toThrow("invalid_token")
    await expect(fetchClaim("conta-1", 2, budget)).rejects.toThrow("invalid_token")

    expect(mocks.getValidAccessToken).toHaveBeenCalledTimes(2)
  })

  it("não reaproveita o token por mais de 4 minutos", async () => {
    vi.useFakeTimers()
    vi.stubGlobal("fetch", vi.fn(async () => respond(200, {})))
    const budget = new CallBudget(10)

    await fetchClaim("conta-1", 1, budget)
    vi.advanceTimersByTime(4 * 60 * 1000 + 1)
    await fetchClaim("conta-1", 2, budget)

    expect(mocks.getValidAccessToken).toHaveBeenCalledTimes(2)
  })

  it("falha ao ler o token não fica guardada", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(200, {})))
    mocks.getValidAccessToken.mockRejectedValueOnce(new Error("banco fora"))
    const budget = new CallBudget(10)

    await expect(fetchClaim("conta-1", 1, budget)).rejects.toThrow("banco fora")
    await fetchClaim("conta-1", 2, budget)

    expect(mocks.getValidAccessToken).toHaveBeenCalledTimes(2)
  })

  it("acabou o limite: não chama o ML nem lê o token", async () => {
    const fetchMock = vi.fn(async () => respond(200, {}))
    vi.stubGlobal("fetch", fetchMock)
    const budget = new CallBudget(0)

    await expect(fetchClaim("conta-1", 1, budget)).rejects.toBeInstanceOf(BudgetExhaustedError)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.getValidAccessToken).not.toHaveBeenCalled()
  })
})
