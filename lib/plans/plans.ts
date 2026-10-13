/**
 * Planos da maanu e o que cada um libera (puro, testado em tests/unit/plans.test.ts).
 * Decididos pelo Breno na Sessão 20 (2026-10-13): Starter, Pro e Escala.
 *
 * O banco tem espelhos destas regras (migração 20261013140000_planos.sql). Ao criar um plano ou mudar o que ele
 * libera, mude nos dois lugares:
 *  - `public.plan_includes_after_sale(plano)`: planos com pós-venda (RLS das conversas);
 *  - `public.plan_ml_accounts_limit(plano)`: contas do ML de cada plano (preenche organizations.ml_accounts_limit);
 *  - `public.organization_plan_id(...)`: sem plano + teste grátis em andamento = plano "trial".
 */

export type PlanFeature = "pos_venda" | "melhorias_anuncio"

export const PLAN_FEATURES: readonly PlanFeature[] = ["pos_venda", "melhorias_anuncio"]

export type SupportLevel = "email" | "whatsapp" | "priority"

export type PlanLimits = {
  /** Respostas automáticas da IA por mês (perguntas + pós-venda). null = sem limite. */
  answersPerMonth: number | null
  /** Contas do Mercado Livre ativas ao mesmo tempo. */
  mlAccounts: number
  /** Análises de "Melhorias de anúncio" por mês. null = sem limite; 0 = não inclui. */
  listingImprovementsPerMonth: number | null
}

export type PlanInfo = {
  id: string
  name: string
  features: readonly PlanFeature[]
  limits: PlanLimits
}

export type SellablePlanId = "starter" | "pro" | "escala"

export type SellablePlan = PlanInfo & {
  id: SellablePlanId
  tagline: string
  /** Mensalidade no plano mensal, em reais. */
  priceMonthly: number
  /** Total cobrado no plano anual, em reais (2 meses grátis = 10 mensalidades). */
  priceAnnual: number
  support: SupportLevel
  highlight?: boolean
}

export const SELLABLE_PLANS: readonly SellablePlan[] = [
  {
    id: "starter",
    name: "Starter",
    tagline: "Para começar a automatizar as respostas.",
    priceMonthly: 97,
    priceAnnual: 970,
    support: "email",
    features: [],
    limits: { answersPerMonth: 300, mlAccounts: 1, listingImprovementsPerMonth: 0 },
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Perguntas e pós-venda no automático.",
    priceMonthly: 197,
    priceAnnual: 1970,
    support: "whatsapp",
    highlight: true,
    features: ["pos_venda", "melhorias_anuncio"],
    limits: { answersPerMonth: 1500, mlAccounts: 3, listingImprovementsPerMonth: 20 },
  },
  {
    id: "escala",
    name: "Escala",
    tagline: "Para várias contas e muito volume.",
    priceMonthly: 397,
    priceAnnual: 3970,
    support: "priority",
    features: ["pos_venda", "melhorias_anuncio"],
    limits: { answersPerMonth: 5000, mlAccounts: 10, listingImprovementsPerMonth: 100 },
  },
]

/** Organização interna da equipe maanu (demonstração/administração): tudo liberado, sem limites. */
export const ADMIN_PLAN: PlanInfo = {
  id: "admin",
  name: "Administração",
  features: PLAN_FEATURES,
  limits: { answersPerMonth: null, mlAccounts: 10, listingImprovementsPerMonth: null },
}

/**
 * Teste grátis de 7 dias (organização sem plano): conhece tudo do Pro, com 1 conta do ML, até 300 respostas (o mesmo do Starter)
 * automáticas e 3 análises de anúncio no período do teste. Não é um plano que se assina.
 */
export const TRIAL_PLAN: PlanInfo = {
  id: "trial",
  name: "Teste grátis",
  features: PLAN_FEATURES,
  limits: { answersPerMonth: 300, mlAccounts: 1, listingImprovementsPerMonth: 3 },
}

/** Planos que o administrador pode atribuir a uma organização (os vendidos + o interno). */
export const PLANS: Record<string, PlanInfo> = {
  ...Object.fromEntries(SELLABLE_PLANS.map((plan) => [plan.id, plan])),
  admin: ADMIN_PLAN,
}

/** Plano mais barato que libera cada funcionalidade exclusiva (avisos de "disponível no plano X"). */
export const FEATURE_PLAN: Record<PlanFeature, SellablePlanId> = {
  pos_venda: "pro",
  melhorias_anuncio: "pro",
}

export const FEATURE_LABELS: Record<PlanFeature, string> = {
  pos_venda: "Pós-venda com IA",
  melhorias_anuncio: "Melhorias de anúncio",
}

export const SUPPORT_LABELS: Record<SupportLevel, string> = {
  email: "Suporte por e-mail",
  whatsapp: "Suporte por WhatsApp",
  priority: "Suporte prioritário + configuração com a gente",
}

export const BILLING_CYCLES = ["monthly", "annual"] as const
export type BillingCycle = (typeof BILLING_CYCLES)[number]

export const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  monthly: "Mensal",
  annual: "Anual",
}

export function normalizePlanId(plan: string | null | undefined): string | null {
  const text = plan?.trim().toLowerCase()
  return text ? text : null
}

export function planInfo(plan: string | null | undefined): PlanInfo | null {
  const id = normalizePlanId(plan)
  return id ? (PLANS[id] ?? null) : null
}

export function sellablePlan(plan: string | null | undefined): SellablePlan | null {
  const id = normalizePlanId(plan)
  return SELLABLE_PLANS.find((candidate) => candidate.id === id) ?? null
}

export function planIncludes(plan: string | null | undefined, feature: PlanFeature): boolean {
  return planInfo(plan)?.features.includes(feature) ?? false
}

/** O mínimo da organização para saber o plano em vigor. */
export type OrganizationPlanFields = {
  plan: string | null
  subscription_status: string
  trial_ends_at: string
}

/**
 * Plano em vigor da organização:
 *  - plano cadastrado e conhecido → ele;
 *  - sem plano e no teste grátis (ainda dentro do prazo) → TRIAL_PLAN;
 *  - qualquer outro caso (plano desconhecido, cortesia sem plano, teste vencido) → Starter, o plano base. O bloqueio
 *    de quem não pode usar o app é feito à parte (computeAccess).
 * Espelho no banco: public.organization_plan_id (só a parte "plano ou trial"; o Starter base não libera nada a mais).
 */
export function resolvePlan(organization: OrganizationPlanFields, now: Date = new Date()): PlanInfo {
  const known = planInfo(organization.plan)
  if (known) return known
  if (
    !normalizePlanId(organization.plan) &&
    organization.subscription_status === "trialing" &&
    new Date(organization.trial_ends_at).getTime() > now.getTime()
  ) {
    return TRIAL_PLAN
  }
  return SELLABLE_PLANS[0]
}

/** A organização pode usar a funcionalidade agora (pelo plano em vigor)? */
export function organizationIncludes(
  organization: OrganizationPlanFields,
  feature: PlanFeature,
  now: Date = new Date()
): boolean {
  return resolvePlan(organization, now).features.includes(feature)
}

/** Funcionalidades liberadas para quem está logado (o administrador da plataforma vê tudo). */
export function featureAccess(plan: PlanInfo, isPlatformAdmin = false): Record<PlanFeature, boolean> {
  return Object.fromEntries(
    PLAN_FEATURES.map((feature) => [feature, isPlatformAdmin || plan.features.includes(feature)])
  ) as Record<PlanFeature, boolean>
}

/** Nome do plano para exibir (planos não cadastrados aparecem com a primeira letra maiúscula). */
export function planName(plan: string | null | undefined): string | null {
  const info = planInfo(plan)
  if (info) return info.name
  const text = plan?.trim()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : null
}

export function requiredPlanName(feature: PlanFeature): string {
  return PLANS[FEATURE_PLAN[feature]]?.name ?? FEATURE_PLAN[feature]
}

/** Valor por mês do plano no ciclo escolhido (anual = total ÷ 12, arredondado para exibir). */
export function monthlyPrice(plan: SellablePlan, cycle: BillingCycle): number {
  return cycle === "annual" ? plan.priceAnnual / 12 : plan.priceMonthly
}

const priceFormat = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/** "R$ 197" (preço de vitrine, arredondado para reais inteiros: R$ 970 ÷ 12 = "R$ 81"). */
export function formatPrice(value: number): string {
  return priceFormat.format(Math.round(value))
}

/** Quanto se economiza por ano no plano anual. */
export function annualSavings(plan: SellablePlan): number {
  return plan.priceMonthly * 12 - plan.priceAnnual
}

/** Limite de respostas automáticas da organização: o definido pelo administrador ou o do plano. */
export function answersLimit(plan: PlanInfo, override: number | null | undefined): number | null {
  if (typeof override === "number" && Number.isFinite(override) && override >= 0) return Math.floor(override)
  return plan.limits.answersPerMonth
}

/** O próximo plano acima (para "subir de plano"); null no topo ou fora dos planos vendidos. */
export function nextPlan(plan: PlanInfo): SellablePlan | null {
  if (plan.id === TRIAL_PLAN.id) return SELLABLE_PLANS.find((candidate) => candidate.highlight) ?? null
  const index = SELLABLE_PLANS.findIndex((candidate) => candidate.id === plan.id)
  if (index < 0) return null
  return SELLABLE_PLANS[index + 1] ?? null
}
