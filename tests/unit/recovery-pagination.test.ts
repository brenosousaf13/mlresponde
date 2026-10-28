import { createClient } from "@supabase/supabase-js"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Database } from "@/lib/supabase/database.types"
import { getAdminRecoveryFunnel } from "@/lib/dal/admin-recovery"
import { getFindings, getRecoveryOverview, getReturnsTab } from "@/lib/dal/recovery"

const boundary = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: boundary.createClient }))
vi.mock("@/lib/dal/admin", () => ({ requireAdmin: vi.fn() }))

const NOW = new Date("2026-10-28T12:00:00.000Z")
const SINCE = "2026-07-30T12:00:00.000Z"

// Cliente Supabase real; só o transporte HTTP é simulado, com o teto de 1.000 do PostgREST.
function database() {
  const returns = Array.from({ length: 2500 }, (_, index) => ({
    id: String(index).padStart(5, "0"), ml_account_id: "account", organization_id: "org", claim_id: index,
    claim_created_at: "2026-10-20T12:00:00.000Z", amount: 1, currency_id: "BRL", phase: "closed",
    recovered_at: null, recovered_amount: null, status_money: "retained", reviews: [],
    can_review_ok: false, can_review_fail: false,
  }))
  const findings = returns.map((row) => ({
    id: row.id, ml_account_id: "account", return_row_id: row.id, amount: 1,
    kind: "return_unsaleable_unreimbursed", status: "closed", evidence: { outcome: "expired" },
    detected_at: "2026-10-20T12:00:00.000Z",
  }))
  const actions = returns.map((row) => ({
    id: row.id, ml_account_id: "account", return_row_id: row.id, action: "return_review_ok",
    status: "success", performed_at: "2026-10-21T12:00:00.000Z",
  }))
  const tables: Record<string, Record<string, unknown>[]> = {
    recovery_returns: returns, recovery_findings: findings, recovery_actions: actions,
    ml_accounts: [{ id: "account", organization_id: "org", status: "active", token_status: "valid", organizations: { name: "Loja", billing_exempt: true } }],
    recovery_sync: [{ ml_account_id: "account", last_returns_at: NOW.toISOString(), last_error: null, last_error_at: null }],
  }
  const requests: URL[] = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    requests.push(url)
    const table = url.pathname.split("/").at(-1)!
    let rows = tables[table] ?? []
    for (const [key, value] of url.searchParams) {
      if (value.startsWith("eq.")) rows = rows.filter((row) => String(row[key]) === value.slice(3))
      if (value.startsWith("in.(")) rows = rows.filter((row) => value.slice(4, -1).split(",").includes(String(row[key])))
      if (value === "not.is.null") rows = rows.filter((row) => row[key] != null)
      if (value.startsWith("gte.")) {
        // O início da janela precisa continuar sendo uma data, nunca o offset da página.
        expect(value).toBe(`gte.${SINCE}`)
        rows = rows.filter((row) => String(row[key]) >= value.slice(4))
      }
    }
    if (init?.method === "HEAD") return new Response(null, { headers: { "content-range": `0-0/${rows.length}` } })
    const offset = Number(url.searchParams.get("offset") ?? 0)
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 1000), 1000)
    return new Response(JSON.stringify(rows.slice(offset, offset + limit)), { headers: { "content-type": "application/json" } })
  }
  boundary.createClient.mockResolvedValue(createClient<Database>("https://database.example", "test-key", {
    global: { fetch }, auth: { persistSession: false, autoRefreshToken: false },
  }))
  return { requests, returns, findings, tables }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => vi.useRealTimers())

describe("paginação nas consultas do Recuperador", () => {
  it("soma as três páginas e considera ações posteriores à linha 1.000 em Ficou para trás", async () => {
    const { tables, returns } = database()
    tables.recovery_returns = returns.map((row) => ({ ...row, recovered_at: NOW.toISOString(), recovered_amount: 2 }))
    const recovered = await getRecoveryOverview("account")
    expect(recovered.recovered).toEqual({ count: 2500, amount: 5000 })
    expect(recovered.money.retainedTotal).toBe(2500)

    tables.recovery_returns = returns
    const overview = await getRecoveryOverview("account")
    // Cada achado seria uma perda, mas todas as 2.500 devoluções já foram confirmadas OK.
    expect(overview.lost).toEqual({ count: 0, amount: 0 })
    tables.recovery_actions = []
    expect((await getRecoveryOverview("account")).lost).toEqual({ count: 2500, amount: 2500 })
  })

  it("traz todas as devoluções encerradas e achados com desempate estável na ordenação", async () => {
    const { requests } = database()
    expect(await getReturnsTab("account", "encerradas")).toHaveLength(2500)
    expect(await getFindings("account")).toHaveLength(2500)
    expect(requests.filter((url) => url.searchParams.has("offset"))).toHaveLength(6)
    for (const url of requests) expect(url.searchParams.get("order")).toMatch(/id\.asc$/)
  })

  it("mantém a janela de 90 dias e agrega todas as páginas no funil do administrador", async () => {
    const { requests } = database()
    const result = await getAdminRecoveryFunnel(NOW)
    expect(result.from).toBe(SINCE)
    expect(result.rows[0]).toMatchObject({ returns_read: 2500, sent_ok: 2500, decisions_pending: 2500 })
    expect(result.rows[0].left_behind.total.count).toBe(0)
    for (const table of ["recovery_returns", "recovery_actions", "recovery_findings"]) {
      const pages = requests.filter((url) => url.pathname.endsWith(`/${table}`))
      expect(pages.map((url) => url.searchParams.get("offset"))).toEqual(["0", "1000", "2000"])
    }
  })
})
