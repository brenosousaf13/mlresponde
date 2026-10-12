/**
 * Planos e o que cada um libera (puro, testado).
 * O banco tem um espelho desta regra para o RLS: `public.plan_includes_after_sale` (migração pos_venda).
 * Ao criar um plano novo ou mudar o que ele libera, mude nos dois lugares.
 */

export type PlanFeature = "pos_venda"

export type PlanInfo = { id: string; name: string; features: readonly PlanFeature[] }

export const PLANS: Record<string, PlanInfo> = {
  essencial: { id: "essencial", name: "Essencial", features: ["pos_venda"] },
  // Organização interna de demonstração/administração da plataforma: tudo liberado.
  admin: { id: "admin", name: "Administração", features: ["pos_venda"] },
}

/** Plano que libera cada funcionalidade exclusiva (para os avisos de "disponível no plano X"). */
export const FEATURE_PLAN: Record<PlanFeature, string> = {
  pos_venda: "essencial",
}

export const FEATURE_LABELS: Record<PlanFeature, string> = {
  pos_venda: "Pós-venda com IA",
}

export function planInfo(plan: string | null | undefined): PlanInfo | null {
  if (!plan) return null
  return PLANS[plan.trim().toLowerCase()] ?? null
}

export function planIncludes(plan: string | null | undefined, feature: PlanFeature): boolean {
  return planInfo(plan)?.features.includes(feature) ?? false
}

/** Funcionalidades liberadas para quem está logado (o administrador da plataforma vê tudo). */
export function featureAccess(plan: string | null | undefined, isPlatformAdmin = false): Record<PlanFeature, boolean> {
  return { pos_venda: isPlatformAdmin || planIncludes(plan, "pos_venda") }
}

/** Nome do plano para exibir (planos ainda não cadastrados aparecem com a primeira letra maiúscula). */
export function planName(plan: string | null | undefined): string | null {
  const info = planInfo(plan)
  if (info) return info.name
  const text = plan?.trim()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : null
}

export function requiredPlanName(feature: PlanFeature): string {
  return PLANS[FEATURE_PLAN[feature]]?.name ?? FEATURE_PLAN[feature]
}
