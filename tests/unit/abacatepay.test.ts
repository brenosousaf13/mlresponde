import { describe, expect, it } from "vitest"

import { paymentNotice } from "@/lib/access/notices"
import {
  checkoutAvailability,
  matchCatalog,
  planFromAmount,
  productPlan,
  type AbacateProduct,
} from "@/lib/billing/abacatepay/catalog"
import { billingSettings, canUseTestPayments, keyMode } from "@/lib/billing/abacatepay/config"
import {
  addOneMonth,
  decideBillingEvent,
  isDisputeCancellation,
  monthlyPriceFromAmount,
  type LinkedCheckout,
  type StoredSubscription,
} from "@/lib/billing/abacatepay/decide"
import { parseWebhookEvent, signLegacy, signStandard, verifyDelivery } from "@/lib/billing/abacatepay/webhook"
import { isUpgrade, planIntent } from "@/lib/billing/subscription"

const SECRET = "segredo-de-teste-com-mais-de-32-caracteres-123"

function headers(values: Record<string, string>) {
  const map = new Map(Object.entries(values).map(([key, value]) => [key.toLowerCase(), value]))
  return { get: (name: string) => map.get(name.toLowerCase()) ?? null }
}

function product(partial: Partial<AbacateProduct>): AbacateProduct {
  return {
    id: "prod_x",
    externalId: null,
    name: "Pro",
    price: 19700,
    status: "ACTIVE",
    cycle: "MONTHLY",
    devMode: false,
    trialDays: null,
    updatedAt: "2026-10-14T10:00:00Z",
    ...partial,
  }
}

// Corpo de exemplo da documentação (subscription.completed, cartão), com valores da maanu.
function completedBody(overrides: Record<string, unknown> = {}) {
  return {
    id: "log_taQArRTApemxwcbw5EJeF3hS",
    event: "subscription.completed",
    apiVersion: 2,
    devMode: false,
    data: {
      subscription: {
        id: "subs_novo",
        amount: 19700,
        currency: "BRL",
        method: "CARD",
        status: "ACTIVE",
        frequency: "MONTHLY",
        createdAt: "2026-10-14T12:00:00.000Z",
        updatedAt: "2026-10-14T12:00:05.000Z",
        canceledAt: null,
        cancelPolicy: null,
        cancelledDueTo: null,
      },
      customer: { id: "cust_def456", name: "Maria", email: "maria@exemplo.com", taxId: "12.***.***/0001-**" },
      payment: {
        id: "char_xyz789",
        externalId: "0b6f8e2a-1111-4c2d-9e3f-123456789abc",
        amount: 19700,
        paidAmount: 19700,
        status: "PAID",
        receiptUrl: "https://app.abacatepay.com/receipt/x",
        createdAt: "2026-10-14T12:00:00.000Z",
        updatedAt: "2026-10-14T12:00:05.000Z",
      },
      payerInformation: { method: "CARD", CARD: { number: "1234", brand: "VISA" } },
      checkout: {
        id: "bill_jskd3TMfScHZDJe5NSZjTmQ4",
        externalId: "0b6f8e2a-1111-4c2d-9e3f-123456789abc",
        items: [{ id: "prod_pro_mensal", quantity: 1 }],
        status: "PAID",
        metadata: {},
      },
      ...overrides,
    },
  }
}

const stored: StoredSubscription = {
  organizationId: "org-1",
  subscriptionId: "subs_atual",
  status: "active",
  plan: "starter",
  cycle: "monthly",
  amountCents: 9700,
  scheduledPlan: null,
  paymentFailures: 0,
  providerUpdatedAt: "2026-09-14T12:00:00.000Z",
  devMode: false,
}

const checkout: LinkedCheckout = {
  id: "0b6f8e2a-1111-4c2d-9e3f-123456789abc",
  organizationId: "org-1",
  plan: "pro",
  cycle: "monthly",
  checkoutId: "bill_jskd3TMfScHZDJe5NSZjTmQ4",
  devMode: false,
}

function event(body: object) {
  const parsed = parseWebhookEvent(JSON.stringify(body))
  if (!parsed) throw new Error("evento inválido")
  return parsed
}

function withSubscription(base: ReturnType<typeof completedBody>, type: string, subscription: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { ...base, event: type, data: { ...base.data, ...extra, subscription: { ...base.data.subscription, ...subscription } } }
}

describe("configuração da AbacatePay", () => {
  it("reconhece a chave de teste e a de produção", () => {
    expect(keyMode("abc_dev_123")).toBe("test")
    expect(keyMode("abc_prod_123")).toBe("live")
    expect(keyMode("outra")).toBe("unknown")
  })

  it("só liga a contratação com chave e segredo de 32+ caracteres", () => {
    expect(billingSettings({}).enabled).toBe(false)
    expect(billingSettings({ ABACATEPAY_API_KEY: "abc_dev_1", ABACATEPAY_WEBHOOK_SECRET: "curto" }).enabled).toBe(false)
    const settings = billingSettings({ ABACATEPAY_API_KEY: " abc_dev_1 ", ABACATEPAY_WEBHOOK_SECRET: SECRET })
    expect(settings).toMatchObject({ enabled: true, keyMode: "test", methods: ["CARD"], production: false })
  })

  it("formas de pagamento e e-mails de teste", () => {
    const settings = billingSettings({
      ABACATEPAY_SUBSCRIPTION_METHODS: "card, pix, boleto",
      ABACATEPAY_TEST_EMAILS: " Teste@Maanu.com.br ,outro@x.com",
      VERCEL_ENV: "production",
    })
    expect(settings.methods).toEqual(["CARD", "PIX"])
    expect(canUseTestPayments(settings, { email: "teste@maanu.com.br", isPlatformAdmin: false })).toBe(true)
    expect(canUseTestPayments(settings, { email: "cliente@loja.com", isPlatformAdmin: false })).toBe(false)
    expect(canUseTestPayments(settings, { email: "cliente@loja.com", isPlatformAdmin: true })).toBe(true)
    expect(canUseTestPayments(billingSettings({}), { email: "cliente@loja.com", isPlatformAdmin: false })).toBe(true)
  })
})

describe("produtos da AbacatePay × planos", () => {
  it("reconhece o plano pelo nome ou externalId", () => {
    expect(productPlan({ name: "Pro", externalId: null })).toBe("pro")
    expect(productPlan({ name: "Plano Escala", externalId: null })).toBe("escala")
    expect(productPlan({ name: "Assinatura", externalId: "maanu_starter_mensal" })).toBe("starter")
    expect(productPlan({ name: "Produto qualquer", externalId: null })).toBeNull()
    expect(productPlan({ name: "Pro e Escala", externalId: null })).toBeNull()
  })

  it("liga cada plano e ciclo ao produto ativo com o preço certo", () => {
    const catalog = matchCatalog([
      product({ id: "prod_starter", name: "Starter", price: 9700 }),
      product({ id: "prod_pro", name: "Pro", price: 19700 }),
      product({ id: "prod_pro_velho", name: "Pro", price: 19700, updatedAt: "2026-01-01T00:00:00Z" }),
      product({ id: "prod_escala", name: "Escala", price: 39900 }),
      product({ id: "prod_pro_anual", name: "Pro anual", price: 197000, cycle: "ANNUALLY" }),
      product({ id: "prod_arquivado", name: "Starter", price: 9700, status: "ARCHIVED" }),
      product({ id: "prod_avulso", name: "Starter", price: 9700, cycle: null }),
      product({ id: "prod_semanal", name: "Starter", price: 9700, cycle: "WEEKLY" }),
      product({ id: "prod_outro", name: "Consultoria", price: 50000 }),
    ])
    const find = (plan: string, cycle: string) => catalog.entries.find((entry) => entry.plan === plan && entry.cycle === cycle)
    expect(find("starter", "monthly")).toMatchObject({ status: "ok", product: { id: "prod_starter" } })
    expect(find("pro", "monthly")).toMatchObject({ status: "ok", product: { id: "prod_pro" }, duplicates: 1 })
    expect(find("escala", "monthly")).toMatchObject({ status: "price_mismatch", expectedCents: 39700 })
    // Só o mensal é vendido: produtos anuais (e semanais) ficam de fora.
    expect(catalog.entries).toHaveLength(3)
    expect(catalog.entries.every((entry) => entry.cycle === "monthly")).toBe(true)
    expect(catalog.ignored.map((item) => item.reason).sort()).toEqual(["archived", "no_cycle", "no_plan", "unsupported_cycle", "unsupported_cycle"])

    const availability = checkoutAvailability(catalog)
    expect(availability.pro).toEqual({ monthly: true })
    expect(availability.escala).toEqual({ monthly: false })
    expect(checkoutAvailability(null).starter).toEqual({ monthly: false })
  })

  it("plano pelo valor cobrado", () => {
    expect(planFromAmount(9700, "monthly")).toBe("starter")
    expect(planFromAmount(39700, "monthly")).toBe("escala")
    expect(planFromAmount(197000, "monthly")).toBeNull()
    expect(planFromAmount(9700, null)).toBeNull()
    expect(planFromAmount(null, "monthly")).toBeNull()
  })
})

describe("webhook: origem", () => {
  const raw = JSON.stringify(completedBody())

  it("formato antigo: segredo na URL + assinatura do corpo", () => {
    const url = `https://maanu.com.br/api/webhook/abacatepay?webhookSecret=${SECRET}`
    expect(verifyDelivery({ rawBody: raw, url, headers: headers({ "X-Webhook-Signature": signLegacy(raw) }), secret: SECRET })).toEqual({
      ok: true,
      format: "legacy",
      deliveryId: null,
    })
    expect(
      verifyDelivery({ rawBody: raw, url: "https://maanu.com.br/x?webhookSecret=errado", headers: headers({ "X-Webhook-Signature": signLegacy(raw) }), secret: SECRET })
    ).toMatchObject({ ok: false, reason: "bad_secret" })
    expect(verifyDelivery({ rawBody: raw, url, headers: headers({}), secret: SECRET })).toMatchObject({ reason: "missing_signature" })
    expect(
      verifyDelivery({ rawBody: `${raw} `, url, headers: headers({ "X-Webhook-Signature": signLegacy(raw) }), secret: SECRET })
    ).toMatchObject({ reason: "bad_signature" })
  })

  it("Standard Webhooks: assinatura com o segredo, id e horário", () => {
    const now = 1_760_000_000
    const timestamp = String(now - 10)
    const signature = `v1,${signStandard(raw, "msg_1", timestamp, SECRET)}`
    const base = { rawBody: raw, url: "https://maanu.com.br/api/webhook/abacatepay", secret: SECRET, nowSeconds: now }
    expect(
      verifyDelivery({ ...base, headers: headers({ "webhook-id": "msg_1", "webhook-timestamp": timestamp, "webhook-signature": `v1,outra ${signature}` }) })
    ).toEqual({ ok: true, format: "standard", deliveryId: "msg_1" })
    expect(
      verifyDelivery({ ...base, headers: headers({ "webhook-id": "msg_2", "webhook-timestamp": timestamp, "webhook-signature": signature }) })
    ).toMatchObject({ reason: "bad_signature" })
    expect(
      verifyDelivery({ ...base, nowSeconds: now + 600, headers: headers({ "webhook-id": "msg_1", "webhook-timestamp": timestamp, "webhook-signature": signature }) })
    ).toMatchObject({ reason: "stale" })
  })

  it("Standard Webhooks com segredo whsec_ (base64)", () => {
    const secret = `whsec_${Buffer.from("chave-binaria-de-teste-32-bytes!!").toString("base64")}`
    const timestamp = "1760000000"
    const signature = `v1,${signStandard(raw, "msg_9", timestamp, secret)}`
    expect(
      verifyDelivery({
        rawBody: raw,
        url: "https://maanu.com.br/api/webhook/abacatepay",
        headers: headers({ "webhook-id": "msg_9", "webhook-timestamp": timestamp, "webhook-signature": signature }),
        secret,
        nowSeconds: 1_760_000_000,
      }).ok
    ).toBe(true)
  })
})

describe("webhook: leitura do evento", () => {
  it("lê o exemplo da documentação", () => {
    const parsed = event(completedBody())
    expect(parsed).toMatchObject({
      deliveryId: "log_taQArRTApemxwcbw5EJeF3hS",
      type: "subscription.completed",
      devMode: false,
      subscription: { id: "subs_novo", amountCents: 19700, cycle: "monthly", method: "CARD", status: "ACTIVE" },
      checkout: { id: "bill_jskd3TMfScHZDJe5NSZjTmQ4", productIds: ["prod_pro_mensal"] },
      payment: { paidAt: "2026-10-14T12:00:05.000Z", receiptUrl: "https://app.abacatepay.com/receipt/x" },
      card: { brand: "VISA", last4: "1234" },
      customerId: "cust_def456",
    })
  })

  it("formato Standard: tipo em `type` e id do cabeçalho", () => {
    const { id: _id, event: _event, ...rest } = completedBody()
    void _id
    void _event
    const parsed = parseWebhookEvent(JSON.stringify({ ...rest, type: "subscription.renewed", timestamp: "2026-10-14T12:00:00Z" }), "msg_123")
    expect(parsed).toMatchObject({ deliveryId: "msg_123", type: "subscription.renewed" })
    expect(parseWebhookEvent("não é json")).toBeNull()
    expect(parseWebhookEvent(JSON.stringify({ data: {} }))).toBeNull()
    expect(parseWebhookEvent(JSON.stringify({ event: "x" }))?.deliveryId).toMatch(/^sha256:/)
  })

  it("troca de plano: pedido × aplicada; falha de cobrança", () => {
    const base = completedBody()
    expect(event(withSubscription(base, "subscription.plan_changed", {}, { changeSource: "API_CHANGE_PLAN", pendingUpdateId: "subu_1", newAmount: 39700 })).planChange).toEqual({
      requested: true,
      productId: null,
      newAmountCents: 39700,
    })
    expect(event(withSubscription(base, "subscription.plan_changed", {})).planChange?.requested).toBe(false)
    expect(event(withSubscription(base, "subscription.payment_failed", {}, { retryNumber: 2, installmentNumber: 3 })).failure).toEqual({
      retryNumber: 2,
      installmentNumber: 3,
    })
  })
})

describe("decisão de cada evento", () => {
  const now = new Date("2026-10-14T12:00:00Z")

  it("assinatura nova paga: libera o plano do checkout até daqui a um mês", () => {
    const decision = decideBillingEvent({ event: event(completedBody()), organizationId: "org-1", current: null, checkout, now })
    expect(decision).toMatchObject({
      kind: "activate",
      plan: "pro",
      cycle: "monthly",
      amountCents: 19700,
      isNew: true,
      replaces: null,
      periodEnd: "2026-11-14T12:00:05.000Z",
    })
  })

  it("assinatura nova substitui a anterior ativa (troca de ciclo ou outro cartão)", () => {
    const decision = decideBillingEvent({ event: event(completedBody()), organizationId: "org-1", current: stored, checkout, now })
    expect(decision).toMatchObject({ kind: "activate", isNew: true, replaces: "subs_atual" })
  })

  it("renovação da assinatura atual: plano pelo valor e troca agendada aplicada", () => {
    const base = completedBody()
    const renewed = event(withSubscription(base, "subscription.renewed", { id: "subs_atual", amount: 9700, updatedAt: "2026-10-14T12:00:05.000Z" }))
    expect(decideBillingEvent({ event: renewed, organizationId: "org-1", current: stored, checkout: null, now })).toMatchObject({
      kind: "activate",
      plan: "starter",
      isNew: false,
      replaces: null,
    })
    const scheduled = { ...stored, plan: "pro", amountCents: 19700, scheduledPlan: "starter" }
    expect(decideBillingEvent({ event: renewed, organizationId: "org-1", current: scheduled, checkout: null, now })).toMatchObject({
      kind: "activate",
      plan: "starter",
      scheduledPlan: null,
    })
  })

  it("ignora renovação de assinatura antiga, outro ambiente e evento mais velho", () => {
    const base = completedBody()
    const oldRenewal = event(withSubscription(base, "subscription.renewed", { id: "subs_antiga" }))
    expect(decideBillingEvent({ event: oldRenewal, organizationId: "org-1", current: stored, checkout, now }).kind).toBe("ignore")
    const test = event({ ...completedBody(), devMode: true })
    expect(decideBillingEvent({ event: test, organizationId: "org-1", current: null, checkout, now })).toMatchObject({ kind: "ignore" })
    const stale = event(withSubscription(base, "subscription.renewed", { id: "subs_atual", updatedAt: "2026-08-01T00:00:00Z" }))
    expect(decideBillingEvent({ event: stale, organizationId: "org-1", current: stored, checkout: null, now })).toMatchObject({
      kind: "ignore",
      reason: "evento mais antigo que o último aplicado",
    })
    expect(decideBillingEvent({ event: event(completedBody()), organizationId: null, current: null, checkout: null, now }).kind).toBe("ignore")
  })

  it("cobrança recusada só avisa; cancelamento mantém o acesso, disputa corta na hora", () => {
    const base = completedBody()
    const failed = event(withSubscription(base, "subscription.payment_failed", { id: "subs_atual" }, { retryNumber: 2 }))
    expect(decideBillingEvent({ event: failed, organizationId: "org-1", current: stored, checkout: null, now })).toEqual({
      kind: "payment_failed",
      organizationId: "org-1",
      failures: 2,
    })
    const cancelled = event(withSubscription(base, "subscription.cancelled", { id: "subs_atual", status: "CANCELLED", cancelledDueTo: "max_payment_retries_exceeded" }))
    expect(decideBillingEvent({ event: cancelled, organizationId: "org-1", current: stored, checkout: null, now })).toMatchObject({
      kind: "cancel",
      immediate: false,
    })
    const dispute = event(withSubscription(base, "subscription.cancelled", { id: "subs_atual", status: "CANCELLED", cancelledDueTo: "dispute_opened" }))
    expect(decideBillingEvent({ event: dispute, organizationId: "org-1", current: stored, checkout: null, now })).toMatchObject({ immediate: true })
    const oldCancel = event(withSubscription(base, "subscription.cancelled", { id: "subs_antiga", status: "CANCELLED" }))
    expect(decideBillingEvent({ event: oldCancel, organizationId: "org-1", current: stored, checkout: null, now }).kind).toBe("ignore")
  })

  it("troca de plano: pedido só registra; aplicada muda o plano pelo valor", () => {
    const base = completedBody()
    const requested = event(withSubscription(base, "subscription.plan_changed", { id: "subs_atual" }, { changeSource: "API_CHANGE_PLAN" }))
    expect(decideBillingEvent({ event: requested, organizationId: "org-1", current: stored, checkout: null, now }).kind).toBe("plan_requested")
    const applied = event(withSubscription(base, "subscription.plan_changed", { id: "subs_atual", amount: 39700 }))
    expect(decideBillingEvent({ event: applied, organizationId: "org-1", current: stored, checkout: null, now })).toMatchObject({
      kind: "plan_applied",
      plan: "escala",
    })
  })

  it("datas e valores", () => {
    expect(addOneMonth(new Date("2026-01-31T10:00:00Z")).toISOString()).toBe("2026-02-28T10:00:00.000Z")
    expect(addOneMonth(new Date("2026-12-15T10:00:00Z")).toISOString()).toBe("2027-01-15T10:00:00.000Z")
    expect(addOneMonth(new Date("2028-01-31T10:00:00Z")).toISOString()).toBe("2028-02-29T10:00:00.000Z")
    expect(monthlyPriceFromAmount(19700)).toBe(197)
    expect(isDisputeCancellation("dispute_opened")).toBe(true)
    expect(isDisputeCancellation("max_payment_retries_exceeded")).toBe(false)
  })
})

describe("o que acontece ao escolher um plano", () => {
  const active = { plan: "pro", status: "active" as const, paymentFailing: false, scheduledPlan: null }

  it("assinar, trocar, assinar de novo ou já é o atual", () => {
    expect(planIntent(null, "pro")).toBe("subscribe")
    expect(planIntent({ ...active, status: "cancelled" }, "pro")).toBe("subscribe")
    expect(planIntent(active, "pro")).toBe("current")
    expect(planIntent(active, "escala")).toBe("change_plan")
    expect(planIntent({ ...active, paymentFailing: true }, "pro")).toBe("replace")
  })

  it("subir × descer de plano", () => {
    expect(isUpgrade("starter", "pro")).toBe(true)
    expect(isUpgrade("escala", "pro")).toBe(false)
    expect(isUpgrade("admin", "pro")).toBe(false)
  })

  it("aviso de cobrança recusada", () => {
    expect(paymentNotice(null)).toBeNull()
    expect(paymentNotice({ status: "active", paymentFailedAt: null })).toBeNull()
    expect(paymentNotice({ status: "cancelled", paymentFailedAt: "2026-10-01T00:00:00Z" })).toBeNull()
    expect(paymentNotice({ status: "active", paymentFailedAt: "2026-10-01T00:00:00Z" })?.title).toMatch(/cobrar/)
  })
})