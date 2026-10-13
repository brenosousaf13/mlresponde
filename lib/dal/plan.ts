import "server-only"

import { cache } from "react"

import type { AppContext } from "@/lib/dal/app-context"
import { answersLimit, resolvePlan, type OrganizationPlanFields, type PlanInfo } from "@/lib/plans/plans"
import { quotaStatus, usagePeriod, type Quota, type UsagePeriod } from "@/lib/plans/usage"
import type { createServiceClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

type AnyClient = ReturnType<typeof createServiceClient> | Awaited<ReturnType<typeof createClient>>

/** Respostas automáticas da IA da organização no período (contagem no banco: organization_ai_answers). */
export async function countAiAnswers(client: AnyClient, organizationId: string, period: UsagePeriod): Promise<number> {
  const { data, error } = await client.rpc("organization_ai_answers", {
    p_organization_id: organizationId,
    p_from: period.from.toISOString(),
    p_to: period.to.toISOString(),
  })
  if (error) throw error
  return Number(data ?? 0)
}

export type QuotaOrganization = OrganizationPlanFields & {
  created_at: string
  monthly_answers_limit: number | null
}

/**
 * Situação do limite de respostas automáticas (usado pelos motores antes de chamar a IA).
 * Sem limite (plano interno ou definido assim pelo administrador) não consulta o banco.
 */
export async function answersQuotaFor(
  client: AnyClient,
  organizationId: string,
  organization: QuotaOrganization,
  now: Date = new Date()
): Promise<Quota> {
  const plan = resolvePlan(organization, now)
  const limit = answersLimit(plan, organization.monthly_answers_limit)
  if (limit === null) return quotaStatus(0, null)
  const period = usagePeriod(plan, { createdAt: organization.created_at, trialEndsAt: organization.trial_ends_at }, now)
  return quotaStatus(await countAiAnswers(client, organizationId, period), limit)
}

export type PlanUsage = {
  plan: PlanInfo
  period: UsagePeriod
  answers: Quota
  /** null = o plano não inclui Melhorias de anúncio. */
  improvements: Quota | null
  accounts: { active: number; limit: number }
}

/** Uso do plano da organização de quem está logado (uma vez por requisição). */
export const getPlanUsage = cache(async (context: AppContext): Promise<PlanUsage> => {
  const supabase = await createClient()
  const plan = context.plan
  const period = usagePeriod(plan, {
    createdAt: context.organization.createdAt,
    trialEndsAt: context.organization.trialEndsAt,
  })
  const answersCap = answersLimit(plan, context.organization.monthlyAnswersLimit)
  const improvementsCap = context.profile.isPlatformAdmin ? null : plan.limits.listingImprovementsPerMonth
  const includesImprovements = context.features.melhorias_anuncio

  const [answersUsed, improvementsUsed] = await Promise.all([
    countAiAnswers(supabase, context.organization.id, period),
    includesImprovements ? countListingImprovements(supabase, context.organization.id, period) : Promise.resolve(0),
  ])

  return {
    plan,
    period,
    answers: quotaStatus(answersUsed, answersCap),
    improvements: includesImprovements ? quotaStatus(improvementsUsed, improvementsCap) : null,
    accounts: { active: context.mlAccounts.active, limit: context.organization.mlAccountsLimit },
  }
})

/** Análises de Melhorias de anúncio que contam na cota (prontas + em andamento há menos de 10 minutos). */
export async function countListingImprovements(client: AnyClient, organizationId: string, period: UsagePeriod) {
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { count, error } = await client
    .from("listing_improvements")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .gte("created_at", period.from.toISOString())
    .lt("created_at", period.to.toISOString())
    .or(`status.eq.ready,created_at.gte."${staleBefore}"`)
  if (error) throw error
  return count ?? 0
}
