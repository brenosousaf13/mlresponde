import "server-only"

import { checkoutAvailability, type CheckoutAvailability } from "@/lib/billing/abacatepay/catalog"
import { getCatalog } from "@/lib/billing/abacatepay/catalog-store"
import { billingSettings, canUseTestPayments } from "@/lib/billing/abacatepay/config"
import type { CurrentSubscription } from "@/lib/billing/subscription"
import { canManageOrganization, type AppContext } from "@/lib/dal/app-context"
import type { BillingCycle } from "@/lib/plans/plans"
import { createClient } from "@/lib/supabase/server"

/** Tudo o que a tela Assinatura precisa da cobrança (leituras com a sessão: o RLS só libera para dono/administrador). */
export type SubscriptionPageState = {
  /** Os botões de assinar/trocar funcionam (chave, segredo e catálogo ok, e este usuário pode contratar). */
  checkoutEnabled: boolean
  /** Por que os botões estão desligados para este usuário (null = "contratação em breve" ou ligados). */
  blockedReason: string | null
  availability: CheckoutAvailability | null
  current: CurrentSubscription | null
  details: {
    amountCents: number
    method: string | null
    cardBrand: string | null
    cardLast4: string | null
    lastPaymentAt: string | null
    lastReceiptUrl: string | null
    paymentFailedAt: string | null
    paymentFailures: number
    cancelledAt: string | null
    cancelReason: string | null
    scheduledPlan: string | null
    devMode: boolean
  } | null
  /** Último pagamento iniciado pelo app (para a volta da página de pagamento). */
  lastCheckout: { status: string; plan: string; createdAt: string } | null
  testMode: boolean
}

export async function getSubscriptionPageState(context: AppContext): Promise<SubscriptionPageState> {
  const settings = billingSettings()
  const canManage = canManageOrganization(context.role)
  const supabase = await createClient()

  const [subscriptionResult, checkoutResult, catalogResult] = await Promise.all([
    canManage
      ? supabase
          .from("billing_subscriptions")
          .select(
            "status, plan, cycle, amount_cents, method, card_brand, card_last4, scheduled_plan, last_payment_at, last_receipt_url, payment_failed_at, payment_failures, cancelled_at, cancel_reason, dev_mode"
          )
          .eq("organization_id", context.organization.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    canManage
      ? supabase
          .from("billing_checkouts")
          .select("status, plan, created_at")
          .eq("organization_id", context.organization.id)
          .in("status", ["pending", "paid"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    settings.enabled ? getCatalog() : Promise.resolve({ catalog: null, error: null, fetchedAt: null }),
  ])
  if (subscriptionResult.error) throw subscriptionResult.error
  if (checkoutResult.error) throw checkoutResult.error

  const row = subscriptionResult.data
  const testMode = settings.keyMode !== "live"
  const testAllowed = canUseTestPayments(settings, { email: context.user.email, isPlatformAdmin: context.profile.isPlatformAdmin })

  let blockedReason: string | null = null
  if (!canManage) blockedReason = "Só o dono ou um administrador da loja pode assinar ou trocar de plano."
  else if (context.organization.plan === "admin") blockedReason = "A organização interna da maanu não assina planos."

  const checkoutEnabled =
    settings.enabled && Boolean(catalogResult.catalog) && (!testMode || testAllowed) && blockedReason === null

  return {
    checkoutEnabled,
    blockedReason: settings.enabled && (!testMode || testAllowed) ? blockedReason : null,
    availability: catalogResult.catalog ? checkoutAvailability(catalogResult.catalog) : null,
    current: row
      ? {
          plan: row.plan,
          cycle: (row.cycle === "annual" ? "annual" : "monthly") as BillingCycle,
          status: row.status === "cancelled" ? "cancelled" : "active",
          paymentFailing: row.status === "active" && Boolean(row.payment_failed_at),
          scheduledPlan: row.scheduled_plan,
        }
      : null,
    details: row
      ? {
          amountCents: row.amount_cents,
          method: row.method,
          cardBrand: row.card_brand,
          cardLast4: row.card_last4,
          lastPaymentAt: row.last_payment_at,
          lastReceiptUrl: row.last_receipt_url,
          paymentFailedAt: row.payment_failed_at,
          paymentFailures: row.payment_failures,
          cancelledAt: row.cancelled_at,
          cancelReason: row.cancel_reason,
          scheduledPlan: row.scheduled_plan,
          devMode: row.dev_mode,
        }
      : null,
    lastCheckout: checkoutResult.data
      ? { status: checkoutResult.data.status, plan: checkoutResult.data.plan, createdAt: checkoutResult.data.created_at }
      : null,
    testMode: settings.enabled && testMode && testAllowed,
  }
}