import { createClient } from "@supabase/supabase-js"
import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { getRecoveryOverview, getRecoveryScreenData } from "@/lib/dal/recovery"

const boundary = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: boundary.createClient }))

// O entrypoint padrão do React no Vitest/Node tem cache() sem memoização.
// Usa o cache REAL do React Server instalado, com um dispatcher isolado por renderização.
vi.mock("react", async () => {
  const { createRequire } = await import("node:module")
  const { dirname, join } = await import("node:path")
  const require = createRequire(import.meta.url)
  return require(join(dirname(require.resolve("react")), "react.react-server.js"))
})

type CacheDispatcher = { getCacheForType<T>(factory: () => T): T }
const internals = (React as unknown as {
  __SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: { A: CacheDispatcher | null }
}).__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE

async function renderRequest<T>(render: () => Promise<T>): Promise<T> {
  const previous = internals.A
  const resources = new Map<() => unknown, unknown>()
  internals.A = {
    getCacheForType<T>(factory: () => T): T {
      if (!resources.has(factory)) resources.set(factory, factory())
      return resources.get(factory) as T
    },
  }
  try {
    return await render()
  } finally {
    internals.A = previous
  }
}

const NOW = new Date("2026-11-25T12:00:00.000Z")
const DEADLINE = "2026-11-27T12:00:00.000Z"

function database() {
  const base = {
    ml_account_id: "account", claim_created_at: NOW.toISOString(), currency_id: "BRL",
    reviews: [], orders: [], order_id: null, is_cart: false, recovered_at: null, recovered_amount: null,
    can_review_ok: false, can_review_fail: false,
  }
  const tables: Record<string, Record<string, unknown>[]> = {
    recovery_sync: [{ ml_account_id: "account", last_returns_at: NOW.toISOString(), last_error: null, last_error_at: null }],
    recovery_scans: [{ ml_account_id: "account", status: "done", returns_total: 2, returns_done: 2, completed_at: NOW.toISOString() }],
    reputation_sync: [{ ml_account_id: "account", claims_backfilled_at: NOW.toISOString() }],
    recovery_returns: [
      {
        ...base, id: "waiting", claim_id: 1, item_title: "Tênis", amount: 120, phase: "needs_review",
        status_money: "retained", can_review_ok: true, can_review_fail: true,
        destination: "seller_address", shipment_status: "delivered", return_status: "delivered", deadline_at: DEADLINE,
      },
      { ...base, id: "recovered", claim_id: 2, amount: 80, phase: "closed", status_money: "refunded", recovered_at: NOW.toISOString(), recovered_amount: 80 },
    ],
    reputation_claims: [{ id: "claim", ml_account_id: "account", claim_id: 1, next_due_at: DEADLINE, reason_detail: "Arrependimento", affects_reputation: "not_affected" }],
    recovery_actions: [{ id: "action", ml_account_id: "account", return_row_id: "recovered", action: "return_review_fail", status: "success", performed_at: NOW.toISOString() }],
  }
  const requests: URL[] = []
  // Nenhum acesso externo: o cliente Supabase real usa somente este transporte simulado.
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    requests.push(url)
    let rows = tables[url.pathname.split("/").at(-1)!] ?? []
    for (const [key, value] of url.searchParams) {
      if (value.startsWith("eq.")) rows = rows.filter((row) => String(row[key]) === value.slice(3))
      if (value.startsWith("in.(")) rows = rows.filter((row) => value.slice(4, -1).split(",").includes(String(row[key])))
      if (value === "not.is.null") rows = rows.filter((row) => row[key] != null)
    }
    if (init?.method === "HEAD") return new Response(null, { headers: { "content-range": `0-0/${rows.length}` } })
    const offset = Number(url.searchParams.get("offset") ?? 0)
    const limit = Number(url.searchParams.get("limit") ?? 1000)
    return new Response(JSON.stringify(rows.slice(offset, offset + limit)), { headers: { "content-type": "application/json" } })
  }
  boundary.createClient.mockResolvedValue(createClient("https://database.example", "test-key", {
    global: { fetch }, auth: { persistSession: false, autoRefreshToken: false },
  }))
  return { tables, requests }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => vi.useRealTimers())

describe("overview do Recuperador por requisição", () => {
  it("compartilha uma consulta de overview entre página e DTO, preservando os resultados", async () => {
    const { requests } = database()
    const opts = { accountParam: "account" }
    const expectedOverview = await getRecoveryOverview("account")
    const expectedScreen = await getRecoveryScreenData("account", opts)
    requests.length = 0

    // Mesmo encadeamento de Promise.all usado por RecoveryPage, sem substituir o DAL.
    const [overview, screen] = await renderRequest(() => Promise.all([
      getRecoveryOverview("account"),
      getRecoveryScreenData("account", opts),
    ]))

    expect(requests.filter((url) => url.pathname.endsWith("/recovery_sync"))).toHaveLength(1)
    expect(requests.filter((url) => url.pathname.endsWith("/recovery_scans"))).toHaveLength(1)
    expect(requests.filter((url) => url.pathname.endsWith("/recovery_findings"))).toHaveLength(1)
    expect(overview).toEqual(expectedOverview)
    expect(screen).toEqual(expectedScreen)
    expect(overview.waiting).toMatchObject({ count: 1, actionableAmount: 120, nextDeadline: DEADLINE })
    expect(screen.reviewNow).toMatchObject({ count: 1, amount: 120, nextDeadlineAt: DEADLINE })
    expect(screen.recovered).toEqual({ count: 1, amount: 80 })
    expect(screen.hasFirstSubmission).toBe(true)
    expect(screen.queue[0]).toMatchObject({ id: "waiting", mode: "arrival" })
  })

  it("relê os dados em outra requisição para a mesma conta", async () => {
    const { requests, tables } = database()
    const first = await renderRequest(() => getRecoveryOverview("account"))
    tables.recovery_returns = []
    const second = await renderRequest(() => getRecoveryOverview("account"))
    expect(requests.filter((url) => url.pathname.endsWith("/recovery_sync"))).toHaveLength(2)
    expect(first.waiting.count).toBe(1)
    expect(second.waiting.count).toBe(0)
    expect(second.recovered).toEqual({ count: 0, amount: 0 })
  })

  it("isola contas diferentes e reutiliza a promessa em chamadas concorrentes e posteriores", async () => {
    const { requests } = database()
    await renderRequest(async () => {
      const first = getRecoveryOverview("account")
      expect(getRecoveryOverview("account")).toBe(first)
      const [own, other] = await Promise.all([first, getRecoveryOverview("other-account")])
      expect(await getRecoveryOverview("account")).toBe(own)
      expect(own.waiting.count).toBe(1)
      expect(other.waiting.count).toBe(0)
    })
    const syncRequests = requests.filter((url) => url.pathname.endsWith("/recovery_sync"))
    expect(syncRequests.map((url) => url.searchParams.get("ml_account_id"))).toEqual(["eq.account", "eq.other-account"])
  })
})
