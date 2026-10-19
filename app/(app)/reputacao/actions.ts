"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { canManageOrganization, requireSection } from "@/lib/dal/app-context"
import { syncAccountNow } from "@/lib/reputation/engine"
import { createServiceClient } from "@/lib/supabase/admin"

export type ReputationActionResult = { ok: boolean; message: string }

const uuid = z.string().uuid()
/** "Atualizar agora" no máximo a cada 2 minutos por conta (o cron já confere sozinho). */
const REFRESH_INTERVAL_MS = 2 * 60 * 1000

/** Lê de novo o termômetro, os despachos e as reclamações de uma conta (qualquer membro). */
export async function refreshReputation(accountId: string): Promise<ReputationActionResult> {
  const context = await requireSection("reputacao")
  if (!uuid.safeParse(accountId).success) return { ok: false, message: "Conta não encontrada." }
  const admin = createServiceClient()
  const { data: account, error } = await admin
    .from("ml_accounts")
    .select("id, status, token_status")
    .eq("id", accountId)
    .eq("organization_id", context.organization.id)
    .maybeSingle()
  if (error) {
    console.error("[reputação] atualizar agora:", error.message)
    return { ok: false, message: "Não foi possível atualizar agora. Tente novamente." }
  }
  if (!account) return { ok: false, message: "Conta não encontrada." }
  if (account.status !== "active" || account.token_status !== "valid") {
    return { ok: false, message: "Esta conta precisa estar ativa e conectada ao Mercado Livre." }
  }
  const { data: sync } = await admin.from("reputation_sync").select("last_reputation_at").eq("ml_account_id", accountId).maybeSingle()
  if (sync?.last_reputation_at && Date.now() - Date.parse(sync.last_reputation_at) < REFRESH_INTERVAL_MS) {
    return { ok: false, message: "Acabou de atualizar. Dá para pedir de novo em 2 minutos." }
  }
  try {
    const status = await syncAccountNow(accountId)
    if (status === "busy") return { ok: false, message: "A atualização desta conta já está em andamento. Aguarde um instante." }
    if (status === "unavailable") return { ok: false, message: "Esta conta não pode ser atualizada agora." }
  } catch (refreshError) {
    console.error("[reputação] atualizar agora:", refreshError instanceof Error ? refreshError.message : refreshError)
    return { ok: false, message: "Não foi possível falar com o Mercado Livre agora. Tente de novo em instantes." }
  }
  revalidatePath("/reputacao")
  return { ok: true, message: "Reputação atualizada." }
}

/** Liga ou desliga os e-mails dos alertas urgentes (só dono ou administrador). */
export async function setEmailAlerts(enabled: boolean): Promise<ReputationActionResult> {
  const context = await requireSection("reputacao")
  if (!canManageOrganization(context.role)) {
    return { ok: false, message: "Só o dono ou um administrador da loja pode mudar os alertas por e-mail." }
  }
  const { error } = await createServiceClient()
    .from("reputation_settings")
    .upsert(
      { organization_id: context.organization.id, email_alerts: enabled === true, updated_by: context.user.id },
      { onConflict: "organization_id" }
    )
  if (error) {
    console.error("[reputação] alertas por e-mail:", error.message)
    return { ok: false, message: "Não foi possível salvar agora. Tente novamente." }
  }
  revalidatePath("/reputacao")
  return { ok: true, message: enabled ? "Alertas por e-mail ligados." : "Alertas por e-mail desligados." }
}
