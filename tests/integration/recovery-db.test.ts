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

// Cenários (baseados nos casos reais de 2026-10-20):
//  8001 aberta, chegou ao endereço do vendedor, revisão liberada → "arrival"
//  8002 aberta, A CAMINHO do armazém, o ML já lista return_review_ok/fail → NÃO pede revisão (at_warehouse)
//  8003 encerrada, armazém tirou de venda e deu ao comprador, sem contestação → "ficou para trás" (expired)
//  8004 encerrada, armazém deu ao vendedor → ressarcido
//  8005 igual à 8003, sem a venda lida pelo Escudo → busca /orders 1 vez
//  8006 encerrada pelo armazém, seller_review_pending + return_review_fail → contestar ("appeal")
//  8007 + 8008 carrinho (mesma devolução 9100): 8007 voltou bem, 8008 tirada de venda e contestável
vi.mock("@/lib/mercadolivre/reputation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mercadolivre/reputation")>()
  const { parseReturn, parseReturnReviews } = await import("@/lib/recovery/returns")
  const take = (budget: { take: () => void }, name: string) => {
    budget.take()
    ml.calls.push(name)
  }
  const ret = (claimId: number, destination: string, status: string, money: string, returnId = claimId + 100) =>
    parseReturn({
      id: returnId,
      status,
      subtype: "return_total",
      status_money: money,
      refund_at: "delivered",
      date_closed: status === "closed" ? new Date(now - DAY).toISOString() : null,
      shipments: [{ status: status === "shipped" ? "shipped" : "delivered", type: "return", destination: { name: destination } }],
      orders: [{ order_id: claimId + 5000, item_id: "MLB1", return_quantity: "1.0", total_quantity: "1.0" }],
    })
  const reviewOf = (orderId: number, entry: Record<string, unknown>) => ({
    resource: "order",
    resource_id: orderId,
    method: "triage",
    resource_reviews: [{ product_destination: "seller", ...entry }],
    date_created: new Date(now - 2 * DAY).toISOString(),
    last_updated: new Date(now - 2 * DAY).toISOString(),
  })
  const pendingAppeal = { stage: "seller_review_pending", status: "success", product_condition: "unsaleable", reason_id: "damaged", benefited: "buyer", seller_status: "pending" }
  const actions: Record<number, { action: string }[]> = {
    8001: [{ action: "return_review_ok" }, { action: "return_review_fail" }],
    8002: [{ action: "return_review_ok" }, { action: "return_review_fail" }],
    8006: [{ action: "return_review_fail" }],
    8008: [{ action: "return_review_fail" }],
  }
  return {
    ...actual,
    fetchClaimReturn: vi.fn(async (_account: string, claimId: number, budget) => {
      take(budget, "return:" + claimId)
      if (claimId === 8001) return ret(claimId, "seller_address", "delivered", "retained")
      if (claimId === 8002) return ret(claimId, "warehouse", "shipped", "retained")
      if (claimId === 8003) return ret(claimId, "warehouse", "closed", "refunded")
      if (claimId === 8004) return ret(claimId, "warehouse", "closed", "available")
      if (claimId === 8005) return ret(claimId, "warehouse", "closed", "refunded")
      if (claimId === 8006) return ret(claimId, "warehouse", "delivered", "refunded")
      if (claimId === 8007 || claimId === 8008) return ret(claimId, "warehouse", "delivered", "refunded", 9100)
      return null
    }),
    fetchReturnReviews: vi.fn(async (_account: string, returnId: number, budget) => {
      take(budget, "reviews:" + returnId)
      const closed = (condition: string, benefited: string) =>
        parseReturnReviews({ reviews: [reviewOf(returnId + 4900, { stage: "closed", status: "failed", product_condition: condition, benefited })] })
      if (returnId === 8103 || returnId === 8105) return closed("unsaleable", "buyer")
      if (returnId === 8104) return closed("unsaleable", "seller")
      if (returnId === 8106) return parseReturnReviews({ reviews: [reviewOf(13006, pendingAppeal)] })
      // Carrinho: /reviews traz os dois pedidos da devolução.
      if (returnId === 9100) {
        return parseReturnReviews({
          reviews: [
            reviewOf(13007, { stage: "closed", status: "success", product_condition: "saleable", reason_id: "accepted", benefited: "buyer" }),
            reviewOf(13008, pendingAppeal),
          ],
        })
      }
      return []
    }),
    fetchClaim: vi.fn(async (_account: string, claimId: number, budget) => {
      take(budget, "claim:" + claimId)
      return {
        id: claimId,
        type: "returns",
        status: claimId === 8001 || claimId === 8002 ? "opened" : "closed",
        players: [{ role: "respondent", type: "seller", user_id: SELLER, available_actions: ml.reviewOpen ? (actions[claimId] ?? []) : [] }],
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
    fetchClaimReasonDetail: vi.fn(async () => null),
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
  /** "Atualizar agora" e empurra a próxima rodada para longe (o cron de produção não pega a conta temporária). */
  async function runNow() {
    const result = await engine.syncRecoveryNow(accountId)
    await admin.from("recovery_sync").update({ next_returns_at: new Date(Date.now() + DAY).toISOString() }).eq("ml_account_id", accountId)
    return result
  }
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
    // Rodada só pelo "Atualizar agora" do teste: o cron de produção só pega conta com a rodada vencida.
    await admin.from("recovery_sync").upsert(
      { ml_account_id: accountId, organization_id: organizationId, next_returns_at: new Date(now + DAY).toISOString() },
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
    const review = [{ action: "return_review_ok", mandatory: false, due_date: null }, { action: "return_review_fail", mandatory: false, due_date: null }]
    const appeal = [{ action: "return_review_fail", mandatory: false, due_date: null }]
    // Resolução real do armazém: applied_coverage true MESMO com o dinheiro do comprador.
    const warehouseBuyer = { reason: "warehouse_decision", benefited: ["complainant"], applied_coverage: true }
    const { error: claimsError } = await admin.from("reputation_claims").insert([
      claim(8001, "opened", review, 5),
      // A caminho do armazém, mas o ML já lista as ações de revisão (caso real): a maanu não pode pedir revisão.
      claim(8002, "opened", review, 3),
      claim(8003, "closed", [], 40, warehouseBuyer),
      claim(8004, "closed", [], 50, { reason: "warehouse_decision", benefited: ["respondent"] }),
      // Reclamação antiga: o Escudo nunca leu a venda (sem order_summary).
      { ...claim(8005, "closed", [], 60, warehouseBuyer), order_summary: null },
      claim(8006, "closed", appeal, 10, warehouseBuyer),
      claim(8007, "closed", [], 8, warehouseBuyer),
      claim(8008, "closed", appeal, 8, warehouseBuyer),
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

  it("primeira leitura: fases, prazo, carrinho, Raio-X, achados e alertas", async () => {
    expect(await runNow()).toBe("done")
    // Segunda rodada: o carrinho só se completa quando as duas reclamações da devolução já foram lidas.
    await admin.from("recovery_sync").update({ last_returns_at: null }).eq("ml_account_id", accountId)
    await admin.from("recovery_returns").update({ synced_at: new Date(now - 2 * DAY).toISOString() }).eq("ml_account_id", accountId).in("claim_id", [8007, 8008])
    await admin.from("reputation_claims").update({ ml_updated_at: new Date().toISOString() }).eq("ml_account_id", accountId).in("claim_id", [8007, 8008])
    expect(await runNow()).toBe("done")
    const { data: rows } = await admin
      .from("recovery_returns")
      .select("claim_id, phase, can_review_ok, can_review_fail, deadline_at, destination, amount, return_id, is_cart, order_id")
      .eq("ml_account_id", accountId)
      .order("claim_id")
    expect(rows?.map((row) => [row.claim_id, row.phase])).toEqual([
      [8001, "needs_review"],
      [8002, "at_warehouse"],
      [8003, "closed"],
      [8004, "closed"],
      [8005, "closed"],
      [8006, "needs_review"],
      [8007, "closed"],
      [8008, "needs_review"],
    ])
    const arrival = rows?.find((row) => row.claim_id === 8001)
    expect(arrival).toMatchObject({ can_review_ok: true, can_review_fail: true, destination: "seller_address", amount: 150, return_id: 8101 })
    expect(Date.parse(arrival?.deadline_at ?? "")).toBeGreaterThan(now + DAY)
    expect(rows?.find((row) => row.claim_id === 8002)).toMatchObject({ can_review_ok: false, can_review_fail: false, deadline_at: null })
    // Contestação: só "com problema", prazo estimado de 60 dias depois da revisão do armazém (2 dias atrás).
    const appeal = rows?.find((row) => row.claim_id === 8006)
    expect(appeal).toMatchObject({ can_review_ok: false, can_review_fail: true })
    expect(Math.abs(Date.parse(appeal?.deadline_at ?? "") - (now + 58 * DAY))).toBeLessThan(HOUR)
    expect(rows?.filter((row) => row.is_cart).map((row) => row.claim_id)).toEqual([8007, 8008])

    const { data: findings } = await admin
      .from("recovery_findings")
      .select("kind, status, confidence, amount, dedupe_key, evidence")
      .eq("ml_account_id", accountId)
      .order("dedupe_key")
    expect(findings?.map((finding) => [finding.dedupe_key, finding.kind, finding.status, (finding.evidence as { outcome?: string }).outcome, Number(finding.amount)])).toEqual([
      ["return:8003", "return_unsaleable_unreimbursed", "resolved", "expired", 150],
      ["return:8004", "return_reimbursed", "resolved", "reimbursed", 150],
      ["return:8005", "return_unsaleable_unreimbursed", "resolved", "expired", 77],
      ["return:8006", "return_unsaleable_unreimbursed", "open", "contestable", 150],
      ["return:8008", "return_unsaleable_unreimbursed", "open", "contestable", 150],
    ])
    expect(ml.calls).toContain("order:13005")
    const { data: old } = await admin.from("recovery_returns").select("amount, item_title").eq("ml_account_id", accountId).eq("claim_id", 8005).single()
    expect(old).toEqual({ amount: 77, item_title: "Produto antigo" })

    const { data: scan } = await admin.from("recovery_scans").select("status, returns_total, returns_done").eq("ml_account_id", accountId).single()
    expect(scan).toEqual({ status: "done", returns_total: 8, returns_done: 8 })

    const { data: alerts } = await admin
      .from("reputation_alerts")
      .select("kind, dedupe_key, status, severity")
      .eq("ml_account_id", accountId)
      .order("dedupe_key")
    expect(alerts).toEqual([
      { kind: "return_review_due", dedupe_key: "return_review_due:8001", status: "open", severity: "urgent" },
      { kind: "return_review_due", dedupe_key: "return_review_due:8006", status: "open", severity: "urgent" },
      { kind: "return_review_due", dedupe_key: "return_review_due:8008", status: "open", severity: "urgent" },
    ])

    const { data: sync } = await admin.from("recovery_sync").select("last_error, locked_until").eq("ml_account_id", accountId).single()
    expect(sync).toEqual({ last_error: null, locked_until: null })
  }, 90_000)

  it("sem mudança no ML: não lê de novo", async () => {
    ml.calls.length = 0
    await admin.from("recovery_sync").update({ last_returns_at: null }).eq("ml_account_id", accountId)
    expect(await runNow()).toBe("done")
    expect(ml.calls.filter((call) => call.startsWith("return:"))).toEqual([])
  }, 60_000)

  it("revisão: só dono/administrador, valida antes, nunca revisa pacote a caminho e para se o ML não libera mais", async () => {
    const rowOf = async (claimId: number) =>
      (await admin.from("recovery_returns").select("id").eq("ml_account_id", accountId).eq("claim_id", claimId).single()).data!.id
    const base = { organizationId, userId, returnRowId: await rowOf(8001), decision: "fail" as const, reasonId: "SRF2", message: "Chegou quebrado.", photos: [] }
    expect(await engine.submitReturnReviewFor({ ...base, canManage: false })).toEqual({
      ok: false,
      message: "Só o dono ou um administrador da loja pode enviar a revisão.",
    })
    // SRF2 exige foto: para antes de subir qualquer coisa.
    expect((await engine.submitReturnReviewFor({ ...base, canManage: true })).message).toContain("pelo menos uma foto")
    // Contestação também valida (e aceita motivo de pedido do carrinho).
    expect((await engine.submitReturnReviewFor({ ...base, canManage: true, returnRowId: await rowOf(8008) })).message).toContain("pelo menos uma foto")
    // Pacote a caminho do armazém com as ações listadas: recusa sem falar de envio.
    expect(
      (await engine.submitReturnReviewFor({ ...base, canManage: true, decision: "ok", reasonId: null, returnRowId: await rowOf(8002) })).message
    ).toContain("ainda não chegou")
    // Contestação nunca aceita "chegou certinho".
    expect((await engine.submitReturnReviewFor({ ...base, canManage: true, decision: "ok", reasonId: null, returnRowId: await rowOf(8006) })).ok).toBe(false)
    ml.reviewOpen = false
    expect((await engine.submitReturnReviewFor({ ...base, canManage: true, reasonId: "SRF3" })).message).toContain("não libera mais")
  }, 90_000)
})
