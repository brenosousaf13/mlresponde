import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Token do ML guardado na instância (Sessão 30b): menos leituras de ml_account_tokens, sem usar token perto de vencer, e
// um 401 com o token guardado tenta de novo com o do banco antes de marcar a conta como inválida.

const mocks = vi.hoisted(() => {
  const state = { reads: 0, accountUpdates: [] as unknown[], expiresAt: "", token: "token-1" }
  function builder(table: string) {
    let op = "select"
    const query: Record<string, unknown> = {
      select: () => query,
      update: (payload: unknown) => {
        op = "update"
        if (table === "ml_accounts") state.accountUpdates.push(payload)
        return query
      },
      upsert: () => Promise.resolve({ data: null, error: null }),
      eq: () => query,
      or: () => query,
      maybeSingle: () => {
        if (table === "ml_account_tokens" && op === "select") state.reads++
        return Promise.resolve({
          data: { access_token_enc: state.token, refresh_token_enc: "refresh", expires_at: state.expiresAt },
          error: null,
        })
      },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve),
    }
    return query
  }
  return { state, supabase: { from: (table: string) => builder(table) } }
})

vi.mock("@/lib/supabase/admin", () => ({ createServiceClient: () => mocks.supabase }))
vi.mock("@/lib/security/keys", () => ({ getTokenEncryptionKey: () => "chave" }))
vi.mock("@/lib/mercadolivre/oauth", () => ({
  MlOAuthError: class extends Error {},
  refreshAccessToken: vi.fn(async () => ({ access_token: "token-renovado", refresh_token: "r2", expires_in: 21600 })),
}))
vi.mock("@/lib/security/crypto", () => ({ decryptSecret: (value: string) => value, encryptSecret: (value: string) => value }))

const { forgetAccessToken, getValidAccessToken } = await import("@/lib/mercadolivre/accounts")
const { mlRequest } = await import("@/lib/mercadolivre/client")

describe("token do ML guardado na instância", () => {
  beforeEach(() => {
    mocks.state.reads = 0
    mocks.state.accountUpdates = []
    mocks.state.token = "token-1"
    mocks.state.expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()
    forgetAccessToken("conta-1")
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("lê o banco uma vez e reaproveita por até 10 min", async () => {
    vi.useFakeTimers()
    expect(await getValidAccessToken("conta-1")).toBe("token-1")
    expect(await getValidAccessToken("conta-1")).toBe("token-1")
    expect(mocks.state.reads).toBe(1)
    vi.advanceTimersByTime(10 * 60 * 1000 + 1)
    await getValidAccessToken("conta-1")
    expect(mocks.state.reads).toBe(2)
  })

  it("não guarda além da margem de renovação (token vencendo em 12 min: só 7 min)", async () => {
    vi.useFakeTimers()
    mocks.state.expiresAt = new Date(Date.now() + 12 * 60 * 1000).toISOString()
    await getValidAccessToken("conta-1")
    vi.advanceTimersByTime(7 * 60 * 1000 - 1000)
    expect(await getValidAccessToken("conta-1")).toBe("token-1")
    expect(mocks.state.reads).toBe(1)
    vi.advanceTimersByTime(2000)
    expect(await getValidAccessToken("conta-1")).toBe("token-renovado")
    expect(mocks.state.reads).toBe(2)
  })

  it("fresh ignora o token guardado", async () => {
    await getValidAccessToken("conta-1")
    await getValidAccessToken("conta-1", { fresh: true })
    expect(mocks.state.reads).toBe(2)
  })

  it("401 com token guardado: tenta de novo com o do banco e não marca a conta como inválida", async () => {
    await getValidAccessToken("conta-1")
    mocks.state.token = "token-2"
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const auth = new Headers(init.headers).get("authorization")
      return new Response(JSON.stringify({ ok: auth }), { status: auth === "Bearer token-2" ? 200 : 401 })
    })
    vi.stubGlobal("fetch", fetchMock)

    expect(await mlRequest("conta-1", "/users/me")).toEqual({ ok: "Bearer token-2" })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(mocks.state.accountUpdates).toEqual([])
  })

  it("401 também com o token do banco: marca a conta como inválida", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })))
    await expect(mlRequest("conta-1", "/users/me")).rejects.toThrow("Reconecte a conta")
    expect(mocks.state.accountUpdates).toHaveLength(1)
    expect(mocks.state.accountUpdates[0]).toMatchObject({ token_status: "invalid" })
  })
})
