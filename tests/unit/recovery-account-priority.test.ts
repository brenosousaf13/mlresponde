import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Database } from "@/lib/supabase/database.types"

const mocks = vi.hoisted(() => ({ service: vi.fn(), loadAccounts: vi.fn() }))
vi.mock("@/lib/supabase/admin", () => ({ createServiceClient: mocks.service }))
vi.mock("@/lib/reputation/engine", async (original) => ({
  ...await original<typeof import("@/lib/reputation/engine")>(), loadAccounts: mocks.loadAccounts,
}))

const { RECOVERY_CRON_LIMITS, runRecoverySync } = await import("@/lib/recovery/engine")
// Evita a janela de 15 minutos do monitor: estes testes isolam somente o rodízio.
const NOW = new Date("2026-11-26T12:01:00.000Z")
const at = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000).toISOString()
type UrgentRow = { ml_account_id: string; phase: string; deadline_at: string | null }

function database(failure?: "resposta" | "excecao", empty = false) {
  // Ordem recebida diferente da idade da reserva, para provar o fallback sem ordenação.
  const reserved = empty ? [] : [
    { ml_account_id: "conta-nova", next_returns_at: at(-1) },
    { ml_account_id: "conta-antiga", next_returns_at: at(-4) },
    { ml_account_id: "conta-urgente", next_returns_at: at(-0.1) },
    { ml_account_id: "conta-urgente-antiga", next_returns_at: at(-2) },
  ]
  const returns: UrgentRow[] = [
    { ml_account_id: "conta-urgente", phase: "needs_review", deadline_at: at(24) },
    { ml_account_id: "conta-urgente-antiga", phase: "needs_review", deadline_at: at(0) },
    { ml_account_id: "conta-nova", phase: "needs_review", deadline_at: at(-1) },
    { ml_account_id: "conta-antiga", phase: "needs_review", deadline_at: at(25) },
    { ml_account_id: "conta-antiga", phase: "closed", deadline_at: at(1) },
    { ml_account_id: "conta-nova", phase: "needs_review", deadline_at: null },
    { ml_account_id: "fora-da-reserva", phase: "needs_review", deadline_at: at(1) },
  ]
  const requests: URL[] = []
  const started: string[] = []
  let active = 0
  let maxActive = 0
  const client = createClient<Database>("https://banco.example", "chave-ficticia", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input))
      requests.push(url)
      const table = url.pathname.split("/").at(-1)
      let data: unknown = null
      if (table === "claim_recovery_sync") data = reserved
      else if (table === "recovery_returns") {
        if (failure === "resposta") return new Response(JSON.stringify({ message: "Falha simulada de consulta" }), { status: 400 })
        const ids = url.searchParams.get("ml_account_id")!.slice(4, -1).split(",")
        const dates = url.searchParams.getAll("deadline_at")
        const from = dates.find((value) => value.startsWith("gte."))!.slice(4)
        const to = dates.find((value) => value.startsWith("lte."))!.slice(4)
        data = returns.filter((row) => ids.includes(row.ml_account_id) && `eq.${row.phase}` === url.searchParams.get("phase")
          && row.deadline_at !== null && row.deadline_at >= from && row.deadline_at <= to)
          .map((row) => ({ ml_account_id: row.ml_account_id }))
      } else if (table === "reputation_sync") {
        await Promise.resolve()
      } else if (table === "recovery_sync" && init?.method === "PATCH") active--
      else if (table !== "recovery_scans") throw new Error(`Consulta inesperada: ${url.pathname}`)
      if (init?.method === "PATCH") return new Response(null, { status: 204 })
      return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } })
    } },
  })
  const from = client.from.bind(client)
  vi.spyOn(client, "from").mockImplementation((table) => {
    if (table === "recovery_returns" && failure === "excecao") throw new Error("Falha simulada de consulta")
    return from(table)
  })
  mocks.service.mockReturnValue(client)
  const accounts = new Map(reserved.map((row) => [row.ml_account_id, {
    id: row.ml_account_id, organization_id: "org", ml_user_id: 123, nickname: "Loja fictícia",
  }]))
  const get = accounts.get.bind(accounts)
  vi.spyOn(accounts, "get").mockImplementation((id) => {
    // Mede o despacho para syncRecoveryAccount, antes do transporte assíncrono do Supabase.
    started.push(id)
    active++
    maxActive = Math.max(maxActive, active)
    return get(id)
  })
  mocks.loadAccounts.mockResolvedValue(accounts)
  return { requests, started, reserved, maxActive: () => maxActive }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Rede real proibida neste teste.") }))
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe("rodízio das contas do Recuperador", () => {
  it("inicia urgentes primeiro e desempata por next_returns_at, numa única consulta em lote", async () => {
    const db = database()
    expect(await runRecoverySync()).toEqual({ accounts: 4, failures: 0, rateLimited: false })
    expect(db.started).toEqual(["conta-urgente-antiga", "conta-urgente", "conta-antiga", "conta-nova"])
    expect(db.maxActive()).toBe(2)
    expect(db.reserved.map((row) => row.ml_account_id)).toEqual(["conta-nova", "conta-antiga", "conta-urgente", "conta-urgente-antiga"])
    const queries = db.requests.filter((url) => url.pathname.endsWith("/recovery_returns"))
    expect(queries).toHaveLength(1)
    expect(queries[0].searchParams.get("select")).toBe("ml_account_id")
    expect(queries[0].searchParams.get("ml_account_id")).toBe("in.(conta-nova,conta-antiga,conta-urgente,conta-urgente-antiga)")
    expect(queries[0].searchParams.get("phase")).toBe("eq.needs_review")
    expect(queries[0].searchParams.getAll("deadline_at")).toEqual([`gte.${at(0)}`, `lte.${at(24)}`])
  })

  it.each(["resposta", "excecao"] as const)("falha de %s mantém a ordem reservada e não derruba a rodada", async (failure) => {
    const db = database(failure)
    expect(await runRecoverySync()).toEqual({ accounts: 4, failures: 0, rateLimited: false })
    expect(db.started).toEqual(db.reserved.map((row) => row.ml_account_id))
    expect(console.error).toHaveBeenCalledWith("[recuperador] prioridade das contas:", expect.stringContaining("Falha simulada"))
    expect(db.requests.filter((url) => url.pathname.endsWith("/recovery_returns"))).toHaveLength(failure === "excecao" ? 0 : 1)
  })

  it("sem contas reservadas não consulta urgentes", async () => {
    const db = database(undefined, true)
    expect(await runRecoverySync()).toEqual({ accounts: 0, failures: 0, rateLimited: false })
    expect(db.requests.filter((url) => url.pathname.endsWith("/recovery_returns"))).toHaveLength(0)
  })

  it("preserva os limites e intervalos da E3, inclusive rateLimited de 2 minutos e 15 devoluções por conta", () => {
    expect(RECOVERY_CRON_LIMITS).toEqual({ accounts: 10, calls: 60, concurrency: 2, budgetMs: 40_000 })
    // INTERVALS e RETURNS_PER_RUN continuam privados; protege seus valores sem ampliar a API do motor.
    const source = readFileSync(new URL("../../lib/recovery/engine.ts", import.meta.url), "utf8")
    expect(source.match(/const INTERVALS = \{[\s\S]*?\} as const/)?.[0]).toBe(`const INTERVALS = {
  normal: 5 * MINUTE,
  needsReview: 2 * MINUTE,
  unfinished: MINUTE,
  waiting: 2 * MINUTE,
  error: 5 * MINUTE,
  rateLimited: 2 * MINUTE,
  accountUnavailable: 30 * MINUTE,
} as const`.replace(/\n/g, source.includes("\r\n") ? "\r\n" : "\n"))
    expect(source).toContain("const RETURNS_PER_RUN = 15")
  })
})
