import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import type { Database } from "@/lib/supabase/database.types"

// Recuperador no banco DE VERDADE (o Supabase da v2 é produção), com o Mercado Livre simulado. Cria uma loja temporária
// com uma conta do ML falsa e 4 devoluções em reputation_claims, roda "Atualizar agora" (só essa conta: nunca a reserva
// geral, que pegaria as contas reais) e confere fases, prazo, Raio-X, achados e alertas. Apaga tudo no fim.
// Nunca envia revisão com sucesso: recovery_actions é imutável e não pode ficar com dado de teste.
//   $env:RUN_RECOVERY_DB="1"; npx vitest run tests/integration/recovery-db.test.ts
const enabled = process.env.RUN_RECOVERY_DB === "1"
if (enabled) process.loadEnvFile(".env.local")

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const SELLER = 990_000_000 + Math.floor(Math.random() * 9_000_000)
const now = Date.now()

const ml = vi.hoisted(() => ({ calls: [] as string[], reviewOpen: true }))

vi.mock("@/lib/mercadolivre/reputation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mercadolivre/reputation")>()
  const { parseReturn, parseReturnReviews } = await import("@/lib/recovery/returns")
  const take = (budget: { take: () => void }, name: string) => {
    budget.take()
    ml.calls.push(name)
  }
  const ret = (claimId: number, destination: string, status: string, money: string) =>
    parseReturn({
      id: claimId + 100,
      status,
      subtype: "return_total",
      status_money: money,
      refund_at: "delivered",
      date_closed: status === "closed" ? new Date(now - DAY).toISOString() : null,
      shipments: [{ status: status === "shipped" ? "shipped" : "delivered", type: "return", destination: { name: destination } }],
      orders: [{ order_id: claimId + 5000, item_id: "MLB1", return_quantity: "1.0", total_quantity: "1.0" }],
    })
  return {
    ...actual,
    fetchClaimReturn: vi.fn(async (_account: string, claimId: number, budget) => {
      take(budget, "return:" + claimId)
      if (claimId === 8001) return ret(claimId, "seller_address", "delivered", "retained")
      if (claimId === 8002) return ret(claimId, "warehouse", "shipped", "retained")
      if (claimId === 8003) return ret(claimId, "warehouse", "closed", "refunded")
      if (claimId === 8004) return ret(claimId, "warehouse", "closed", "available")
      if (claimId === 8005) return ret(claimId, "warehouse", "closed", "refunded")
      return null
    }),
    fetchReturnReviews: vi.fn(async (_account: string, returnId: number, budget) => {
      take(budget, "reviews:" + returnId)
      const review = (condition: string, benefited: string) =>
        parseReturnReviews({
          reviews: [
            {
              resource: "order",
              resource_id: returnId + 4900,
              method: "triage",
              resource_reviews: [{ stage: "closed", status: "failed", product_condition: condition, product_destination: "seller", benefited }],
            },
          ],
        })
      if (returnId === 8103 || returnId === 8105) return review("unsaleable", "buyer")
      if (returnId === 8104) return review("unsaleable", "seller")
      return []
    }),
    fetchClaim: vi.fn(async (_account: string, claimId: number, budget) => {
      take(budget, "claim:" + claimId)
      return {
        id: claimId,
        type: "returns",
        status: "opened",
        players: [{ role: "respondent", type: "seller", user_id: SELLER, available_actions: ml.reviewOpen ? [{ action: "return_review_fail" }] : [] }],
      }
    }),
    fetchClaimOrder: vi.fn(async (_account: string, orderId: number, budget) => {
      take(budget, "order:" + orderId)
      return {
        summary: { order_id: orderId, pack_id: null, date: new Date(now - 60 * DAY).toISOString(), total_amount: 77, currency_id: "BRL", items: [{ title: "Produto antigo", quantity: 1, unit_price: 77 }] },
        buyerNickname: null,
        shipmentId: null,
      }
    }),
    fetchClaimDetail: vi.fn(async () => {
      throw new (await import("@/lib/mercadolivre/api")).MlApiError("Mercado Livre: not_found", 404)
    }),
    fetchClaimMessages: vi.fn(async () => []),
    fetchClaimExpectedResolutions: vi.fn(async () => []),
    fetchClaimAffects: vi.fn(async () => ({ affects_reputation: "not_affected" })),
    fetchReturnFailReasons: vi.fn(async (_account: string, claimId: number, budget) => {
      take(budget, "reasons:" + claimId)
      return (await import("@/lib/recovery/review")).FALLBACK_REASONS.slice()
    }),
    uploadReturnAttachment: vi.fn(async () => {
      throw new Error("não deveria subir foto no teste")
    }),
    submitReturnReview: vi.fn(async () => {
      throw new Error("não deveria enviar revisão no teste")
    }),
  }
})

describe.runIf(enabled)("Recuperador no banco (ML simulado)", () => {
  let organizationId = ""
  let userId = ""
  let accountId = ""
  let engine: typeof import("@/lib/recovery/engine")
  let admin: ReturnType<typeof import("@/lib/supabase/admin").createServiceClient>

  beforeAll(async () => {
    engine = await import("@/lib/recovery/engine")
    admin = (await import("@/lib/supabase/admin")).createServiceClient()
    const { data, error } = await admin.auth.admin.createUser({
      email: "qa-recuperador-" + randomUUID().slice(0, 8) + "@teste.local",
      password: "Qa" + randomUUID(),
      email_confirm: true,
      user_metadata: { full_name: "QA Recuperador" },
    })
    if (error || !data.user) throw error ?? new Error("usuário")
    userId = data.user.id
    const { data: member } = await admin.from("organization_members").select("organization_id").eq("user_id", userId).single()
    organizationId = member!.organization_id
    await admin.from("organizations").update({ name: "Loja QA Recuperador (temporária)" }).eq("id", organizationId)
    // Sem e-mail para a loja temporária (a rodada do Escudo manda os alertas urgentes pendentes).
    await admin.from("reputation_settings").upsert({ organization_id: organizationId, email_alerts: false }, { onConflict: "organization_id" })
    const { data: account, error: accountError } = await admin
      .from("ml_accounts")
      .insert({ organization_id: organizationId, ml_user_id: SELLER, nickname: "QA_LOJA_RECUPERADOR" })
      .select("id")
      .single()
    if (accountError) throw accountError
    accountId = account.id
    await admin.from("reputation_sync").upsert(
      { ml_account_id: accountId, organization_id: organizationId, claims_backfilled_at: new Date(now).toISOString() },
      { onConflict: "ml_account_id" }
    )
    const claim = (id: number, status: string, actions: unknown[], daysAgo: number, resolution: unknown = null) => ({
      organization_id: organizationId,
      ml_account_id: accountId,
      claim_id: id,
      type: "returns",
      status,
      resource: "order",
      resource_id: id + 5000,
      seller_actions: actions,
      detail: { title: "Devolução", due_date: new Date(now + 2 * DAY).toISOString(), action_responsible: "respondent" },
      resolution,
      order_summary: { order_id: id + 5000, pack_id: null, date: null, total_amount: 150, currency_id: "BRL", items: [{ title: "Produto QA " + id, quantity: 1, unit_price: 150 }] },
      ml_created_at: new Date(now - daysAgo * DAY).toISOString(),
      ml_updated_at: new Date(now - HOUR).toISOString(),
    })
    const { error: claimsError } = await admin.from("reputation_claims").insert([
      claim(8001, "opened", [{ action: "return_review_ok", mandatory: false, due_date: null }, { action: "return_review_fail", mandatory: false, due_date: null }], 5),
      claim(8002, "opened", [], 3),
      claim(8003, "closed", [], 40, { reason: "warehouse_decision", benefited: ["complainant"] }),
      claim(8004, "closed", [], 50, { reason: "warehouse_decision", benefited: ["respondent"] }),
      // Reclamação antiga: o Escudo nunca leu a venda (sem order_summary).
      { ...claim(8005, "closed", [], 60, { reason: "warehouse_decision", benefited: ["complainant"] }), order_summary: null },
    ] as unknown as Database["public"]["Tables"]["reputation_claims"]["Insert"][])
    if (claimsError) throw claimsError
  }, 60_000)

  afterAll(async () => {
    if (organizationId) await admin.from("organizations").delete().eq("id", organizationId)
    if (userId) await admin.auth.admin.deleteUser(userId)
    if (accountId) {
      for (const table of ["recovery_returns", "recovery_findings", "recovery_scans", "recovery_sync", "reputation_alerts", "reputation_claims"] as const) {
        const { count } = await admin.from(table).select("ml_account_id", { count: "exact", head: true }).eq("ml_account_id", accountId)
        expect(count, table).toBe(0)
      }
      const { count } = await admin.from("recovery_actions").select("id", { count: "exact", head: true }).eq("ml_account_id", accountId)
      expect(count, "recovery_actions").toBe(0)
    }
  }, 60_000)

  it("primeira leitura: fases, prazo, Raio-X, achados e alertas", async () => {
    expect(await engine.syncRecoveryNow(accountId)).toBe("done")
    const { data: rows } = await admin
      .from("recovery_returns")
      .select("claim_id, phase, can_review_ok, can_review_fail, deadline_at, destination, amount, return_id")
      .eq("ml_account_id", accountId)
      .order("claim_id")
    expect(rows?.map((row) => [row.claim_id, row.phase])).toEqual([
      [8001, "needs_review"],
      [8002, "at_warehouse"],
      [8003, "closed"],
      [8004, "closed"],
      [8005, "closed"],
    ])
    const review = rows?.find((row) => row.claim_id === 8001)
    expect(review).toMatchObject({ can_review_ok: true, can_review_fail: true, destination: "seller_address", amount: 150, return_id: 8101 })
    expect(Date.parse(review?.deadline_at ?? "")).toBeGreaterThan(now + DAY)

    const { data: findings } = await admin
      .from("recovery_findings")
      .select("kind, status, confidence, amount, dedupe_key")
      .eq("ml_account_id", accountId)
      .order("dedupe_key")
    expect(findings).toEqual([
      { kind: "return_unsaleable_unreimbursed", status: "open", confidence: "medium", amount: 150, dedupe_key: "return:8003" },
      { kind: "return_reimbursed", status: "resolved", confidence: "high", amount: 150, dedupe_key: "return:8004" },
      { kind: "return_unsaleable_unreimbursed", status: "open", confidence: "medium", amount: 77, dedupe_key: "return:8005" },
    ])
    expect(ml.calls).toContain("order:13005")
    const { data: old } = await admin.from("recovery_returns").select("amount, item_title").eq("ml_account_id", accountId).eq("claim_id", 8005).single()
    expect(old).toEqual({ amount: 77, item_title: "Produto antigo" })

    const { data: scan } = await admin.from("recovery_scans").select("status, returns_total, returns_done").eq("ml_account_id", accountId).single()
    expect(scan).toEqual({ status: "done", returns_total: 5, returns_done: 5 })

    const { data: alerts } = await admin.from("reputation_alerts").select("kind, dedupe_key, status, severity").eq("ml_account_id", accountId)
    expect(alerts).toEqual([{ kind: "return_review_due", dedupe_key: "return_review_due:8001", status: "open", severity: "urgent" }])

    const { data: sync } = await admin.from("recovery_sync").select("last_error, locked_until").eq("ml_account_id", accountId).single()
    expect(sync).toEqual({ last_error: null, locked_until: null })
  }, 60_000)

  it("sem mudança no ML: não lê de novo", async () => {
    ml.calls.length = 0
    await admin.from("recovery_sync").update({ last_returns_at: null }).eq("ml_account_id", accountId)
    expect(await engine.syncRecoveryNow(accountId)).toBe("done")
    expect(ml.calls.filter((call) => call.startsWith("return:"))).toEqual([])
  }, 60_000)

  it("revisão: só dono/administrador, valida antes e não envia se o ML não libera mais", async () => {
    const { data: row } = await admin.from("recovery_returns").select("id").eq("ml_account_id", accountId).eq("claim_id", 8001).single()
    const base = { organizationId, userId, returnRowId: row!.id, decision: "fail" as const, reasonId: "SRF2", message: "Chegou quebrado.", photos: [] }
    expect(await engine.submitReturnReviewFor({ ...base, canManage: false })).toEqual({
      ok: false,
      message: "Só o dono ou um administrador da loja pode enviar a revisão.",
    })
    // SRF2 exige foto: para antes de subir qualquer coisa.
    expect((await engine.submitReturnReviewFor({ ...base, canManage: true })).message).toContain("pelo menos uma foto")
    ml.reviewOpen = false
    expect((await engine.submitReturnReviewFor({ ...base, canManage: true, reasonId: "SRF3" })).message).toContain("não libera mais")
  }, 60_000)
})
