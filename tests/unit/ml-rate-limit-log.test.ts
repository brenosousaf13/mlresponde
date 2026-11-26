import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { formatMlRateLimitLog, logMlRateLimit, normalizeMlEndpoint, pickRateLimitHeaders } from "@/lib/mercadolivre/rate-limit-log"

const mocks = vi.hoisted(() => ({
  getValidAccessToken: vi.fn(async () => "APP_USR-token-secreto-123456"),
  forgetAccessToken: vi.fn(),
  markTokenInvalid: vi.fn(async () => {}),
}))

vi.mock("@/lib/mercadolivre/accounts", () => ({
  ...mocks,
  MlAccountUnavailableError: class extends Error {},
}))

const { MlApiError } = await import("@/lib/mercadolivre/api")
const { BudgetExhaustedError, CallBudget, fetchClaim, sendClaimMessage } = await import("@/lib/mercadolivre/reputation")
const { mlFetchRaw, mlRequest } = await import("@/lib/mercadolivre/client")

const ACCOUNT_ID = "7ba0ce89-cdef-4567-8abc-11223344ab12"

function entry() {
  return {
    origem: "recuperador_cron",
    conta: ACCOUNT_ID,
    metodo: "GET",
    path: "/post-purchase/v1/claims/123?access_token=APP_USR-token-secreto-123456&email=cliente%40exemplo.com",
    status: 429,
    headers: new Headers({
      "Retry-After": "120",
      "X-RateLimit-Remaining": "0",
      authorization: "Bearer APP_USR-token-secreto-123456",
      "set-cookie": "sessao=segredo",
      "x-request-id": "identificador-123",
    }),
    codigo: "local_rate_limited",
  }
}

describe("log estruturado do limite do Mercado Livre", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Chamada não simulada") }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it.each([
    ["/post-purchase/v1/claims/123", "/post-purchase/v1/claims/:id"],
    ["/post-purchase/v2/claims/123/returns", "/post-purchase/v2/claims/:id/returns"],
    ["/shipments/456", "/shipments/:id"],
    ["/orders/789", "/orders/:id"],
    ["/users/111", "/users/:id"],
    ["/questions/search?item=MLB123&status=UNANSWERED", "/questions/search?item&status"],
    ["/messages/packs/2000001234/sellers/111?tag=post_sale", "/messages/packs/:id/sellers/:id?tag"],
    ["/items/MLB123/description", "/items/:id/description"],
    ["/messages/2000001234-abc", "/messages/:id"],
    [
      "/post-purchase/v1/claims/search?player_role=respondent&player_user_id=123&offset=50",
      "/post-purchase/v1/claims/search?offset&player_role&player_user_id",
    ],
    ["/orders/search?sort=date_desc&order.date_created.from=2026-11-26&offset=0", "/orders/search?offset&order.date_created.from&sort"],
    ["/users/cliente@exemplo.com", "/users/:id"],
    ["/users/cliente%40exemplo.com", "/users/:id"],
    ["/users/%31%32%33", "/users/:id"],
    ["/users/111?tag=segredo&tag=outro#APP_USR-token", "/users/:id?tag"],
    ["/questions/search?item=MLB123?segredo&status=UNANSWERED", "/questions/search?item&status"],
    ["/users/111?cliente%40exemplo.com=segredo&MLB123=segredo", "/users/:id?:id"],
  ])("normaliza %s sem expor identificadores ou valores", (path, expected) => {
    expect(normalizeMlEndpoint(path)).toBe(expected)
  })

  it("inclui somente os cabeçalhos de limite, em minúsculas e com até 100 caracteres", () => {
    const headers = entry().headers
    headers.set("X-Rate-Limit-Limit", "300")
    headers.set("RateLimit", "300")
    headers.set("RateLimit-Reset", "a".repeat(150))

    expect(pickRateLimitHeaders(headers)).toEqual({
      "retry-after": "120",
      "x-ratelimit-remaining": "0",
      "x-rate-limit-limit": "300",
      ratelimit: "300",
      "ratelimit-reset": "a".repeat(100),
    })
    headers.set("Retry-After", "1".repeat(150))
    expect(pickRateLimitHeaders(headers)["retry-after"]).toHaveLength(100)
  })

  it("gera uma única linha com as chaves permitidas e sem ids completos, tokens ou mensagens", () => {
    const line = formatMlRateLimitLog({
      ...entry(), chamadasRodada: 4, limiteRodada: 60,
      ...{ token: "segredo-extra", message: "Mensagem livre", body: { email: "cliente@exemplo.com" } },
    })
    expect(line).toBe('[ml-429] {"origem":"recuperador_cron","conta":"ab12","metodo":"GET","endpoint":"/post-purchase/v1/claims/:id?access_token&email","status":429,"retry_after":"120","cabecalhos":{"x-ratelimit-remaining":"0"},"codigo":"local_rate_limited","chamadas_rodada":4,"limite_rodada":60}')
    for (const secret of [ACCOUNT_ID, "123", "APP_USR", "cliente", "exemplo.com", "segredo", "Mensagem livre", "Bearer"]) {
      expect(line).not.toContain(secret)
    }
    expect(line).not.toMatch(/[\r\n]/)
  })

  it("omite as contagens ausentes e inclui zero quando informado", () => {
    const payload = JSON.parse(formatMlRateLimitLog({ ...entry(), headers: new Headers(), codigo: null }).slice(9))
    expect(payload).toMatchObject({ retry_after: null, cabecalhos: {}, codigo: null })
    expect(payload).not.toHaveProperty("chamadas_rodada")
    expect(payload).not.toHaveProperty("limite_rodada")
    expect(JSON.parse(formatMlRateLimitLog({ ...entry(), chamadasRodada: 0, limiteRodada: 0 }).slice(9)))
      .toMatchObject({ chamadas_rodada: 0, limite_rodada: 0 })
  })

  it.each([undefined, null, 429, {}, "!!!"])("usa codigo nulo para %j", (codigo) => {
    expect(JSON.parse(formatMlRateLimitLog({ ...entry(), codigo }).slice(9)).codigo).toBeNull()
  })

  it("restringe o código aos caracteres permitidos e a 60 caracteres", () => {
    const payload = JSON.parse(formatMlRateLimitLog({ ...entry(), codigo: "local_ -429\n<>!" + "a".repeat(100) }).slice(9))
    expect(payload.codigo).toBe("local_ -429" + "a".repeat(49))
    expect(payload.codigo).toMatch(/^[a-z0-9_ -]{60}$/)
  })

  it("nunca lança erro, mesmo se falhar a formatação ou o console", () => {
    const input = entry()
    vi.spyOn(input.headers, "forEach").mockImplementation(() => { throw new Error("Cabeçalhos indisponíveis") })
    expect(() => logMlRateLimit(input)).not.toThrow()
    expect(console.warn).not.toHaveBeenCalled()
    vi.mocked(console.warn).mockImplementation(() => { throw new Error("Console indisponível") })
    expect(() => logMlRateLimit(entry())).not.toThrow()
  })

  it("reputationRequest: lê o corpo uma vez, loga uma vez e mantém o orçamento e MlApiError 429", async () => {
    const response = new Response(JSON.stringify({ error: "local_rate_limited", message: "Mensagem livre do ML" }), {
      status: 429, headers: entry().headers,
    })
    const json = vi.spyOn(response, "json")
    const fetchMock = vi.fn(async () => response)
    vi.stubGlobal("fetch", fetchMock)
    const budget = new CallBudget(60, "recuperador_cron")
    budget.take()

    await expect(fetchClaim(ACCOUNT_ID, 123, budget)).rejects.toMatchObject({
      name: "MlApiError", status: 429, code: "local_rate_limited", message: "Mercado Livre: Mensagem livre do ML",
    })
    expect(json).toHaveBeenCalledTimes(1)
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(formatMlRateLimitLog({
      ...entry(), path: "/post-purchase/v1/claims/123", chamadasRodada: 2, limiteRodada: 60,
    }))
    expect(budget.limit).toBe(60)
    expect(budget.remaining).toBe(58)
    expect(budget.rateLimited).toBe(true)
    expect(budget.exhausted).toBe(true)
    await expect(fetchClaim(ACCOUNT_ID, 456, budget)).rejects.toBeInstanceOf(BudgetExhaustedError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(mocks.forgetAccessToken).not.toHaveBeenCalled()
    expect(mocks.markTokenInvalid).not.toHaveBeenCalled()
  })

  it("reputationRequest: registra POST, origem padrão e código nulo se o corpo não for JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("não é JSON", { status: 429 })))
    const budget = new CallBudget(5)
    await expect(sendClaimMessage(ACCOUNT_ID, 123, { receiverRole: "mediator", message: "Olá", attachments: [] }, budget))
      .rejects.toBeInstanceOf(MlApiError)
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(formatMlRateLimitLog({
      ...entry(), origem: "desconhecida", metodo: "POST", path: "/post-purchase/v1/claims/123/actions/send-message",
      headers: new Headers(), codigo: null, chamadasRodada: 1, limiteRodada: 5,
    }))
    expect(budget.rateLimited).toBe(true)
  })

  it("mlRequest: registra origem geral sem contagem e mantém o erro original", async () => {
    const response = new Response(JSON.stringify({ error: "local_rate_limited" }), { status: 429, headers: entry().headers })
    const json = vi.spyOn(response, "json")
    vi.stubGlobal("fetch", vi.fn(async () => response))
    await expect(mlRequest(ACCOUNT_ID, "/questions/123", { method: "POST" })).rejects.toMatchObject({
      status: 429, code: "local_rate_limited",
    })
    expect(json).toHaveBeenCalledTimes(1)
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(formatMlRateLimitLog({
      ...entry(), origem: "geral", metodo: "POST", path: "/questions/123",
    }))
    expect(mocks.markTokenInvalid).not.toHaveBeenCalled()
  })

  it("mlFetchRaw: devolve a mesma resposta sem ler o corpo, sem código e com um único log", async () => {
    const response = new Response("corpo intocado", { status: 429, headers: entry().headers })
    const json = vi.spyOn(response, "json")
    vi.stubGlobal("fetch", vi.fn(async () => response))

    expect(await mlFetchRaw(ACCOUNT_ID, "/messages/123")).toBe(response)
    expect(response.bodyUsed).toBe(false)
    expect(json).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(formatMlRateLimitLog({
      ...entry(), origem: "geral", path: "/messages/123", codigo: null,
    }))
  })

  it("401 seguido de 429 continua renovando uma vez e registra somente o 429", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(new Response("{}", { status: 429 }))
    vi.stubGlobal("fetch", fetchMock)
    await expect(mlRequest(ACCOUNT_ID, "/users/123")).rejects.toMatchObject({ status: 429 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(mocks.getValidAccessToken.mock.calls).toEqual([[ACCOUNT_ID, { fresh: false }], [ACCOUNT_ID, { fresh: true }]])
    expect(mocks.forgetAccessToken).toHaveBeenCalledExactlyOnceWith(ACCOUNT_ID)
    expect(mocks.markTokenInvalid).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledTimes(1)
  })

  it("falha no console não altera MlApiError nem o bloqueio do orçamento", async () => {
    vi.mocked(console.warn).mockImplementation(() => { throw new Error("Console indisponível") })
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })))
    const budget = new CallBudget(2)
    await expect(fetchClaim(ACCOUNT_ID, 123, budget)).rejects.toMatchObject({ name: "MlApiError", status: 429 })
    expect(budget.rateLimited).toBe(true)
    expect(budget.remaining).toBe(1)
  })

  it.each([200, 404])("não registra ml-429 para HTTP %s nos três fluxos", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status })))
    const budget = new CallBudget(2)
    if (status === 200) {
      await fetchClaim(ACCOUNT_ID, 123, budget)
      await mlRequest(ACCOUNT_ID, "/users/123")
    } else {
      await expect(fetchClaim(ACCOUNT_ID, 123, budget)).rejects.toMatchObject({ status })
      await expect(mlRequest(ACCOUNT_ID, "/users/123")).rejects.toMatchObject({ status })
    }
    expect((await mlFetchRaw(ACCOUNT_ID, "/messages/123")).status).toBe(status)
    expect(console.warn).not.toHaveBeenCalled()
    expect(budget.rateLimited).toBe(false)
  })
})
