"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { getCatalog } from "@/lib/billing/abacatepay/catalog-store"
import { createWebhook, listWebhooks } from "@/lib/billing/abacatepay/client"
import { billingSettings } from "@/lib/billing/abacatepay/config"
import { SUBSCRIPTION_EVENTS } from "@/lib/billing/abacatepay/webhook"
import { cancelOrganizationSubscription } from "@/lib/billing/engine"
import { ADMIN_SESSION_EXPIRED, adminActionIdentity, adminRequestContext } from "@/lib/dal/admin"
import { webhookEndpoint } from "@/lib/dal/admin-billing"
import { createClient } from "@/lib/supabase/server"
import type { Json } from "@/lib/supabase/database.types"

/** Ações do painel do administrador → Cobrança (AbacatePay). Cada uma confere a sessão de administrador e registra no histórico. */

export type ActionResult = { ok: boolean; message: string }

async function audit(action: string, organizationId: string | null, summary: string, details: Record<string, unknown> = {}) {
  const supabase = await createClient()
  const { error } = await supabase.rpc("admin_log_event", {
    p_action: action,
    p_target_type: organizationId ? "organization" : "billing",
    p_target_id: organizationId ?? "abacatepay",
    p_organization_id: organizationId as string,
    p_summary: summary,
    p_details: details as Json,
    p_context: await adminRequestContext(),
  })
  if (error) console.error("[admin] histórico:", error.message)
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "Erro ao falar com a AbacatePay."
}

/** Cadastra na AbacatePay o webhook da maanu com o segredo ABACATEPAY_WEBHOOK_SECRET (que nunca sai do servidor). */
export async function registerAbacateWebhook(): Promise<ActionResult> {
  if (!(await adminActionIdentity())) return { ok: false, message: ADMIN_SESSION_EXPIRED }
  const settings = billingSettings()
  if (!settings.apiKey) return { ok: false, message: "Configure a ABACATEPAY_API_KEY na Vercel primeiro." }
  if (!settings.webhookSecret || !settings.webhookSecretValid) {
    return { ok: false, message: "Configure a ABACATEPAY_WEBHOOK_SECRET (mínimo 32 caracteres) na Vercel primeiro." }
  }
  const endpoint = webhookEndpoint()
  if (!endpoint.startsWith("https://")) return { ok: false, message: `O endereço precisa ser HTTPS (${endpoint}).` }

  try {
    const existing = await listWebhooks().catch(() => [])
    if (existing.some((webhook) => webhook.endpoint.split("?")[0] === endpoint)) {
      return { ok: false, message: "Já existe um webhook para este endereço na AbacatePay. Remova-o lá antes de cadastrar de novo." }
    }
    const webhook = await createWebhook({ name: "maanu - assinaturas", endpoint, secret: settings.webhookSecret, events: [...SUBSCRIPTION_EVENTS] })
    await audit("billing.webhook_created", null, "Webhook da AbacatePay cadastrado", { webhook_id: webhook.id, endpoint, dev_mode: webhook.devMode })
    revalidatePath("/admin/cobranca")
    return { ok: true, message: `Webhook cadastrado${webhook.devMode ? " (modo de teste)" : ""}.` }
  } catch (error) {
    return { ok: false, message: message(error) }
  }
}

/** Lê de novo os produtos da AbacatePay (depois de criar ou ajustar um produto lá). */
export async function refreshAbacateCatalog(): Promise<ActionResult> {
  if (!(await adminActionIdentity())) return { ok: false, message: ADMIN_SESSION_EXPIRED }
  const result = await getCatalog({ force: true })
  revalidatePath("/admin/cobranca")
  revalidatePath("/assinatura")
  if (result.error) return { ok: false, message: result.error }
  const ok = result.catalog?.entries.filter((entry) => entry.status === "ok").length ?? 0
  return { ok: true, message: `Produtos lidos: ${ok} de 6 planos prontos para venda.` }
}

/** Cancela a assinatura de um cliente na AbacatePay (pedido do cliente, reembolso combinado etc.). */
export async function adminCancelSubscription(organizationId: string): Promise<ActionResult> {
  if (!(await adminActionIdentity())) return { ok: false, message: ADMIN_SESSION_EXPIRED }
  if (!z.string().uuid().safeParse(organizationId).success) return { ok: false, message: "Registro não encontrado." }
  const result = await cancelOrganizationSubscription(organizationId, "cancelada pela equipe maanu")
  if (result.ok) {
    await audit("billing.subscription_cancelled", organizationId, "Assinatura cancelada na AbacatePay pela equipe")
    revalidatePath(`/admin/clientes/${organizationId}`)
    revalidatePath("/admin/cobranca")
  }
  return result
}