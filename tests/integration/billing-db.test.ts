import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { computeAccess } from "@/lib/access/access"
import { matchCatalog } from "@/lib/billing/abacatepay/catalog"
import { parseWebhookEvent } from "@/lib/billing/abacatepay/webhook"

// Fluxo completo da cobrança no banco DE VERDADE (o Supabase da v2 é produção), com a API da AbacatePay simulada.
// Cria uma loja temporária, assina, renova, troca de plano, recusa cobrança e cancela; apaga tudo no fim.
//   $env:RUN_BILLING_DB="1"; npx vitest run tests/integration/billing-db.test.ts
// Lê as chaves do Supabase do .env.local (nunca imprime).
const enabled = process.env.RUN_BILLING_DB === "1"
if (enabled) process.loadEnvFile(".env.local")

const api = vi.hoisted(() => ({
  createCustomer: vi.fn(async () => ({ id: "cust_qa" })),
  createSubscriptionCheckout: vi.fn(async (input: { externalId: string }) => ({
    id: `bill_qa_${input.externalId.slice(0, 8)}`,
    url: `https://app.abacatepay.com/pay/bill_qa_${input.externalId.slice(0, 8)}`,
    amountCents: 19700,
    status: "PENDING",
    devMode: true,
    externalId: input.externalId,
  })),
  getSubscription: vi.fn(async (id: string) => ({
    id,
    status: "ACTIVE",
    amountCents: 19700,
    checkoutId: null,
    customerId: "cust_qa",
    method: "CARD",
    devMode: true,
    updatedAt: null,
  })),
  cancelSubscription: vi.fn(async (id: string) => ({ id, status: "CANCELLED" })),
  changeSubscriptionPlan: vi.fn(async () => ({ status: "PENDING", newAmountCents: null })),
}))
vi.mock("@/lib/billing/abacatepay/client", () => ({ ...api, AbacatePayError: class extends Error {} }))
vi.mock("@/lib/billing/abacatepay/catalog-store", () => ({
  getCatalog: async () => ({
    catalog: matchCatalog(
      [
        ["starter", 9700],
        ["pro", 19700],
        ["escala", 39700],
      ].map(([name, price]) => ({
        id: `prod_qa_${name}`,
        externalId: null,
        name: String(name),
        price: Number(price),
        status: "ACTIVE",
        cycle: "MONTHLY",
        devMode: true,
        trialDays: null,
        updatedAt: "2026-10-14T00:00:00Z",
      }))
    ),
    error: null,
    fetchedAt: new Date().toISOString(),
  }),
}))

/** CPF válido aleatório (o banco exige documento único e válido). */
function randomCpf() {
  const digits = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10))
  for (const weightStart of [10, 11]) {
    const sum = digits.reduce((total, digit, index) => total + digit * (weightStart - index), 0)
    const rest = sum % 11
    digits.push(rest < 2 ? 0 : 11 - rest)
  }
  return digits.join("")
}

function subscriptionEvent(type: string, subscription: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const parsed = parseWebhookEvent(
    JSON.stringify({
      id: `log_qa_${randomUUID()}`,
      event: type,
      apiVersion: 2,
      devMode: true,
      data: { subscription: { currency: "BRL", method: "CARD", status: "ACTIVE", frequency: "MONTHLY", ...subscription }, customer: { id: "cust_qa" }, ...extra },
    })
  )
  if (!parsed) throw new Error("evento inválido")
  return parsed
}

describe.runIf(enabled)("cobrança no banco (AbacatePay simulada)", () => {
  let organizationId = ""
  let userId = ""
  const deliveryIds: string[] = []

  // Importados depois do loadEnvFile e dos mocks.
  let engine: typeof import("@/lib/billing/engine")
  let admin: ReturnType<typeof import("@/lib/supabase/admin").createServiceClient>

  beforeAll(async () => {
    process.env.ABACATEPAY_API_KEY = "abc_dev_qa"
    process.env.ABACATEPAY_WEBHOOK_SECRET = "segredo-qa-com-mais-de-32-caracteres-0001"
    delete process.env.VERCEL_ENV
    engine = await import("@/lib/billing/engine")
    admin = (await import("@/lib/supabase/admin")).createServiceClient()

    const { data, error } = await admin.auth.admin.createUser({
      email: `qa-cobranca-${randomUUID().slice(0, 8)}@teste.local`,
      password: `Qa${randomUUID()}`,
      email_confirm: true,
      user_metadata: { full_name: "QA Cobrança" },
    })
    if (error || !data.user) throw error ?? new Error("usuário")
    userId = data.user.id
    const { data: member } = await admin.from("organization_members").select("organization_id").eq("user_id", userId).single()
    organizationId = member!.organization_id
    await admin.from("organizations").update({ name: "Loja QA Cobrança (temporária)" }).eq("id", organizationId)
    const { error: profileError } = await admin.from("billing_profiles").insert({
      organization_id: organizationId,
      document_type: "cpf",
      document: randomCpf(),
      legal_name: "QA Cobrança",
      postal_code: "01310100",
      street: "Avenida Paulista",
      address_number: "1000",
      district: "Bela Vista",
      city: "São Paulo",
      state: "SP",
      registered_by: userId,
    })
    if (profileError) throw profileError
  }, 30_000)

  afterAll(async () => {
    if (deliveryIds.length) await admin.from("billing_events").delete().in("id", deliveryIds)
    if (organizationId) await admin.from("organizations").delete().eq("id", organizationId)
    if (userId) await admin.auth.admin.deleteUser(userId)
  }, 30_000)

  const actor = () => ({
    organizationId,
    organizationPlan: null,
    userId,
    email: "qa@teste.local",
    whatsapp: "11999999999",
    isPlatformAdmin: false,
  })

  async function organization() {
    const { data } = await admin
      .from("organizations")
      .select("plan, subscription_status, billing_cycle, current_period_end, monthly_price, trial_ends_at, billing_exempt, ml_accounts_limit")
      .eq("id", organizationId)
      .single()
    return data!
  }

  async function deliver(event: ReturnType<typeof subscriptionEvent>) {
    deliveryIds.push(event.deliveryId)
    return engine.processWebhookEvent(event)
  }

  it("assina, renova, troca de plano, recusa cobrança e cancela", async () => {
    // 1. Página de pagamento (Pro mensal).
    const started = await engine.startCheckout(actor(), "pro", "monthly")
    expect(started).toMatchObject({ ok: true })
    expect(started.ok && started.url).toMatch(/^https:\/\/app\.abacatepay\.com\/pay\//)
    const { data: checkout } = await admin.from("billing_checkouts").select("*").eq("organization_id", organizationId).single()
    expect(checkout).toMatchObject({ status: "pending", plan: "pro", product_id: "prod_qa_pro", amount_cents: 19700, dev_mode: true, customer_id: "cust_qa" })
    // Clicou de novo: mesma página.
    const again = await engine.startCheckout(actor(), "pro", "monthly")
    expect(again.ok && again.url).toBe(started.ok && started.url)

    // 2. Pagamento confirmado (webhook).
    const completed = subscriptionEvent(
      "subscription.completed",
      { id: "subs_qa_1", amount: 19700, updatedAt: "2026-10-14T12:00:05Z" },
      {
        payment: { id: "char_qa", status: "PAID", externalId: checkout!.id, updatedAt: "2026-10-14T12:00:05Z", receiptUrl: "https://app.abacatepay.com/receipt/qa" },
        checkout: { id: checkout!.checkout_id, externalId: checkout!.id, items: [{ id: "prod_qa_pro", quantity: 1 }] },
        payerInformation: { method: "CARD", CARD: { number: "4242", brand: "VISA" } },
      }
    )
    expect(await deliver(completed)).toMatchObject({ status: "processed" })
    let org = await organization()
    expect(org).toMatchObject({ plan: "pro", subscription_status: "active", billing_cycle: "monthly", ml_accounts_limit: 3 })
    expect(Number(org.monthly_price)).toBe(197)
    expect(org.current_period_end?.slice(0, 10)).toBe("2026-11-14")
    const { data: sub } = await admin.from("billing_subscriptions").select("*").eq("organization_id", organizationId).single()
    expect(sub).toMatchObject({ subscription_id: "subs_qa_1", status: "active", card_last4: "4242", card_brand: "VISA", dev_mode: true })
    const { data: paid } = await admin.from("billing_checkouts").select("status, subscription_id").eq("id", checkout!.id).single()
    expect(paid).toEqual({ status: "paid", subscription_id: "subs_qa_1" })

    // A mesma entrega de novo: não processa outra vez.
    expect(await engine.processWebhookEvent(completed)).toMatchObject({ status: "duplicate" })
    // Já assina o Pro mensal.
    expect(await engine.startCheckout(actor(), "pro", "monthly")).toMatchObject({ ok: false })

    // 3. Subir para o Escala: liberado na hora.
    expect(await engine.requestPlanChange(actor(), "escala")).toMatchObject({ ok: true })
    expect((await organization()).plan).toBe("escala")
    expect(api.changeSubscriptionPlan).toHaveBeenCalledWith("subs_qa_1", "prod_qa_escala")

    // 4. Renovação já com o valor do Escala.
    expect(
      await deliver(subscriptionEvent("subscription.renewed", { id: "subs_qa_1", amount: 39700, updatedAt: "2026-11-14T12:00:05Z" }, {
        payment: { id: "char_qa_2", status: "PAID", updatedAt: "2026-11-14T12:00:05Z" },
      }))
    ).toMatchObject({ status: "processed" })
    org = await organization()
    expect(org).toMatchObject({ plan: "escala", subscription_status: "active" })
    expect(org.current_period_end?.slice(0, 10)).toBe("2026-12-14")
    expect(Number(org.monthly_price)).toBe(397)

    // 5. Evento atrasado (mais velho que o último aplicado): ignorado.
    expect(
      await deliver(subscriptionEvent("subscription.renewed", { id: "subs_qa_1", amount: 19700, updatedAt: "2026-10-20T00:00:00Z" }))
    ).toMatchObject({ status: "ignored" })
    expect((await organization()).plan).toBe("escala")

    // 6. Cobrança recusada: só avisa.
    expect(
      await deliver(subscriptionEvent("subscription.payment_failed", { id: "subs_qa_1", amount: 39700, updatedAt: "2026-12-14T12:00:00Z" }, { retryNumber: 1 }))
    ).toMatchObject({ status: "processed" })
    const { data: failing } = await admin.from("billing_subscriptions").select("payment_failed_at, payment_failures").eq("organization_id", organizationId).single()
    expect(failing?.payment_failures).toBe(1)
    expect(failing?.payment_failed_at).not.toBeNull()
    expect((await organization()).subscription_status).toBe("active")

    // 7. Descer para o Starter: agendado para a próxima cobrança.
    expect(await engine.requestPlanChange(actor(), "starter")).toMatchObject({ ok: false }) // cobrança recusada → só assinando de novo
    await admin.from("billing_subscriptions").update({ payment_failed_at: null, payment_failures: 0 }).eq("organization_id", organizationId)
    expect(await engine.requestPlanChange(actor(), "starter")).toMatchObject({ ok: true })
    const { data: scheduled } = await admin.from("billing_subscriptions").select("plan, scheduled_plan").eq("organization_id", organizationId).single()
    expect(scheduled).toEqual({ plan: "escala", scheduled_plan: "starter" })
    expect((await organization()).plan).toBe("escala")

    // 8. Troca aplicada pela AbacatePay.
    expect(
      await deliver(subscriptionEvent("subscription.plan_changed", { id: "subs_qa_1", amount: 9700, updatedAt: "2026-12-14T12:00:01Z" }))
    ).toMatchObject({ status: "processed" })
    org = await organization()
    expect(org).toMatchObject({ plan: "starter", ml_accounts_limit: 1 })

    // 9. Cancelar: sem novas cobranças, acesso até o fim do período pago.
    expect(await engine.cancelOrganizationSubscription(organizationId)).toMatchObject({ ok: true })
    org = await organization()
    expect(org.subscription_status).toBe("canceled")
    expect(computeAccess(org, new Date("2026-12-01T00:00:00Z")).state).toBe("active")
    expect(computeAccess(org, new Date("2027-01-01T00:00:00Z")).state).toBe("blocked")
    // O webhook do cancelamento chega depois: mesma situação.
    expect(
      await deliver(subscriptionEvent("subscription.cancelled", { id: "subs_qa_1", amount: 9700, status: "CANCELLED", updatedAt: "2026-12-15T00:00:00Z" }))
    ).toMatchObject({ status: "processed" })
    expect((await organization()).subscription_status).toBe("canceled")

    // 10. Assinatura desconhecida: ignorada sem erro.
    expect(await deliver(subscriptionEvent("subscription.renewed", { id: "subs_de_outro_sistema", amount: 9700 }))).toMatchObject({ status: "ignored" })
  }, 60_000)
})