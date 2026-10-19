import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

// Escudo de Reputação no banco DE VERDADE (o Supabase da v2 é produção), com o Mercado Livre simulado. Cria uma loja
// temporária com uma conta do ML falsa, roda "Atualizar agora" (só essa conta: nunca a reserva geral, que pegaria as
// contas reais) e confere termômetro, despachos, valor da cor, reclamações e alertas. Apaga tudo no fim.
//   $env:RUN_REPUTATION_DB="1"; npx vitest run tests/integration/reputation-db.test.ts
// Lê as chaves do Supabase do .env.local (nunca imprime). Não manda e-mail (sendPendingEmails não é chamado).
const enabled = process.env.RUN_REPUTATION_DB === "1"
if (enabled) process.loadEnvFile(".env.local")

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const SELLER = 980_000_000 + Math.floor(Math.random() * 9_000_000)
const now = Date.now()

const ml = vi.hoisted(() => ({
  level: "5_green",
  claims: 2,
  calls: [] as string[],
}))

vi.mock("@/lib/mercadolivre/reputation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mercadolivre/reputation")>()
  const { MlApiError } = await import("@/lib/mercadolivre/api")
  const take = (budget: { take: () => void }, name: string) => {
    budget.take()
    ml.calls.push(name)
  }
  return {
    ...actual,
    fetchSellerReputation: vi.fn(async (_account: string, _user: number, budget) => {
      take(budget, "reputation")
      return {
        level_id: ml.level,
        power_seller_status: null,
        metrics: {
          sales: { period: "60 days", completed: 244 },
          claims: { period: "60 days", rate: ml.claims / 244, value: ml.claims },
          delayed_handling_time: { period: "60 days", rate: 0, value: 0 },
          cancellations: { period: "60 days", rate: 0, value: 0 },
        },
      }
    }),
    fetchShipmentInfo: vi.fn(async (_account: string, shipmentId: number, budget) => {
      take(budget, "shipment:" + shipmentId)
      if (shipmentId === 7001) return { status: "ready_to_ship", substatus: "printed", logistic: { type: "drop_off" } }
      if (shipmentId === 7002) return { status: "handling", logistic: { type: "cross_docking" } }
      if (shipmentId === 7003) return { status: "handling", logistic: { type: "fulfillment" } }
      if (shipmentId === 7004) return { status: "shipped", logistic: { type: "drop_off" } }
      throw new MlApiError("Mercado Livre: not_found", 404)
    }),
    fetchShipmentSla: vi.fn(async (_account: string, shipmentId: number, budget) => {
      take(budget, "sla:" + shipmentId)
      if (shipmentId === 7001) return { status: "on_time", expected_date: new Date(now + 2 * HOUR).toISOString() }
      if (shipmentId === 7002) return { status: "delayed", expected_date: new Date(now - HOUR).toISOString() }
      return null
    }),
    fetchShipmentCosts: vi.fn(async (_account: string, shipmentId: number, budget) => {
      take(budget, "costs:" + shipmentId)
      return {
        gross_amount: 30,
        senders: [{ user_id: SELLER, cost: 10, discounts: [{ type: "mandatory", rate: 0.5, promoted_amount: shipmentId === 7003 ? 12.5 : 7.5 }] }],
      }
    }),
    searchSellerClaims: vi.fn(async (_account: string, _user: number, params: Record<string, string>, budget) => {
      take(budget, "claims:" + (params.range ?? "").split(":")[0])
      const respondent = (actions: { action: string; mandatory: boolean; due_date: string | null }[]) => [
        { role: "complainant", type: "buyer", user_id: 1, available_actions: [] },
        { role: "respondent", type: "seller", user_id: SELLER, available_actions: actions },
      ]
      return {
        paging: { total: 3, offset: 0, limit: 100 },
        data: [
          {
            id: 9001,
            resource: "order",
            resource_id: 5001,
            type: "mediations",
            stage: "claim",
            status: "opened",
            reason_id: "PDD9549",
            players: respondent([{ action: "send_message_to_complainant", mandatory: true, due_date: new Date(now + 20 * HOUR).toISOString() }]),
            date_created: new Date(now - 2 * DAY).toISOString(),
            last_updated: new Date(now - DAY).toISOString(),
          },
          {
            id: 9002,
            resource: "order",
            resource_id: 5999,
            type: "returns",
            stage: "claim",
            status: "closed",
            players: respondent([]),
            date_created: new Date(now - 30 * DAY).toISOString(),
            last_updated: new Date(now - 20 * DAY).toISOString(),
          },
          {
            id: 9003,
            resource: "order",
            resource_id: 5002,
            type: "cancel_purchase",
            stage: "none",
            status: "closed",
            players: respondent([]),
            date_created: new Date(now - 3 * DAY).toISOString(),
            last_updated: new Date(now - 3 * DAY).toISOString(),
          },
        ],
      }
    }),
    fetchClaimAffects: vi.fn(async (_account: string, claimId: number, budget) => {
      take(budget, "affects:" + claimId)
      return { affects_reputation: claimId === 9001 ? "affected" : "not_affected", has_incentive: false, due_date: null }
    }),
    fetchOrderDate: vi.fn(async (_account: string, orderId: number, budget) => {
      take(budget, "order:" + orderId)
      return new Date(now - 40 * DAY).toISOString()
    }),
  }
})

describe.runIf(enabled)("Escudo de Reputação no banco (ML simulado)", () => {
  let organizationId = ""
  let userId = ""
  let accountId = ""
  let engine: typeof import("@/lib/reputation/engine")
  let admin: ReturnType<typeof import("@/lib/supabase/admin").createServiceClient>

  const alerts = async () => {
    const { data, error } = await admin
      .from("reputation_alerts")
      .select("kind, dedupe_key, status, severity, email_status")
      .eq("ml_account_id", accountId)
      .order("dedupe_key")
    if (error) throw error
    return data
  }

  beforeAll(async () => {
    engine = await import("@/lib/reputation/engine")
    admin = (await import("@/lib/supabase/admin")).createServiceClient()
    const { data, error } = await admin.auth.admin.createUser({
      email: "qa-reputacao-" + randomUUID().slice(0, 8) + "@teste.local",
      password: "Qa" + randomUUID(),
      email_confirm: true,
      user_metadata: { full_name: "QA Reputação" },
    })
    if (error || !data.user) throw error ?? new Error("usuário")
    userId = data.user.id
    const { data: member } = await admin.from("organization_members").select("organization_id").eq("user_id", userId).single()
    organizationId = member!.organization_id
    await admin.from("organizations").update({ name: "Loja QA Reputação (temporária)" }).eq("id", organizationId)
    const { data: account, error: accountError } = await admin
      .from("ml_accounts")
      .insert({ organization_id: organizationId, ml_user_id: SELLER, nickname: "QA_LOJA_REPUTACAO" })
      .select("id")
      .single()
    if (accountError) throw accountError
    accountId = account.id

    // Vendas pagas recentes (a aba Clientes conta a partir do início da contagem: 20 dias atrás para a loja de teste).
    await admin.from("ml_customer_sync").update({ tracking_since: new Date(now - 20 * DAY).toISOString() }).eq("ml_account_id", accountId)
    const order = (id: number, shipment: number, status = "paid", daysAgo = 1) => ({
      ml_order_id: id,
      buyer_id: 100 + id,
      status,
      ordered_at: new Date(now - daysAgo * DAY).toISOString(),
      ml_last_updated: new Date(now - daysAgo * DAY).toISOString(),
      total_amount: 100,
      currency_id: "BRL",
      shipment_id: shipment,
      items: [{ id: "MLB1", title: "Produto QA " + id, quantity: 1, unit_price: 100 }],
    })
    const { error: ingestError } = await admin.rpc("ingest_ml_orders", {
      p_ml_account_id: accountId,
      p_orders: [order(5001, 7001), order(5002, 7002, "paid", 2), order(5003, 7003), order(5004, 7004, "paid", 3), order(5005, 7005, "cancelled")],
    })
    if (ingestError) throw ingestError
  }, 60_000)

  afterAll(async () => {
    if (organizationId) await admin.from("organizations").delete().eq("id", organizationId)
    if (userId) await admin.auth.admin.deleteUser(userId)
    if (accountId) {
      for (const table of ["reputation_snapshots", "reputation_shipments", "reputation_claims", "reputation_alerts", "reputation_sync"] as const) {
        const { count } = await admin.from(table).select("ml_account_id", { count: "exact", head: true }).eq("ml_account_id", accountId)
        expect(count, table).toBe(0)
      }
    }
  }, 60_000)

  it("primeira leitura: termômetro, despachos, custo do frete, reclamações e alertas", async () => {
    expect(await engine.syncAccountNow(accountId)).toBe("done")

    const { data: snapshots } = await admin.from("reputation_snapshots").select("color, claims_value, period_days").eq("ml_account_id", accountId)
    expect(snapshots).toEqual([{ color: "green", claims_value: 2, period_days: 60 }])

    const { data: shipments } = await admin
      .from("reputation_shipments")
      .select("shipment_id, stage, sla_expected_at, sender_discount")
      .eq("ml_account_id", accountId)
      .order("shipment_id")
    expect(shipments?.map((row) => [row.shipment_id, row.stage])).toEqual([
      [7001, "waiting"],
      [7002, "waiting"],
      [7003, "fulfillment"],
      [7004, "shipped"],
    ])
    expect(shipments?.find((row) => row.shipment_id === 7003)?.sender_discount).toBe(12.5)
    expect(shipments?.find((row) => row.shipment_id === 7004)?.sender_discount).toBe(7.5)
    expect(shipments?.find((row) => row.shipment_id === 7001)?.sender_discount).toBeNull()

    const { data: claims } = await admin
      .from("reputation_claims")
      .select("claim_id, type, affects_reputation, sale_source, next_due_at, affects_checked_at")
      .eq("ml_account_id", accountId)
      .order("claim_id")
    expect(claims?.map((row) => [row.claim_id, row.type, row.affects_reputation, row.sale_source])).toEqual([
      [9001, "mediations", "affected", "order"],
      [9002, "returns", "not_affected", "order"],
      [9003, "cancel_purchase", null, null],
    ])
    expect(claims?.every((row) => row.affects_checked_at)).toBe(true)
    // A venda 5001 já estava em ml_orders: não precisou perguntar a data ao ML; a 5999 sim.
    expect(ml.calls).toContain("order:5999")
    expect(ml.calls).not.toContain("order:5001")

    expect(await alerts()).toEqual([
      { kind: "shipment_at_risk", dedupe_key: "shipment_at_risk:7001", status: "open", severity: "urgent", email_status: "pending" },
      { kind: "shipment_late", dedupe_key: "shipment_late:7002", status: "open", severity: "urgent", email_status: "pending" },
    ])
  }, 60_000)

  it("a tela calcula folga, previsão e valor da cor com o que foi gravado", async () => {
    const { data: snapshot } = await admin.from("reputation_snapshots").select("*").eq("ml_account_id", accountId).single()
    const { snapshotReading } = await import("@/lib/dal/reputation")
    const { computeSlack } = await import("@/lib/reputation/metrics")
    expect(computeSlack(snapshotReading(snapshot!)).metrics[0].slack).toBe(2)
  })

  it("cor caiu e folga no limite viram alertas; despacho feito resolve o alerta", async () => {
    ml.level = "3_yellow"
    ml.claims = 6
    await admin.from("reputation_shipments").update({ stage: "shipped" }).eq("ml_account_id", accountId).eq("shipment_id", 7002)
    expect(await engine.syncAccountNow(accountId)).toBe("done")
    const list = await alerts()
    expect(list.find((alert) => alert.kind === "color_dropped")).toMatchObject({ status: "open", email_status: "pending" })
    // 6 de 244 = 2,46% (amarelo); limite do amarelo 4,5% de 244 = 10,98 → folga 4: sem alerta de folga.
    expect(list.some((alert) => alert.kind === "margin_low")).toBe(false)
    expect(list.find((alert) => alert.dedupe_key === "shipment_late:7002")).toMatchObject({ status: "resolved" })

    const { count } = await admin.from("reputation_snapshots").select("id", { count: "exact", head: true }).eq("ml_account_id", accountId)
    expect(count).toBe(2)
  }, 60_000)

  it("sem mudança: não grava outro termômetro nem repete alertas", async () => {
    const before = await alerts()
    expect(await engine.syncAccountNow(accountId)).toBe("done")
    expect(await alerts()).toEqual(before)
    const { count } = await admin.from("reputation_snapshots").select("id", { count: "exact", head: true }).eq("ml_account_id", accountId)
    expect(count).toBe(2)
  }, 60_000)
})
