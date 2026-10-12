import "server-only"

import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { cache } from "react"
import { z } from "zod"

import {
  ADMIN_MFA_WINDOW_MINUTES,
  adminSessionSecondsLeft,
  evaluateAdminSession,
  type AdminSessionClaims,
} from "@/lib/admin/session"
import type {
  AdminAiUsage,
  AdminAuditList,
  AdminFinance,
  AdminOperations,
  AdminOrgDetail,
  AdminOrgList,
  AdminOverview,
} from "@/lib/admin/types"
import { periodRange } from "@/lib/results/metrics"
import { createServiceClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

/**
 * Camada de dados do painel do administrador (só servidor).
 * Toda leitura passa por requireAdmin() e usa a sessão do próprio administrador: as funções admin_* do banco conferem
 * de novo (admin_assert), então nada aqui usa a service role para ler dados de clientes.
 */

export type AdminIdentity = {
  userId: string
  email: string
  name: string
  claims: AdminSessionClaims
}

async function loadIdentity(): Promise<AdminIdentity | null | "anonymous"> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (error || !claims?.sub) return "anonymous"
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, is_platform_admin")
    .eq("id", claims.sub)
    .maybeSingle()
  if (profileError) throw profileError
  if (!profile?.is_platform_admin) return null
  return {
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : "",
    name: profile.full_name,
    claims: { aal: claims.aal, amr: claims.amr },
  }
}

/** Usuário logado e administrador da plataforma (sem exigir o código). Quem não é admin recebe 404. */
export const getAdminIdentity = cache(async (): Promise<AdminIdentity> => {
  const identity = await loadIdentity()
  if (identity === "anonymous") redirect("/login?next=/admin")
  if (!identity) notFound()
  return identity
})

/** Administrador com a verificação em 2 etapas feita há até 12 horas. */
export const requireAdmin = cache(async (): Promise<AdminIdentity & { sessionSecondsLeft: number }> => {
  const identity = await getAdminIdentity()
  if (evaluateAdminSession(identity.claims) !== "ok") redirect("/admin/verificacao")
  return { ...identity, sessionSecondsLeft: adminSessionSecondsLeft(identity.claims) }
})

/** Administrador logado, sem exigir o código (só para a própria tela de verificação em 2 etapas). */
export async function adminIdentityWithoutMfa(): Promise<AdminIdentity | null> {
  const identity = await loadIdentity()
  return identity && identity !== "anonymous" ? identity : null
}

/** Para Server Actions e rotas: devolve null em vez de redirecionar quando a sessão de admin não vale. */
export async function adminActionIdentity(): Promise<AdminIdentity | null> {
  const identity = await loadIdentity()
  if (!identity || identity === "anonymous") return null
  return evaluateAdminSession(identity.claims) === "ok" ? identity : null
}

export const ADMIN_SESSION_EXPIRED =
  "Sua sessão de administrador expirou. Recarregue a página e digite o código do app autenticador de novo."

/** IP e navegador de quem fez a ação (vão para o histórico). */
export async function adminRequestContext() {
  const list = await headers()
  const ip = (list.get("x-forwarded-for")?.split(",")[0] ?? list.get("x-real-ip") ?? "").trim().slice(0, 100)
  return { ip, user_agent: (list.get("user-agent") ?? "").slice(0, 400) }
}

// ------------------------------------------------------------------------------------------- leituras

export async function getAdminOverview(): Promise<AdminOverview> {
  await requireAdmin()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("admin_overview")
  if (error) throw error
  return data as unknown as AdminOverview
}

export const ORG_PAGE_SIZE = 25

export async function listAdminOrganizations(params: {
  search: string
  status: string
  plan: string
  sort: string
  page: number
  pageSize?: number
}): Promise<AdminOrgList> {
  await requireAdmin()
  const pageSize = params.pageSize ?? ORG_PAGE_SIZE
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("admin_list_organizations", {
    p_search: params.search,
    p_status: params.status,
    p_plan: params.plan,
    p_sort: params.sort,
    p_limit: pageSize,
    p_offset: (params.page - 1) * pageSize,
  })
  if (error) throw error
  return data as unknown as AdminOrgList
}

export async function getAdminOrganization(id: string): Promise<AdminOrgDetail | null> {
  await requireAdmin()
  if (!z.string().uuid().safeParse(id).success) return null
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("admin_organization_detail", { p_organization_id: id })
  if (error) throw error
  return (data as unknown as AdminOrgDetail | null) ?? null
}

export async function getAdminAiUsage(days: number): Promise<AdminAiUsage & { from: Date; to: Date }> {
  await requireAdmin()
  const range = periodRange(days)
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("admin_ai_usage", {
    p_from: range.from.toISOString(),
    p_to: range.to.toISOString(),
  })
  if (error) throw error
  return { ...(data as unknown as AdminAiUsage), from: range.from, to: range.to }
}

export async function getAdminFinance(): Promise<AdminFinance> {
  await requireAdmin()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("admin_finance")
  if (error) throw error
  return data as unknown as AdminFinance
}

export async function getAdminOperations(): Promise<AdminOperations> {
  await requireAdmin()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("admin_operations")
  if (error) throw error
  return data as unknown as AdminOperations
}

export const AUDIT_PAGE_SIZE = 50

export async function listAdminAudit(params: {
  organizationId: string | null
  prefix: string
  page: number
}): Promise<AdminAuditList> {
  await requireAdmin()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("admin_list_audit", {
    ...(params.organizationId ? { p_organization_id: params.organizationId } : {}),
    p_action_prefix: params.prefix,
    p_limit: AUDIT_PAGE_SIZE,
    p_offset: (params.page - 1) * AUDIT_PAGE_SIZE,
  })
  if (error) throw error
  return data as unknown as AdminAuditList
}

// ------------------------------------------------------------------------------------------- acesso ao painel

/**
 * Eventos de acesso (código certo/errado, cadastro da verificação) acontecem antes da sessão virar aal2,
 * por isso são gravados pelo servidor (service role) e não por admin_log_event.
 */
export async function recordAdminAccessEvent(
  identity: Pick<AdminIdentity, "userId" | "email">,
  action: "admin.login" | "admin.mfa_enrolled" | "admin.mfa_failed",
  summary: string
) {
  const context = await adminRequestContext()
  const { error } = await createServiceClient().from("admin_audit_log").insert({
    actor_id: identity.userId,
    actor_email: identity.email || null,
    action,
    target_type: "user",
    target_id: identity.userId,
    summary,
    ip: context.ip || null,
    user_agent: context.user_agent || null,
  })
  if (error) console.error("[admin] histórico de acesso:", error.message)
}

export async function countRecentMfaFailures(userId: string): Promise<number> {
  const since = new Date(Date.now() - ADMIN_MFA_WINDOW_MINUTES * 60 * 1000).toISOString()
  const { count, error } = await createServiceClient()
    .from("admin_audit_log")
    .select("id", { count: "exact", head: true })
    .eq("actor_id", userId)
    .eq("action", "admin.mfa_failed")
    .gte("created_at", since)
  if (error) throw error
  return count ?? 0
}
