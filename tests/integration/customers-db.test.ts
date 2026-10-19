import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { isPurchase, type MlSearchOrder } from "@/lib/customers/orders"

// Fluxo da aba Clientes no banco DE VERDADE (o Supabase da v2 é produção), com o Mercado Livre simulado.
// Cria uma loja temporária com uma conta do ML falsa, importa 12 meses de vendas, confere, lê cidades, recebe uma
// notificação e apaga tudo no fim. NÃO chama a reserva (claim_customer_sync): ela pegaria as contas reais.
//   $env:RUN_CUSTOMERS_DB="1"; npx vitest run tests/integration/customers-db.test.ts
// Lê as chaves do Supabase do .env.local (nunca imprime).
const enabled = process.env.RUN_CUSTOMERS_DB === "1"
if (enabled) process.loadEnvFile(".env.local")

const DAY = 24 * 60 * 60 * 1000
const SELLER = 990_000_000 + Math.floor(Math.random() * 9_000_000)
const now = Date.now()

/** Vendas falsas: 40 compradores, 400 dias (as de mais de 365 dias não entram), packs, canceladas e uma sem comprador. */
function makeOrders(): MlSearchOrder[] {
  const orders: MlSearchOrder[] = []
  for (let index = 0; index < 160; index++) {
    const buyer = (index % 40) + 1
    const created = new Date(now - Math.floor((index / 160) * 400 * DAY) - 60_000).toISOString()
    orders.push({
      id: 3_000_000_000 + index,
      status: index % 11 === 0 ? "cancelled" : index % 17 === 0 ? "partially_refunded" : "paid",
      date_created: created,
      date_closed: created,
      last_updated: created,
      pack_id: index % 9 === 0 ? 8_000_000_000 + Math.floor(index / 2) : null,
      total_amount: 10 + (index % 7) * 5,
      paid_amount: 10 + (index % 7) * 5,
      currency_id: "BRL",
      order_items: [{ item: { id: "MLB" + (index % 5), title: "Produto QA " + (index % 5) }, quantity: 1, unit_price: 10 }],
      shipping: index % 13 === 0 ? null : { id: 4_000_000_000 + index },
      buyer: { id: 70_000 + buyer, nickname: "QA_COMPRADOR_" + buyer },
      seller: { id: SELLER },
      mediations: index === 3 ? [{ id: 1 }] : [],
    })
  }
  orders.push({ id: 3_999_999_999, status: "paid", date_created: new Date(now - DAY).toISOString(), buyer: null, seller: { id: SELLER } })
  return orders
}

const ml = vi.hoisted(() => ({
  orders: [] as MlSearchOrder[],
  calls: 0,
  missingShipment: 0,
}))

vi.mock("@/lib/mercadolivre/orders", () => ({
  searchSellerOrders: vi.fn(async (_accountId: string, _seller: number, params: Record<string, string>) => {
    ml.calls++
    const time = (value?: string) => (value ? Date.parse(value.replace("-00:00", "Z")) : Number.NaN)
    const createdFrom = time(params["order.date_created.from"])
    const createdTo = time(params["order.date_created.to"])
    const updatedFrom = time(params["order.date_last_updated.from"])
    const matches = ml.orders.filter((order) => {
      const created = Date.parse(order.date_created ?? "")
      const updated = Date.parse(order.last_updated ?? order.date_created ?? "")
      if (Number.isFinite(createdFrom) && created < createdFrom) return false
      if (Number.isFinite(createdTo) && created > createdTo) return false
      if (Number.isFinite(updatedFrom) && updated < updatedFrom) return false
      return true
    })
    matches.sort((a, b) => Date.parse(b.date_closed ?? b.date_created ?? "") - Date.parse(a.date_closed ?? a.date_created ?? ""))
    const offset = Number(params.offset ?? 0)
    const limit = Number(params.limit ?? 50)
    return { results: matches.slice(offset, offset + limit), paging: { total: matches.length, offset, limit } }
  }),
  // /orders/{id} traz nome e sobrenome (a busca não traz; conferido no ML em 2026-10-19).
  fetchOrder: vi.fn(async (_accountId: string, orderId: number) => {
    const order = ml.orders.find((candidate) => candidate.id === orderId)
    if (!order) throw new Error("venda não encontrada")
    return order.buyer ? { ...order, buyer: { ...order.buyer, first_name: "Nome" + order.buyer.id, last_name: "Sobrenome QA" } } : order
  }),
  fetchShipmentDestination: vi.fn(async (_accountId: string, shipmentId: number) => {
    const { MlApiError } = await import("@/lib/mercadolivre/api")
    if (shipmentId % 5 === 0) {
      ml.missingShipment++
      throw new MlApiError("Mercado Livre: not found", 404)
    }
    return { destination: { shipping_address: { city: { name: "Cidade QA " + (shipmentId % 3) }, state: { id: "BR-MG" } } } }
  }),
}))

describe.runIf(enabled)("aba Clientes no banco (ML simulado)", () => {
  let organizationId = ""
  let userId = ""
  let accountId = ""
  let engine: typeof import("@/lib/customers/engine")
  let admin: ReturnType<typeof import("@/lib/supabase/admin").createServiceClient>

  const syncRow = async () => {
    const { data, error } = await admin.from("ml_customer_sync").select("*").eq("ml_account_id", accountId).single()
    if (error) throw error
    return data
  }

  beforeAll(async () => {
    ml.orders = makeOrders()
    engine = await import("@/lib/customers/engine")
    admin = (await import("@/lib/supabase/admin")).createServiceClient()

    const { data, error } = await admin.auth.admin.createUser({
      email: "qa-clientes-" + randomUUID().slice(0, 8) + "@teste.local",
      password: "Qa" + randomUUID(),
      email_confirm: true,
      user_metadata: { full_name: "QA Clientes" },
    })
    if (error || !data.user) throw error ?? new Error("usuário")
    userId = data.user.id
    const { data: member } = await admin.from("organization_members").select("organization_id").eq("user_id", userId).single()
    organizationId = member!.organization_id
    await admin.from("organizations").update({ name: "Loja QA Clientes (temporária)" }).eq("id", organizationId)
    const { data: account, error: accountError } = await admin
      .from("ml_accounts")
      .insert({ organization_id: organizationId, ml_user_id: SELLER, nickname: "QA_LOJA_CLIENTES" })
      .select("id")
      .single()
    if (accountError) throw accountError
    accountId = account.id
  }, 30_000)

  afterAll(async () => {
    if (organizationId) await admin.from("organizations").delete().eq("id", organizationId)
    if (userId) await admin.auth.admin.deleteUser(userId)
    if (accountId) {
      const { count } = await admin.from("ml_customers").select("id", { count: "exact", head: true }).eq("ml_account_id", accountId)
      expect(count).toBe(0)
    }
  }, 30_000)

  it("conta nova começa com a importação pendente", async () => {
    expect(await syncRow()).toMatchObject({ status: "pending", orders_imported: 0, organization_id: organizationId })
  })

  it("importa os últimos 12 meses (e só eles) até concluir", async () => {
    let row = await syncRow()
    for (let round = 0; round < 40 && row.status !== "done"; round++) {
      await engine.importAccount(row, SELLER, 2, Date.now() + 60_000)
      row = await syncRow()
    }
    expect(row.status).toBe("done")
    expect(row.import_finished_at).not.toBeNull()

    const since = Date.parse(row.import_since!)
    const expected = ml.orders.filter((order) => order.buyer?.id && Date.parse(order.date_created ?? "") >= since)
    const { count: orders } = await admin.from("ml_orders").select("id", { count: "exact", head: true }).eq("ml_account_id", accountId)
    expect(orders).toBe(expected.length)

    // Números de um comprador conferidos à mão (compras por pack, só as válidas).
    const buyer = 70_007
    const mine = expected.filter((order) => order.buyer?.id === buyer && isPurchase(order.status))
    const { data: customer } = await admin
      .from("ml_customers")
      .select("purchases_count, total_spent, nickname, last_order_at")
      .eq("ml_account_id", accountId)
      .eq("buyer_id", buyer)
      .single()
    expect(customer?.purchases_count).toBe(new Set(mine.map((order) => order.pack_id ?? order.id)).size)
    expect(Number(customer?.total_spent)).toBe(mine.reduce((sum, order) => sum + (order.total_amount ?? 0), 0))
    expect(customer?.nickname).toBe("QA_COMPRADOR_7")
  }, 120_000)

  it("conferência pega venda alterada e venda nova", async () => {
    const changed = ml.orders.find((order) => order.status === "paid" && order.buyer?.id === 70_001)!
    changed.status = "cancelled"
    changed.last_updated = new Date().toISOString()
    ml.orders.push({
      ...ml.orders[1],
      id: 3_500_000_001,
      date_created: new Date().toISOString(),
      date_closed: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      pack_id: null,
      buyer: { id: 79_999, nickname: "QA_COMPRADOR_NOVO" },
    })
    await admin.from("ml_customer_sync").update({ last_polled_at: new Date(Date.now() - 20 * 60 * 1000).toISOString() }).eq("ml_account_id", accountId)
    await engine.pollAccount(await syncRow(), SELLER)

    const { data: order } = await admin.from("ml_orders").select("status").eq("ml_account_id", accountId).eq("ml_order_id", Number(changed.id)).single()
    expect(order?.status).toBe("cancelled")
    const { data: fresh } = await admin.from("ml_customers").select("purchases_count").eq("ml_account_id", accountId).eq("buyer_id", 79_999).single()
    expect(fresh?.purchases_count).toBe(1)
    const row = await syncRow()
    expect(Date.parse(row.last_polled_at!)).toBeGreaterThan(Date.now() - 60_000)
  }, 60_000)

  it("lê cidade/UF e nome dos clientes (envio 404 deixa de ficar pendente e ainda guarda o nome)", async () => {
    const { count: withoutNameBefore } = await admin
      .from("ml_customers")
      .select("id", { count: "exact", head: true })
      .eq("ml_account_id", accountId)
      .is("first_name", null)
    expect(withoutNameBefore).toBeGreaterThan(0)
    for (let round = 0; round < 5; round++) await engine.resolveLocations(60, Date.now() + 30_000, [accountId])
    const { count: pending } = await admin
      .from("ml_customers")
      .select("id", { count: "exact", head: true })
      .eq("ml_account_id", accountId)
      .eq("location_pending", true)
    expect(pending).toBe(0)
    const { count: withCity } = await admin
      .from("ml_customers")
      .select("id", { count: "exact", head: true })
      .eq("ml_account_id", accountId)
      .eq("state", "MG")
    expect(withCity).toBeGreaterThan(0)
    const { data: named } = await admin
      .from("ml_customers")
      .select("full_name")
      .eq("ml_account_id", accountId)
      .eq("buyer_id", 70_005)
      .single()
    expect(named?.full_name).toBe("Nome70005 Sobrenome QA")
  }, 60_000)

  it("notificação orders_v2: grava a venda da loja e ignora venda de outra loja", async () => {
    const { data: account } = await admin
      .from("ml_accounts")
      .select("id, ml_user_id, status, organizations(trial_ends_at, subscription_status, billing_exempt, current_period_end)")
      .eq("id", accountId)
      .single()
    const base = ml.orders[2]
    ml.orders.push(
      { ...base, id: 3_600_000_001, pack_id: null, date_created: new Date().toISOString(), last_updated: new Date().toISOString(), buyer: { id: 79_998, nickname: "QA_NOTIFICADO" } },
      { ...base, id: 3_600_000_002, pack_id: null, seller: { id: 1 }, buyer: { id: 79_997, nickname: "QA_OUTRA_LOJA" } }
    )
    await engine.handleOrderNotification(account!, 3_600_000_001)
    await engine.handleOrderNotification(account!, 3_600_000_002)
    const { data: rows } = await admin.from("ml_customers").select("buyer_id").eq("ml_account_id", accountId).in("buyer_id", [79_998, 79_997])
    expect(rows?.map((row) => row.buyer_id)).toEqual([79_998])
  }, 30_000)

  it("números do topo contam só quem tem compra válida", async () => {
    const { count: all } = await admin.from("ml_customers").select("id", { count: "exact", head: true }).eq("organization_id", organizationId)
    const { count: withoutPurchase } = await admin
      .from("ml_customers")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("purchases_count", 0)
    expect(all).toBeGreaterThan(0)
    const { data: overview } = await admin.rpc("customers_overview", { p_organization_id: organizationId })
    expect(Number((overview as { customers: number }).customers)).toBe((all ?? 0) - (withoutPurchase ?? 0))
  })
})
