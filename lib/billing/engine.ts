import "server-only"

import { decideBillingEvent, monthlyPriceFromAmount, type BillingDecision, type LinkedCheckout, type StoredSubscription } from "@/lib/billing/abacatepay/decide"
import { catalogEntry, expectedPriceCents } from "@/lib/billing/abacatepay/catalog"
import { getCatalog } from "@/lib/billing/abacatepay/catalog-store"
import {
  AbacatePayError,
  cancelSubscription,
  changeSubscriptionPlan,
  createCustomer,
  createSubscriptionCheckout,
  getSubscription,
} from "@/lib/billing/abacatepay/client"
import { billingSettings, canUseTestPayments } from "@/lib/billing/abacatepay/config"
import type { BillingWebhookEvent } from "@/lib/billing/abacatepay/webhook"
import { isUpgrade, planIntent, type CurrentSubscription } from "@/lib/billing/subscription"
import { maskPostalCode } from "@/lib/billing/documents"
import { sellablePlan, type BillingCycle } from "@/lib/plans/plans"
import { createServiceClient } from "@/lib/supabase/admin"
import type { Json } from "@/lib/supabase/database.types"

/**
 * Cobrança pela AbacatePay (só servidor): criar a página de pagamento, trocar de plano, cancelar e aplicar os webhooks.
 * Estado guardado em billing_subscriptions / billing_checkouts / billing_events; o que vale para o app (plano, situação,
 * fim do período pago, mensalidade) fica em organizations, atualizado aqui. Regras puras em lib/billing/abacatepay/decide.ts.
 */

type Admin = ReturnType<typeof createServiceClient>

const SUBSCRIPTION_COLUMNS =
  "organization_id, subscription_id, customer_id, checkout_id, status, plan, cycle, amount_cents, method, card_brand, card_last4, scheduled_plan, scheduled_at, last_payment_at, last_receipt_url, payment_failed_at, payment_failures, cancelled_at, cancel_reason, provider_updated_at, dev_mode"

/** Tentativas de cobrança antes de a AbacatePay cancelar a assinatura (a cada 2 dias: ~8 dias para regularizar). */
const RETRY_POLICY = { maxRetry: 4, retryEvery: 2 }
/** Página de pagamento reaproveitada se o cliente clicar de novo em pouco tempo. */
const REUSE_CHECKOUT_MS = 30 * 60 * 1000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type SubscriptionRow = {
  organization_id: string
  subscription_id: string
  customer_id: string | null
  checkout_id: string | null
  status: string
  plan: string
  cycle: string
  amount_cents: number
  method: string | null
  card_brand: string | null
  card_last4: string | null
  scheduled_plan: string | null
  scheduled_at: string | null
  last_payment_at: string | null
  last_receipt_url: string | null
  payment_failed_at: string | null
  payment_failures: number
  cancelled_at: string | null
  cancel_reason: string | null
  provider_updated_at: string | null
  dev_mode: boolean
}

/** Só existe o mensal (desde 2026-10-16). */
const CYCLE: BillingCycle = "monthly"

function toStored(row: SubscriptionRow): StoredSubscription {
  return {
    organizationId: row.organization_id,
    subscriptionId: row.subscription_id,
    status: row.status === "cancelled" ? "cancelled" : "active",
    plan: row.plan,
    cycle: CYCLE,
    amountCents: row.amount_cents,
    scheduledPlan: row.scheduled_plan,
    paymentFailures: row.payment_failures,
    providerUpdatedAt: row.provider_updated_at,
    devMode: row.dev_mode,
  }
}

export function currentSubscriptionOf(row: SubscriptionRow | null): CurrentSubscription | null {
  if (!row) return null
  return {
    plan: row.plan,
    status: row.status === "cancelled" ? "cancelled" : "active",
    paymentFailing: row.status === "active" && Boolean(row.payment_failed_at),
    scheduledPlan: row.scheduled_plan,
  }
}

async function loadSubscriptionByOrganization(admin: Admin, organizationId: string): Promise<SubscriptionRow | null> {
  const { data, error } = await admin
    .from("billing_subscriptions")
    .select(SUBSCRIPTION_COLUMNS)
    .eq("organization_id", organizationId)
    .maybeSingle()
  if (error) throw error
  return data as SubscriptionRow | null
}

/** Assinatura guardada da organização (leitura do servidor; quem chama já conferiu a permissão). */
export async function getStoredSubscription(organizationId: string): Promise<SubscriptionRow | null> {
  return loadSubscriptionByOrganization(createServiceClient(), organizationId)
}

// ---------------------------------------------------------------------------------------------- ações do cliente

export type BillingActionResult = { ok: true; message: string; url?: string } | { ok: false; message: string }

export type BillingActor = {
  organizationId: string
  organizationPlan: string | null
  userId: string
  email: string
  whatsapp: string | null
  isPlatformAdmin: boolean
}

function fail(message: string): BillingActionResult {
  return { ok: false, message }
}

function providerMessage(error: unknown, fallback: string): string {
  if (error instanceof AbacatePayError) {
    console.error("[cobrança] AbacatePay:", error.status, error.message)
    return error.kind === "network" ? "Não foi possível falar com o sistema de pagamento agora. Tente de novo em instantes." : fallback
  }
  console.error("[cobrança]", error instanceof Error ? error.message : error)
  return fallback
}

/** Cria (ou reaproveita) a página de pagamento da AbacatePay para o plano e a forma de pagamento escolhidos. */
export async function startCheckout(actor: BillingActor, planId: string): Promise<BillingActionResult> {
  const cycle = CYCLE
  const settings = billingSettings()
  if (!settings.enabled) return fail("A contratação pelo app ainda não está disponível.")
  if (actor.organizationPlan === "admin") {
    return fail("A organização interna da maanu não assina planos. Para testar, use outra conta.")
  }
  const plan = sellablePlan(planId)
  if (!plan) return fail("Plano inválido.")
  if (settings.keyMode !== "live" && !canUseTestPayments(settings, actor)) {
    return fail("Os pagamentos estão em modo de teste. Volte daqui a pouco.")
  }

  const admin = createServiceClient()
  const current = await loadSubscriptionByOrganization(admin, actor.organizationId)
  const intent = planIntent(currentSubscriptionOf(current), plan.id)
  if (intent === "current") return fail("Você já assina este plano.")
  if (intent === "change_plan") return fail("Para trocar de plano, use o botão de troca do plano escolhido.")

  const { catalog, error: catalogError } = await getCatalog()
  const entry = catalogEntry(catalog, plan.id, cycle)
  if (!entry?.product || entry.status !== "ok") {
    if (catalogError) console.error("[cobrança] catálogo:", catalogError)
    return fail("Este plano não está disponível para contratação agora. Fale com o suporte.")
  }
  const expected = expectedPriceCents(plan)

  // Clicou de novo: reaproveita a página criada há pouco (mesmo plano, ciclo e ambiente).
  const devModeExpected = settings.keyMode === "test"
  const { data: recent } = await admin
    .from("billing_checkouts")
    .select("url, dev_mode, product_id, amount_cents")
    .eq("organization_id", actor.organizationId)
    .eq("plan", plan.id)
    .eq("cycle", cycle)
    .eq("status", "pending")
    .gte("created_at", new Date(Date.now() - REUSE_CHECKOUT_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (
    recent?.url &&
    settings.keyMode !== "unknown" &&
    recent.dev_mode === devModeExpected &&
    recent.product_id === entry.product.id &&
    recent.amount_cents === expected
  ) {
    return { ok: true, message: "Abrindo a página de pagamento…", url: recent.url }
  }

  const { data: profile } = await admin
    .from("billing_profiles")
    .select("document, legal_name, postal_code")
    .eq("organization_id", actor.organizationId)
    .maybeSingle()
  if (!profile) return fail("Complete os dados da conta (CPF/CNPJ e endereço) em Configurações antes de assinar.")

  const { data: row, error: insertError } = await admin
    .from("billing_checkouts")
    .insert({
      organization_id: actor.organizationId,
      plan: plan.id,
      cycle,
      product_id: entry.product.id,
      amount_cents: expected,
      created_by: actor.userId,
    })
    .select("id")
    .single()
  if (insertError || !row) {
    console.error("[cobrança] checkout:", insertError?.message)
    return fail("Não foi possível iniciar o pagamento agora. Tente de novo.")
  }

  const markFailed = async (status: "failed" | "cancelled", error: string) => {
    await admin.from("billing_checkouts").update({ status, error: error.slice(0, 500) }).eq("id", row.id)
  }

  // Cliente na AbacatePay (único por CPF/CNPJ: se já existe, ela devolve o mesmo). Se recusar (ex.: CNPJ com letras),
  // a página de pagamento pede os dados ao cliente.
  let customerId: string | undefined
  try {
    const phone = actor.whatsapp?.replace(/\D/g, "")
    const customer = await createCustomer({
      email: actor.email,
      name: profile.legal_name,
      taxId: profile.document,
      cellphone: phone && phone.length >= 10 ? `+55${phone}` : undefined,
      zipCode: maskPostalCode(profile.postal_code),
    })
    customerId = customer.id
  } catch (error) {
    console.error("[cobrança] cliente na AbacatePay (segue sem):", error instanceof Error ? error.message : error)
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://maanu.com.br").replace(/\/$/, "")
  let checkout
  try {
    checkout = await createSubscriptionCheckout({
      productId: entry.product.id,
      customerId,
      externalId: row.id,
      returnUrl: `${siteUrl}/assinatura`,
      completionUrl: `${siteUrl}/assinatura?pagamento=concluido`,
      methods: settings.methods,
      metadata: { maanu_checkout: row.id, organization_id: actor.organizationId, plan: plan.id, cycle },
      retryPolicy: RETRY_POLICY,
    })
  } catch (error) {
    await markFailed("failed", error instanceof Error ? error.message : "erro")
    return fail(providerMessage(error, "O sistema de pagamento recusou o pedido. Tente de novo ou fale com o suporte."))
  }

  if (checkout.amountCents !== null && checkout.amountCents !== expected) {
    await markFailed("cancelled", `valor do checkout (${checkout.amountCents}) diferente do plano (${expected})`)
    return fail("O valor do plano está diferente no sistema de pagamento. Avisamos a equipe; tente mais tarde.")
  }
  if (checkout.devMode && !canUseTestPayments(settings, actor)) {
    await markFailed("cancelled", "checkout de teste para uma conta que não pode testar")
    return fail("Os pagamentos estão em modo de teste. Volte daqui a pouco.")
  }

  const { error: updateError } = await admin
    .from("billing_checkouts")
    .update({ status: "pending", checkout_id: checkout.id, url: checkout.url, customer_id: customerId ?? null, dev_mode: checkout.devMode })
    .eq("id", row.id)
  if (updateError) {
    console.error("[cobrança] checkout criado mas não gravado:", updateError.message)
    return fail("Não foi possível iniciar o pagamento agora. Tente de novo.")
  }
  return { ok: true, message: "Abrindo a página de pagamento…", url: checkout.url }
}

/** Troca de plano na mesma assinatura. Subir libera na hora; descer vale na próxima cobrança. */
export async function requestPlanChange(actor: BillingActor, planId: string): Promise<BillingActionResult> {
  if (!billingSettings().enabled) return fail("A troca pelo app ainda não está disponível.")
  const plan = sellablePlan(planId)
  if (!plan) return fail("Plano inválido.")
  const admin = createServiceClient()
  const current = await loadSubscriptionByOrganization(admin, actor.organizationId)
  const state = currentSubscriptionOf(current)
  if (!current || !state) return fail("Você ainda não tem uma assinatura ativa.")
  if (planIntent(state, plan.id) !== "change_plan") return fail("Esta troca não pode ser feita assim.")

  const { catalog } = await getCatalog()
  const entry = catalogEntry(catalog, plan.id, CYCLE)
  if (!entry?.product || entry.status !== "ok") return fail("Este plano não está disponível para troca agora. Fale com o suporte.")

  try {
    await changeSubscriptionPlan(current.subscription_id, entry.product.id)
  } catch (error) {
    return fail(providerMessage(error, "O sistema de pagamento não aceitou a troca. Fale com o suporte."))
  }

  if (isUpgrade(current.plan, plan.id)) {
    const { error } = await admin
      .from("billing_subscriptions")
      .update({ plan: plan.id, scheduled_plan: null, scheduled_at: null })
      .eq("organization_id", actor.organizationId)
    if (error) throw error
    const { error: orgError } = await admin.from("organizations").update({ plan: plan.id }).eq("id", actor.organizationId)
    if (orgError) throw orgError
    return { ok: true, message: `Pronto! O plano ${plan.name} já está liberado. O novo valor vale a partir da próxima cobrança.` }
  }

  const { error } = await admin
    .from("billing_subscriptions")
    .update({ scheduled_plan: plan.id, scheduled_at: new Date().toISOString() })
    .eq("organization_id", actor.organizationId)
  if (error) throw error
  return { ok: true, message: `Combinado. Seu plano muda para o ${plan.name} na próxima cobrança.` }
}

/** Cancela a assinatura na AbacatePay. O acesso continua até o fim do período já pago. */
export async function cancelOrganizationSubscription(organizationId: string, reason = "cancelada pelo cliente"): Promise<BillingActionResult> {
  if (!billingSettings().apiKey) return fail("A cobrança pelo app ainda não está disponível.")
  const admin = createServiceClient()
  const current = await loadSubscriptionByOrganization(admin, organizationId)
  if (!current || current.status !== "active") return fail("Não há assinatura ativa para cancelar.")
  try {
    await cancelSubscription(current.subscription_id)
  } catch (error) {
    return fail(providerMessage(error, "O sistema de pagamento não aceitou o cancelamento. Fale com o suporte."))
  }
  await applyDecision(admin, { kind: "cancel", organizationId, reason, immediate: false }, null, null)
  return { ok: true, message: "Assinatura cancelada. Você continua com acesso até o fim do período já pago." }
}

// ---------------------------------------------------------------------------------------------- webhooks

type CheckoutRow = {
  id: string
  organization_id: string
  plan: string
  cycle: string
  checkout_id: string | null
  dev_mode: boolean | null
  status: string
  subscription_id: string | null
}

const CHECKOUT_COLUMNS = "id, organization_id, plan, cycle, checkout_id, dev_mode, status, subscription_id"

async function findCheckout(admin: Admin, event: BillingWebhookEvent): Promise<CheckoutRow | null> {
  const lookups: [string, string][] = []
  const checkoutId = event.checkout?.id
  if (checkoutId) lookups.push(["checkout_id", checkoutId])
  for (const candidate of [
    event.checkout?.externalId,
    event.payment?.externalId,
    typeof event.checkout?.metadata?.maanu_checkout === "string" ? event.checkout.metadata.maanu_checkout : null,
  ]) {
    if (candidate && UUID.test(candidate)) lookups.push(["id", candidate])
  }
  if (event.subscription) lookups.push(["subscription_id", event.subscription.id])

  for (const [column, value] of lookups) {
    const { data, error } = await admin.from("billing_checkouts").select(CHECKOUT_COLUMNS).eq(column, value).limit(1).maybeSingle()
    if (error) throw error
    if (data) return data as CheckoutRow
  }

  // Última tentativa: a AbacatePay diz de qual checkout veio a assinatura.
  if (event.subscription && billingSettings().apiKey) {
    try {
      const remote = await getSubscription(event.subscription.id)
      if (remote.checkoutId) {
        const { data } = await admin.from("billing_checkouts").select(CHECKOUT_COLUMNS).eq("checkout_id", remote.checkoutId).maybeSingle()
        if (data) return data as CheckoutRow
      }
    } catch (error) {
      console.error("[cobrança] buscar assinatura na AbacatePay:", error instanceof Error ? error.message : error)
    }
  }
  return null
}

function toLinked(row: CheckoutRow | null): LinkedCheckout | null {
  if (!row) return null
  return {
    id: row.id,
    organizationId: row.organization_id,
    plan: row.plan,
    cycle: CYCLE,
    checkoutId: row.checkout_id,
    devMode: row.dev_mode,
  }
}

export type WebhookOutcome = { status: "processed" | "ignored" | "duplicate"; note: string }

/**
 * Processa uma entrega do webhook (já conferida). Idempotente: a mesma entrega (mesmo id) é processada uma vez; uma
 * entrega que falhou no meio é processada de novo (todas as gravações são de estado absoluto). Erro → lança (a rota
 * responde 500 e a AbacatePay tenta de novo).
 */
export async function processWebhookEvent(event: BillingWebhookEvent): Promise<WebhookOutcome> {
  const admin = createServiceClient()
  const { data: inserted, error: insertError } = await admin
    .from("billing_events")
    .upsert(
      {
        id: event.deliveryId,
        event: event.type,
        dev_mode: event.devMode,
        subscription_id: event.subscription?.id ?? null,
        payload: event.payload as Json,
      },
      { onConflict: "id", ignoreDuplicates: true }
    )
    .select("id")
  if (insertError) throw insertError
  if (!inserted?.length) {
    const { data: existing, error } = await admin.from("billing_events").select("status, attempts").eq("id", event.deliveryId).single()
    if (error) throw error
    if (existing.status === "processed" || existing.status === "ignored") return { status: "duplicate", note: "já processado" }
    await admin.from("billing_events").update({ attempts: existing.attempts + 1 }).eq("id", event.deliveryId)
  }

  const finish = async (status: "processed" | "ignored" | "failed", note: string, organizationId: string | null) => {
    const { error } = await admin
      .from("billing_events")
      .update({ status, note: note.slice(0, 500), organization_id: organizationId, processed_at: new Date().toISOString() })
      .eq("id", event.deliveryId)
    if (error) console.error("[cobrança] registrar evento:", error.message)
  }

  try {
    let organizationId: string | null = null
    let current: SubscriptionRow | null = null
    let checkout: CheckoutRow | null = null
    if (event.subscription && event.type.startsWith("subscription.")) {
      const { data: bySubscription, error } = await admin
        .from("billing_subscriptions")
        .select(SUBSCRIPTION_COLUMNS)
        .eq("subscription_id", event.subscription.id)
        .maybeSingle()
      if (error) throw error
      checkout = await findCheckout(admin, event)
      organizationId = (bySubscription as SubscriptionRow | null)?.organization_id ?? checkout?.organization_id ?? null
      current = organizationId
        ? ((bySubscription as SubscriptionRow | null) ?? (await loadSubscriptionByOrganization(admin, organizationId)))
        : null
    }

    let decision = decideBillingEvent({
      event,
      organizationId,
      current: current ? toStored(current) : null,
      checkout: toLinked(checkout),
    })

    // Assinatura nova: o checkout já tinha gerado outra assinatura que não é mais a atual → evento repetido/antigo.
    if (decision.kind === "activate" && decision.isNew && checkout?.status === "paid" && checkout.subscription_id !== decision.subscriptionId) {
      decision = { kind: "ignore", reason: "este pagamento já gerou uma assinatura anterior" }
    }

    // Assinatura nova: confirma na AbacatePay que ela existe e está ativa (um webhook forjado não libera plano).
    if (decision.kind === "activate" && decision.isNew) {
      const remote = await getSubscription(decision.subscriptionId)
      if (remote.status !== "ACTIVE" || remote.devMode !== event.devMode) {
        decision = { kind: "ignore", reason: `a AbacatePay informa a assinatura como ${remote.status || "desconhecida"}` }
      }
    }

    if (decision.kind === "ignore") {
      await finish("ignored", decision.reason, organizationId)
      return { status: "ignored", note: decision.reason }
    }
    const note = await applyDecision(admin, decision, event, checkout)
    await finish("processed", note, organizationId)
    return { status: "processed", note }
  } catch (error) {
    await finish("failed", error instanceof Error ? error.message : "erro", null)
    throw error
  }
}

async function applyDecision(
  admin: Admin,
  decision: Exclude<BillingDecision, { kind: "ignore" }>,
  event: BillingWebhookEvent | null,
  checkout: CheckoutRow | null
): Promise<string> {
  const now = new Date().toISOString()
  const updatedAt = event?.subscription?.updatedAt ?? null

  switch (decision.kind) {
    case "activate": {
      const previous = await loadSubscriptionByOrganization(admin, decision.organizationId)
      const same = previous?.subscription_id === decision.subscriptionId ? previous : null
      const { error } = await admin.from("billing_subscriptions").upsert(
        {
          organization_id: decision.organizationId,
          provider: "abacatepay",
          subscription_id: decision.subscriptionId,
          customer_id: event?.customerId || same?.customer_id || null,
          checkout_id: same?.checkout_id ?? checkout?.checkout_id ?? event?.checkout?.id ?? null,
          status: "active",
          plan: decision.plan,
          cycle: decision.cycle,
          amount_cents: decision.amountCents,
          method: event?.subscription?.method ?? same?.method ?? null,
          card_brand: event?.card?.brand ?? same?.card_brand ?? null,
          card_last4: event?.card?.last4 ?? same?.card_last4 ?? null,
          scheduled_plan: decision.scheduledPlan,
          scheduled_at: decision.scheduledPlan ? (same?.scheduled_at ?? now) : null,
          last_payment_at: decision.paidAt ?? now,
          last_receipt_url: event?.payment?.receiptUrl ?? same?.last_receipt_url ?? null,
          payment_failed_at: null,
          payment_failures: 0,
          cancelled_at: null,
          cancel_reason: null,
          provider_updated_at: updatedAt ?? same?.provider_updated_at ?? null,
          dev_mode: event?.devMode ?? same?.dev_mode ?? false,
        },
        { onConflict: "organization_id" }
      )
      if (error) throw error

      const { error: orgError } = await admin
        .from("organizations")
        .update({
          plan: decision.plan,
          subscription_status: "active",
          billing_cycle: decision.cycle,
          current_period_end: decision.periodEnd,
          monthly_price: monthlyPriceFromAmount(decision.amountCents),
        })
        .eq("id", decision.organizationId)
      if (orgError) throw orgError

      if (checkout && decision.isNew) {
        await admin
          .from("billing_checkouts")
          .update({ status: "paid", subscription_id: decision.subscriptionId, paid_at: decision.paidAt ?? now })
          .eq("id", checkout.id)
      }

      let note = `${decision.isNew ? "assinatura ativada" : "renovada"}: ${decision.plan} (${decision.cycle}) até ${decision.periodEnd.slice(0, 10)}`
      if (decision.replaces) {
        try {
          await cancelSubscription(decision.replaces)
          note += `; assinatura anterior ${decision.replaces} cancelada`
        } catch (error) {
          const message = error instanceof Error ? error.message : "erro"
          console.error(`[cobrança] cancelar assinatura anterior ${decision.replaces}:`, message)
          note += `; ATENÇÃO: não foi possível cancelar a assinatura anterior ${decision.replaces} (${message}) — cancele no painel da AbacatePay`
        }
      }
      return note
    }
    case "payment_failed": {
      const { error } = await admin
        .from("billing_subscriptions")
        .update({ payment_failed_at: now, payment_failures: decision.failures, ...(updatedAt ? { provider_updated_at: updatedAt } : {}) })
        .eq("organization_id", decision.organizationId)
      if (error) throw error
      return `cobrança recusada (tentativa ${decision.failures})`
    }
    case "cancel": {
      const { error } = await admin
        .from("billing_subscriptions")
        .update({
          status: "cancelled",
          cancelled_at: event?.subscription?.canceledAt ?? now,
          cancel_reason: decision.reason?.slice(0, 200) ?? null,
          scheduled_plan: null,
          scheduled_at: null,
          ...(updatedAt ? { provider_updated_at: updatedAt } : {}),
        })
        .eq("organization_id", decision.organizationId)
      if (error) throw error
      const { error: orgError } = await admin
        .from("organizations")
        .update({ subscription_status: "canceled", ...(decision.immediate ? { current_period_end: now } : {}) })
        .eq("id", decision.organizationId)
      if (orgError) throw orgError
      return `assinatura cancelada${decision.reason ? ` (${decision.reason})` : ""}${decision.immediate ? "; acesso encerrado na hora" : ""}`
    }
    case "plan_applied": {
      const { error } = await admin
        .from("billing_subscriptions")
        .update({
          plan: decision.plan,
          amount_cents: decision.amountCents,
          scheduled_plan: null,
          scheduled_at: null,
          ...(updatedAt ? { provider_updated_at: updatedAt } : {}),
        })
        .eq("organization_id", decision.organizationId)
      if (error) throw error
      const { error: orgError } = await admin
        .from("organizations")
        .update({ plan: decision.plan, monthly_price: monthlyPriceFromAmount(decision.amountCents) })
        .eq("id", decision.organizationId)
      if (orgError) throw orgError
      return `troca de plano aplicada: ${decision.plan}`
    }
    case "plan_requested":
      return "pedido de troca de plano registrado (vale na próxima cobrança)"
  }
}
