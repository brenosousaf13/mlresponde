import { afterEach, describe, expect, it, vi } from "vitest"

// E-mail desligado ou com falha só registra o estado do alerta e segue: nada lança erro nem bloqueia a rodada.

const state = vi.hoisted(() => ({
  emailEnabled: false,
  sendResult: { ok: false, error: "Resend fora do ar" } as { ok: true } | { ok: false; error: string },
  updates: [] as { table: string; fields: Record<string, unknown> }[],
  pending: [] as Record<string, unknown>[],
}))

vi.mock("@/lib/email/resend", () => ({
  emailEnabled: () => state.emailEnabled,
  sendEmail: vi.fn(async () => state.sendResult),
}))

function tableData(table: string): unknown[] {
  if (table === "reputation_alerts") return state.pending
  if (table === "ml_accounts") return [{ id: "acc-1", nickname: "LOJA", ml_user_id: 1 }]
  if (table === "organizations") return [{ id: "org-1", name: "Loja" }]
  if (table === "organization_members") return [{ user_id: "user-1" }]
  return []
}

vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: () => ({
    from(table: string) {
      let update: Record<string, unknown> | null = null
      const query: Record<string, unknown> = {}
      for (const method of ["select", "eq", "in", "gte", "order", "limit", "not", "or", "is"]) query[method] = () => query
      query.update = (fields: Record<string, unknown>) => {
        update = fields
        return query
      }
      query.then = (resolve: (value: unknown) => unknown) => {
        if (update) state.updates.push({ table, fields: update })
        return Promise.resolve({ data: update ? null : tableData(table), error: null }).then(resolve)
      }
      return query
    },
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "dono@loja.com.br", banned_until: null } }, error: null }) } },
  }),
}))

const { sendPendingEmails } = await import("@/lib/reputation/engine")

function pendingAlert() {
  const stamp = new Date().toISOString()
  return {
    id: "alert-1",
    organization_id: "org-1",
    ml_account_id: "acc-1",
    kind: "return_review_due",
    status: "open",
    created_at: stamp,
    opened_at: stamp,
    title: "Chegou a devolução",
    body: "Confira o produto",
    data: {},
  }
}

describe("e-mail do Escudo/Recuperador não bloqueia nada", () => {
  afterEach(() => {
    state.updates = []
    state.pending = []
    vi.spyOn(console, "error").mockRestore()
  })

  it("sem RESEND_API_KEY: marca skipped e devolve 0, sem lançar erro", async () => {
    state.emailEnabled = false
    await expect(sendPendingEmails(Date.now() + 10_000)).resolves.toBe(0)
    expect(state.updates).toEqual([
      { table: "reputation_alerts", fields: expect.objectContaining({ email_status: "skipped" }) },
    ])
  })

  it("e-mail falhou: marca failed com o motivo, não lança e a rodada segue", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    state.emailEnabled = true
    state.sendResult = { ok: false, error: "Resend fora do ar" }
    state.pending = [pendingAlert()]
    await expect(sendPendingEmails(Date.now() + 10_000)).resolves.toBe(0)
    expect(state.updates).toContainEqual({
      table: "reputation_alerts",
      fields: expect.objectContaining({ email_status: "failed", email_error: "Resend fora do ar" }),
    })
  })
})
