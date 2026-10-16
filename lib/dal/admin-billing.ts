import "server-only"

import { getCatalog, type CatalogResult } from "@/lib/billing/abacatepay/catalog-store"
import { getStore, listWebhooks, type ProviderWebhook } from "@/lib/billing/abacatepay/client"
import { billingSettings, type BillingSettings } from "@/lib/billing/abacatepay/config"
import { requireAdmin } from "@/lib/dal/admin"
import { webhookBaseUrl } from "@/lib/site/host"
import { createClient } from "@/lib/supabase/server"

/** Painel do administrador → Cobrança. Dados de clientes pelas funções admin_* (admin_assert no banco). */

export type AdminBillingSubscription = {
  organization_id: string
  organization_name: string
  subscription_id: string
  customer_id: string | null
  status: string
  plan: string
  cycle: string
  amount_cents: number
  method: string | null
  card_brand: string | null
  card_last4: string | null
  scheduled_plan: string | null
  last_payment_at: string | null
  payment_failed_at: string | null
  payment_failures: number
  cancelled_at: string | null
  cancel_reason: string | null
  dev_mode: boolean
  updated_at: string
  current_period_end: string | null
}

export type AdminBillingEvent = {
  id: string
  event: string
  status: string
  note: string | null
  dev_mode: boolean
  attempts?: number
  received_at: string
  processed_at?: string | null
  organization_id?: string | null
  organization_name?: string | null
  subscription_id: string | null
}

export type AdminBillingCheckout = {
  id: string
  organization_id?: string
  organization_name?: string
  plan: string
  cycle: string
  amount_cents: number
  status: string
  checkout_id: string | null
  subscription_id: string | null
  dev_mode: boolean | null
  error: string | null
  created_at: string
  paid_at: string | null
}

export type AdminBillingOverview = {
  totals: { active: number; cancelled: number; payment_failed: number; scheduled: number; test: number; mrr_cents: number }
  subscriptions: AdminBillingSubscription[]
  checkouts: AdminBillingCheckout[]
  events: AdminBillingEvent[]
}

export type ProviderStatus = {
  settings: Omit<BillingSettings, "apiKey" | "webhookSecret"> & { apiKeyConfigured: boolean }
  store: { name: string | null; error: string | null }
  webhooks: { list: ProviderWebhook[]; error: string | null }
  catalog: CatalogResult
  endpoint: string
}

/** Endereço do webhook na AbacatePay: fica no domínio principal mesmo com o app em app.maanu.com.br (webhookBaseUrl). */
export function webhookEndpoint() {
  return `${webhookBaseUrl()}/api/webhook/abacatepay`
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Erro ao falar com a AbacatePay."
}

export async function getAdminBillingOverview(): Promise<AdminBillingOverview> {
  await requireAdmin()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("admin_billing_overview")
  if (error) throw error
  return data as unknown as AdminBillingOverview
}

/** Situação da integração na AbacatePay (chave, loja, produtos e webhooks). Nunca devolve a chave nem o segredo. */
export async function getProviderStatus(options: { force?: boolean } = {}): Promise<ProviderStatus> {
  await requireAdmin()
  const settings = billingSettings()
  const { apiKey, webhookSecret: _secret, ...rest } = settings
  void _secret
  const safe = { ...rest, apiKeyConfigured: Boolean(apiKey) }
  const endpoint = webhookEndpoint()
  if (!apiKey) {
    return {
      settings: safe,
      store: { name: null, error: null },
      webhooks: { list: [], error: null },
      catalog: { catalog: null, error: null, fetchedAt: null },
      endpoint,
    }
  }
  const [store, webhooks, catalog] = await Promise.all([
    getStore().then(
      (value) => ({ name: value.name, error: null }),
      (error: unknown) => ({ name: null, error: errorText(error) })
    ),
    listWebhooks().then(
      (list) => ({ list, error: null }),
      (error: unknown) => ({ list: [] as ProviderWebhook[], error: errorText(error) })
    ),
    getCatalog({ force: options.force }),
  ])
  return { settings: safe, store, webhooks, catalog, endpoint }
}

export type AdminOrganizationBilling = {
  subscription: (AdminBillingSubscription & { checkout_id: string | null; scheduled_at: string | null; last_receipt_url: string | null }) | null
  checkouts: AdminBillingCheckout[]
  events: AdminBillingEvent[]
}

export async function getAdminOrganizationBilling(organizationId: string): Promise<AdminOrganizationBilling> {
  await requireAdmin()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("admin_organization_billing", { p_organization_id: organizationId })
  if (error) throw error
  return data as unknown as AdminOrganizationBilling
}