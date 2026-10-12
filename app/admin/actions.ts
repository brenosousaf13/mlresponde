"use server"

import type { PostgrestError } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import {
  TRIAL_EXTENSIONS,
  extendTrialEnd,
  parseFinanceSettingsForm,
  parseOrganizationForm,
  parseProfileForm,
} from "@/lib/admin/schemas"
import { ADMIN_SESSION_EXPIRED, adminActionIdentity, adminRequestContext } from "@/lib/dal/admin"
import { authCallbackUrl } from "@/lib/http/site-url"
import { createServiceClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { Json } from "@/lib/supabase/database.types"
import type { FormState } from "@/lib/validation/forms"

/**
 * Ações do painel do administrador. Cada uma confere a sessão de administrador (com o código de 2 etapas recente),
 * valida a entrada e grava no histórico. As alterações de dados vão pelas funções admin_* do banco (que conferem de
 * novo e gravam o histórico na mesma transação); as do Supabase Auth (e-mail, bloqueio, link de senha) usam a API de
 * administração no servidor e registram com admin_log_event.
 */

export type ActionResult = { ok: boolean; message: string }

const uuid = z.string().uuid()
const NOT_FOUND = "Registro não encontrado."
const GENERIC = "Não foi possível salvar agora. Tente de novo."

function dbMessage(error: PostgrestError | null): string {
  if (!error) return GENERIC
  if (error.message.includes("ADMIN_REQUIRED")) return ADMIN_SESSION_EXPIRED
  if (error.message.includes("NOT_FOUND")) return NOT_FOUND
  if (error.code === "23514" || error.code === "22P02" || error.code === "22003") return "Algum valor está fora do permitido."
  console.error("[admin] banco:", error.message)
  return GENERIC
}

function refreshOrganization(organizationId: string | null) {
  revalidatePath("/admin", "layout")
  if (organizationId) revalidatePath(`/admin/clientes/${organizationId}`)
}

async function organizationOfUser(userId: string): Promise<string | null> {
  const { data } = await createServiceClient()
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1)
    .maybeSingle()
  return data?.organization_id ?? null
}

async function logEvent(input: {
  action: string
  targetType: string
  targetId: string
  organizationId: string | null
  summary: string
  details?: Record<string, unknown>
}) {
  const supabase = await createClient()
  const { error } = await supabase.rpc("admin_log_event", {
    p_action: input.action,
    p_target_type: input.targetType,
    p_target_id: input.targetId,
    // Os tipos gerados marcam o parâmetro como obrigatório; nulo (ação sem loja) é aceito pela função.
    p_organization_id: input.organizationId as string,
    p_summary: input.summary,
    p_details: (input.details ?? {}) as Json,
    p_context: await adminRequestContext(),
  })
  if (error) console.error("[admin] histórico:", error.message)
}

// ------------------------------------------------------------------------------------------- clientes

export async function updateOrganization(organizationId: string, _state: FormState, formData: FormData): Promise<FormState> {
  if (!(await adminActionIdentity())) return { message: ADMIN_SESSION_EXPIRED }
  if (!uuid.safeParse(organizationId).success) return { message: NOT_FOUND }

  const parsed = parseOrganizationForm(formData)
  if (!parsed.success) return { message: "Confira os campos destacados.", fieldErrors: parsed.fieldErrors }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("admin_update_organization", {
    p_organization_id: organizationId,
    p_changes: parsed.data,
    p_context: await adminRequestContext(),
  })
  if (error) return { message: dbMessage(error) }
  refreshOrganization(organizationId)
  const changed = Object.keys((data as Record<string, unknown>) ?? {}).length
  return { ok: true, message: changed ? "Alterações salvas e registradas no histórico." : "Nada mudou." }
}

export async function extendTrial(organizationId: string, days: number): Promise<ActionResult> {
  if (!(await adminActionIdentity())) return { ok: false, message: ADMIN_SESSION_EXPIRED }
  if (!uuid.safeParse(organizationId).success) return { ok: false, message: NOT_FOUND }
  if (!TRIAL_EXTENSIONS.includes(days as (typeof TRIAL_EXTENSIONS)[number])) return { ok: false, message: "Prazo inválido." }

  const { data: organization } = await createServiceClient()
    .from("organizations")
    .select("trial_ends_at, subscription_status")
    .eq("id", organizationId)
    .maybeSingle()
  if (!organization) return { ok: false, message: NOT_FOUND }

  const supabase = await createClient()
  const { error } = await supabase.rpc("admin_update_organization", {
    p_organization_id: organizationId,
    p_changes: {
      trial_ends_at: extendTrialEnd(organization.trial_ends_at, days),
      // Teste estendido volta a valer mesmo se a assinatura estava cancelada/atrasada sem pagamento.
      ...(organization.subscription_status === "active" ? {} : { subscription_status: "trialing" }),
    },
    p_context: { ...(await adminRequestContext()), summary: `Teste estendido em ${days} dias` },
  })
  if (error) return { ok: false, message: dbMessage(error) }
  refreshOrganization(organizationId)
  return { ok: true, message: `Teste estendido em ${days} dias.` }
}

export async function saveOrganizationNotes(organizationId: string, _state: FormState, formData: FormData): Promise<FormState> {
  if (!(await adminActionIdentity())) return { message: ADMIN_SESSION_EXPIRED }
  if (!uuid.safeParse(organizationId).success) return { message: NOT_FOUND }
  const notes = String(formData.get("notes") ?? "").slice(0, 5000)

  const supabase = await createClient()
  const { error } = await supabase.rpc("admin_set_organization_notes", {
    p_organization_id: organizationId,
    p_notes: notes,
    p_context: await adminRequestContext(),
  })
  if (error) return { message: dbMessage(error), values: { notes } }
  refreshOrganization(organizationId)
  return { ok: true, message: "Notas salvas.", values: { notes } }
}

export async function pauseMlAccount(accountId: string, scope: "answers" | "after_sale" | "all"): Promise<ActionResult> {
  if (!(await adminActionIdentity())) return { ok: false, message: ADMIN_SESSION_EXPIRED }
  if (!uuid.safeParse(accountId).success || !["answers", "after_sale", "all"].includes(scope)) {
    return { ok: false, message: NOT_FOUND }
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc("admin_pause_ml_account", {
    p_ml_account_id: accountId,
    p_scope: scope,
    p_context: await adminRequestContext(),
  })
  if (error) return { ok: false, message: dbMessage(error) }
  revalidatePath("/admin", "layout")
  return { ok: true, message: "IA pausada nesta conta. Para religar, o cliente liga de novo no app." }
}

// ------------------------------------------------------------------------------------------- usuários

async function loadTargetUser(userId: string) {
  if (!uuid.safeParse(userId).success) return null
  const admin = createServiceClient()
  const [{ data: user }, { data: profile }] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from("profiles").select("is_platform_admin").eq("id", userId).maybeSingle(),
  ])
  if (!user?.user) return null
  return { user: user.user, isPlatformAdmin: Boolean(profile?.is_platform_admin) }
}

const PLATFORM_ADMIN_LOCKED = "Administradores da plataforma só podem ser alterados direto no banco de dados."

export async function updateMember(userId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const identity = await adminActionIdentity()
  if (!identity) return { message: ADMIN_SESSION_EXPIRED }
  const target = await loadTargetUser(userId)
  if (!target) return { message: NOT_FOUND }

  const parsed = parseProfileForm(formData)
  if (!parsed.success) return { message: "Confira os campos destacados.", fieldErrors: parsed.fieldErrors }
  const organizationId = await organizationOfUser(userId)

  const supabase = await createClient()
  const { error } = await supabase.rpc("admin_update_profile", {
    p_user_id: userId,
    p_changes: { full_name: parsed.data.full_name, whatsapp: parsed.data.whatsapp },
    p_context: await adminRequestContext(),
  })
  if (error) return { message: dbMessage(error) }

  const currentEmail = (target.user.email ?? "").toLowerCase()
  if (parsed.data.email !== currentEmail) {
    if (target.isPlatformAdmin) return { message: PLATFORM_ADMIN_LOCKED }
    const { error: emailError } = await createServiceClient().auth.admin.updateUserById(userId, {
      email: parsed.data.email,
      email_confirm: true,
    })
    if (emailError) {
      const taken = /already|registered|exists/i.test(emailError.message)
      return {
        message: taken ? "Já existe outra conta com esse e-mail." : "Não foi possível trocar o e-mail.",
        fieldErrors: { email: [taken ? "E-mail em uso." : "Não foi possível trocar."] },
      }
    }
    await logEvent({
      action: "user.email",
      targetType: "user",
      targetId: userId,
      organizationId,
      summary: "E-mail de acesso trocado",
      details: { before: { email: currentEmail }, after: { email: parsed.data.email } },
    })
  }

  refreshOrganization(organizationId)
  return { ok: true, message: "Usuário atualizado." }
}

export async function confirmUserEmail(userId: string): Promise<ActionResult> {
  if (!(await adminActionIdentity())) return { ok: false, message: ADMIN_SESSION_EXPIRED }
  const target = await loadTargetUser(userId)
  if (!target) return { ok: false, message: NOT_FOUND }
  if (target.user.email_confirmed_at) return { ok: true, message: "O e-mail já estava confirmado." }

  const { error } = await createServiceClient().auth.admin.updateUserById(userId, { email_confirm: true })
  if (error) return { ok: false, message: "Não foi possível confirmar o e-mail." }
  const organizationId = await organizationOfUser(userId)
  await logEvent({
    action: "user.confirm_email",
    targetType: "user",
    targetId: userId,
    organizationId,
    summary: `E-mail ${target.user.email} confirmado manualmente`,
  })
  refreshOrganization(organizationId)
  return { ok: true, message: "E-mail confirmado. O cliente já pode entrar." }
}

export type RecoveryLinkResult = { ok: true; link: string; email: string } | { ok: false; message: string }

/**
 * Link de uso único (1 hora) para o cliente criar uma senha nova, para mandar pelo WhatsApp quando o e-mail não chega.
 * Quem abre o link entra na conta: fica registrado no histórico.
 */
export async function createPasswordRecoveryLink(userId: string): Promise<RecoveryLinkResult> {
  if (!(await adminActionIdentity())) return { ok: false, message: ADMIN_SESSION_EXPIRED }
  const target = await loadTargetUser(userId)
  if (!target?.user.email) return { ok: false, message: NOT_FOUND }
  if (target.isPlatformAdmin) return { ok: false, message: PLATFORM_ADMIN_LOCKED }

  const { data, error } = await createServiceClient().auth.admin.generateLink({ type: "recovery", email: target.user.email })
  const hashed = data?.properties?.hashed_token
  if (error || !hashed) return { ok: false, message: "Não foi possível gerar o link agora." }

  const base = await authCallbackUrl("/redefinir-senha")
  const link = `${base}&token_hash=${encodeURIComponent(hashed)}&type=recovery`
  const organizationId = await organizationOfUser(userId)
  await logEvent({
    action: "user.password_reset",
    targetType: "user",
    targetId: userId,
    organizationId,
    summary: `Link de redefinição de senha gerado para ${target.user.email}`,
  })
  revalidatePath("/admin", "layout")
  return { ok: true, link, email: target.user.email }
}

export async function setUserBlocked(userId: string, blocked: boolean): Promise<ActionResult> {
  const identity = await adminActionIdentity()
  if (!identity) return { ok: false, message: ADMIN_SESSION_EXPIRED }
  if (userId === identity.userId) return { ok: false, message: "Você não pode bloquear o próprio acesso." }
  const target = await loadTargetUser(userId)
  if (!target) return { ok: false, message: NOT_FOUND }
  if (target.isPlatformAdmin) return { ok: false, message: PLATFORM_ADMIN_LOCKED }

  // "876000h" ≈ 100 anos: o Supabase Auth recusa novas entradas e a renovação da sessão.
  const { error } = await createServiceClient().auth.admin.updateUserById(userId, {
    ban_duration: blocked ? "876000h" : "none",
  })
  if (error) return { ok: false, message: "Não foi possível alterar o acesso." }
  const organizationId = await organizationOfUser(userId)
  await logEvent({
    action: blocked ? "user.ban" : "user.unban",
    targetType: "user",
    targetId: userId,
    organizationId,
    summary: blocked ? `Acesso de ${target.user.email} bloqueado` : `Acesso de ${target.user.email} desbloqueado`,
  })
  refreshOrganization(organizationId)
  return {
    ok: true,
    message: blocked
      ? "Acesso bloqueado. A sessão aberta expira em até 1 hora e não renova."
      : "Acesso desbloqueado. O cliente já pode entrar de novo.",
  }
}

// ------------------------------------------------------------------------------------------- plataforma

export async function setPlatformAiPaused(paused: boolean, reason: string): Promise<ActionResult> {
  if (!(await adminActionIdentity())) return { ok: false, message: ADMIN_SESSION_EXPIRED }
  const supabase = await createClient()
  const { error } = await supabase.rpc("admin_update_platform_settings", {
    p_changes: { ai_paused: paused, ...(paused ? { ai_paused_reason: reason.trim().slice(0, 300) } : {}) },
    p_context: await adminRequestContext(),
  })
  if (error) return { ok: false, message: dbMessage(error) }
  revalidatePath("/admin", "layout")
  revalidatePath("/", "layout")
  return {
    ok: true,
    message: paused
      ? "IA pausada em toda a plataforma. As perguntas novas vão para os vendedores."
      : "IA retomada. As próximas perguntas voltam a ser respondidas automaticamente.",
  }
}

export async function updateFinanceSettings(_state: FormState, formData: FormData): Promise<FormState> {
  if (!(await adminActionIdentity())) return { message: ADMIN_SESSION_EXPIRED }
  const parsed = parseFinanceSettingsForm(formData)
  if (!parsed.success) return { message: "Confira os campos destacados.", fieldErrors: parsed.fieldErrors }
  const supabase = await createClient()
  const { error } = await supabase.rpc("admin_update_platform_settings", {
    p_changes: parsed.data,
    p_context: await adminRequestContext(),
  })
  if (error) return { message: dbMessage(error) }
  revalidatePath("/admin", "layout")
  return { ok: true, message: "Configurações salvas." }
}
