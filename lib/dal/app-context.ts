import "server-only"

import { redirect } from "next/navigation"
import { cache } from "react"

import {
  computeAccess,
  decideSectionAccess,
  type Access,
  type AppSection,
} from "@/lib/access/access"
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
    plan: string | null
    subscriptionStatus: string
    mlAccountsLimit: number
  }
  role: MemberRole
  access: Access
  mlAccounts: { total: number; active: number }
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
      .select("full_name, whatsapp, onboarding_completed_at, tour_completed_at, is_platform_admin")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("organization_members")
      .select(
        "role, organizations(id, name, plan, trial_ends_at, subscription_status, current_period_end, billing_exempt, ml_accounts_limit)"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])
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
    },
    role: membership.role as MemberRole,
    access: computeAccess(organization),
    mlAccounts: {
      total: mlAccounts.length,
      active: mlAccounts.filter((account) => account.status === "active").length,
    },
  }
})

export async function requireOnboardedContext() {
  const context = await getAppContext()
  if (!context.profile.onboardingCompletedAt) redirect("/onboarding")
  return context
}

export async function requireSection(section: AppSection) {
  const context = await requireOnboardedContext()
  const decision = decideSectionAccess(section, {
    access: context.access.state,
    hasActiveMlAccount: context.mlAccounts.active > 0,
  })
  if (!decision.allowed) redirect(decision.redirectTo)
  return context
}

export function canManageOrganization(role: MemberRole) {
  return role === "owner" || role === "admin"
}
