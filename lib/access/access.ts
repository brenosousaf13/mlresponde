import type { PlanFeature } from "@/lib/plans/plans"

export type AccessState = "trial" | "active" | "blocked"

export type OrganizationBilling = {
  subscription_status: string
  trial_ends_at: string
  current_period_end: string | null
  billing_exempt: boolean
}

export type Access = {
  state: AccessState
  trialEndsAt: string
  trialDaysLeft: number
}

const DAY_MS = 24 * 60 * 60 * 1000

export function computeAccess(
  organization: OrganizationBilling,
  now: Date = new Date()
): Access {
  const msLeft = new Date(organization.trial_ends_at).getTime() - now.getTime()
  const trialDaysLeft = msLeft > 0 ? Math.ceil(msLeft / DAY_MS) : 0
  const base = { trialEndsAt: organization.trial_ends_at, trialDaysLeft }

  if (organization.billing_exempt || organization.subscription_status === "active") {
    return { state: "active", ...base }
  }
  // Assinatura cancelada (ou com pagamento pendente) continua valendo até o fim do período já pago.
  if (
    (organization.subscription_status === "canceled" || organization.subscription_status === "past_due") &&
    organization.current_period_end &&
    new Date(organization.current_period_end).getTime() > now.getTime()
  ) {
    return { state: "active", ...base }
  }
  if (organization.subscription_status === "trialing" && msLeft > 0) {
    return { state: "trial", ...base }
  }
  return { state: "blocked", ...base }
}

export type AppSection =
  | "painel"
  | "perguntas"
  | "pos_venda"
  | "melhorias"
  | "resultados"
  | "assistente"
  | "contas"
  | "assinatura"
  | "configuracoes"

export type SectionDecision =
  | { allowed: true }
  | { allowed: false; redirectTo: string; reason: "blocked" | "no_ml_account" | "plan" }

const ALWAYS_ALLOWED: readonly AppSection[] = ["assinatura", "configuracoes"]

/** Seções exclusivas de um plano (o resto vale para todos os planos). */
export const SECTION_FEATURES: Partial<Record<AppSection, PlanFeature>> = {
  pos_venda: "pos_venda",
  melhorias: "melhorias_anuncio",
}

export function decideSectionAccess(
  section: AppSection,
  context: {
    access: AccessState
    hasActiveMlAccount: boolean
    isPlatformAdmin?: boolean
    /** Funcionalidades que o plano da organização libera. */
    features?: Partial<Record<PlanFeature, boolean>>
  }
): SectionDecision {
  if (context.isPlatformAdmin || ALWAYS_ALLOWED.includes(section)) {
    return { allowed: true }
  }
  if (context.access === "blocked") {
    return { allowed: false, redirectTo: "/assinatura", reason: "blocked" }
  }
  const feature = SECTION_FEATURES[section]
  if (feature && !context.features?.[feature]) {
    return { allowed: false, redirectTo: `/assinatura?recurso=${feature}`, reason: "plan" }
  }
  if (section === "contas" || context.hasActiveMlAccount) {
    return { allowed: true }
  }
  return { allowed: false, redirectTo: "/contas", reason: "no_ml_account" }
}
