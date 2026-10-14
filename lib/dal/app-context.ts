import "server-only"

import { redirect } from "next/navigation"
import { after } from "next/server"
import { cache } from "react"

import {
  computeAccess,
  decideSectionAccess,
  type Access,
  type AppSection,
} from "@/lib/access/access"
import { featureAccess, resolvePlan, type PlanFeature, type PlanInfo } from "@/lib/plans/plans"
import { createServiceClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export type MemberRole = "owner" | "admin" | "member"

export type AppContext = {
  user: { id: string; email: string }
  profile: {
    fullName: string
    whatsapp: string | null
    onboardingCompletedAt: string | null
    tourCompletedAt: string | null
    isPlatformAdmin: boolean
  }
  organization: {
    id: string
    name: string
    /** Plano cadastrado (null = sem plano: teste grátis ou cortesia). Para regras, use `plan` (plano em vigor). */
    plan: string | null
    subscriptionStatus: string
    mlAccountsLimit: number
    createdAt: string
    trialEndsAt: string
    /** Limite de respostas automáticas definido pelo administrador (null = o do plano). */
    monthlyAnswersLimit: number | null
    /** Fim do período já pago (assinatura) ou null. */
    currentPeriodEnd: string | null
    billingCycle: string | null
    /**
     * Assinatura na AbacatePay (só para dono/administrador: o RLS esconde dos membros comuns).
     * `paymentFailedAt`: a última cobrança foi recusada e a AbacatePay está tentando de novo.
     */
    subscription: { status: string; paymentFailedAt: string | null } | null
  }
  /** Plano em vigor (cadastrado, teste grátis ou o Starter como base). */
  plan: PlanInfo
  role: MemberRole
  access: Access
  mlAccounts: { total: number; active: number }
  /** Funcionalidades liberadas pelo plano (o administrador da plataforma vê todas). */
  features: Record<PlanFeature, boolean>
  /**
   * Dados de cobrança (CPF/CNPJ + endereço). `required`: este usuário precisa preencher antes de usar o app
   * (dono/administrador; o admin da plataforma está dispensado). `completed`: a organização já tem o cadastro.
   */
  billing: { required: boolean; completed: boolean }
}

export const getCurrentUser = cache(async () => {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return data.user
})

export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  return user
}

async function loadAccount(userId: string) {
  const supabase = await createClient()
  return Promise.all([
    supabase
      .from("profiles")
      .select("full_name, whatsapp, onboarding_completed_at, tour_completed_at, is_platform_admin, last_seen_at")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("organization_members")
      .select(
        "role, organizations(id, name, plan, trial_ends_at, subscription_status, current_period_end, billing_exempt, billing_cycle, ml_accounts_limit, monthly_answers_limit, created_at, billing_profiles(organization_id), billing_subscriptions(status, payment_failed_at))"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])
}

/** "Último acesso" (usuários ativos no painel do administrador): grava no máximo a cada 15 min, depois da resposta. */
const LAST_SEEN_INTERVAL_MS = 15 * 60 * 1000

function touchLastSeen(userId: string, lastSeenAt: string | null) {
  if (lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < LAST_SEEN_INTERVAL_MS) return
  after(async () => {
    const { error } = await createServiceClient()
      .from("profiles")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", userId)
    if (error) console.error("[app] último acesso:", error.message)
  })
}

async function ensureAccountSetup(userId: string, fullName: string) {
  const admin = createServiceClient()
  const { error: profileError } = await admin
    .from("profiles")
    .upsert({ id: userId, full_name: fullName.slice(0, 120) }, { onConflict: "id", ignoreDuplicates: true })
  if (profileError) throw profileError

  const { data: membership, error: membershipError } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle()
  if (membershipError) throw membershipError
  if (membership) return

  const { data: organization, error: organizationError } = await admin
    .from("organizations")
    .insert({})
    .select("id")
    .single()
  if (organizationError) throw organizationError

  const { error: memberError } = await admin
    .from("organization_members")
    .insert({ organization_id: organization.id, user_id: userId, role: "owner" })
  if (memberError) throw memberError
}

export const getAppContext = cache(async (): Promise<AppContext> => {
  const user = await requireUser()

  let [profileResult, membershipResult] = await loadAccount(user.id)
  if (!profileResult.data || !membershipResult.data?.organizations) {
    await ensureAccountSetup(user.id, String(user.user_metadata?.full_name ?? ""))
    ;[profileResult, membershipResult] = await loadAccount(user.id)
  }

  const profile = profileResult.data
  const membership = membershipResult.data
  const organization = membership?.organizations
  if (!profile || !membership || !organization) {
    throw new Error("Não foi possível carregar a conta do usuário.")
  }

  const supabase = await createClient()
  const { data: mlAccounts, error: mlAccountsError } = await supabase
    .from("ml_accounts")
    .select("status")
    .eq("organization_id", organization.id)
  if (mlAccountsError) throw mlAccountsError

  const role = membership.role as MemberRole
  touchLastSeen(user.id, profile.last_seen_at)
  const plan = resolvePlan(organization)

  return {
    user: { id: user.id, email: user.email ?? "" },
    profile: {
      fullName: profile.full_name,
      whatsapp: profile.whatsapp,
      onboardingCompletedAt: profile.onboarding_completed_at,
      tourCompletedAt: profile.tour_completed_at,
      isPlatformAdmin: profile.is_platform_admin,
    },
    organization: {
      id: organization.id,
      name: organization.name,
      plan: organization.plan,
      subscriptionStatus: organization.subscription_status,
      mlAccountsLimit: organization.ml_accounts_limit,
      createdAt: organization.created_at,
      trialEndsAt: organization.trial_ends_at,
      monthlyAnswersLimit: organization.monthly_answers_limit,
      currentPeriodEnd: organization.current_period_end,
      billingCycle: organization.billing_cycle,
      subscription: organization.billing_subscriptions
        ? {
            status: organization.billing_subscriptions.status,
            paymentFailedAt: organization.billing_subscriptions.payment_failed_at,
          }
        : null,
    },
    plan,
    role,
    access: computeAccess(organization),
    mlAccounts: {
      total: mlAccounts.length,
      active: mlAccounts.filter((account) => account.status === "active").length,
    },
    features: featureAccess(plan, profile.is_platform_admin),
    billing: {
      required: canManageOrganization(role) && !profile.is_platform_admin,
      completed: Boolean(organization.billing_profiles),
    },
  }
})

/** Cadastro incompleto: falta o onboarding ou (para quem administra a loja) os dados de cobrança. */
export function needsOnboarding(context: AppContext) {
  return (
    !context.profile.onboardingCompletedAt || (context.billing.required && !context.billing.completed)
  )
}

export async function requireOnboardedContext() {
  const context = await getAppContext()
  if (needsOnboarding(context)) redirect("/onboarding")
  return context
}

export async function requireSection(section: AppSection) {
  const context = await requireOnboardedContext()
  const decision = decideSectionAccess(section, {
    access: context.access.state,
    hasActiveMlAccount: context.mlAccounts.active > 0,
    isPlatformAdmin: context.profile.isPlatformAdmin,
    features: context.features,
  })
  if (!decision.allowed) redirect(decision.redirectTo)
  return context
}

export function canManageOrganization(role: MemberRole) {
  return role === "owner" || role === "admin"
}
