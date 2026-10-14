/**
 * Produtos da AbacatePay × planos da maanu (puro, testado em tests/unit/abacatepay.test.ts).
 *
 * Os produtos são criados pelo Breno no painel da AbacatePay. Cada plano e ciclo precisa de um produto ATIVO, com
 * recorrência (MONTHLY = mensal, ANNUALLY = anual) e o mesmo preço da maanu (lib/plans/plans.ts). O plano é reconhecido
 * pela palavra "Starter", "Pro" ou "Escala" no nome ou no externalId (ex.: "Pro", "Plano Pro", "pro_mensal").
 * Preço diferente do mostrado no app = produto não é usado (nunca cobrar um valor diferente do anunciado).
 */

import { SELLABLE_PLANS, type BillingCycle, type SellablePlan, type SellablePlanId } from "@/lib/plans/plans"

export type AbacateProduct = {
  id: string
  externalId: string | null
  name: string
  /** Em centavos. */
  price: number
  status: string
  cycle: string | null
  devMode: boolean
  trialDays: number | null
  updatedAt: string | null
}

export const PROVIDER_CYCLE: Record<BillingCycle, "MONTHLY" | "ANNUALLY"> = { monthly: "MONTHLY", annual: "ANNUALLY" }

export function cycleFromProvider(value: string | null | undefined): BillingCycle | null {
  if (value === "MONTHLY") return "monthly"
  if (value === "ANNUALLY") return "annual"
  return null
}

/** Preço do plano no ciclo, em centavos (anual = o total do ano). */
export function expectedPriceCents(plan: SellablePlan, cycle: BillingCycle): number {
  return Math.round((cycle === "annual" ? plan.priceAnnual : plan.priceMonthly) * 100)
}

/** Plano cujo preço no ciclo é exatamente este valor (o que a AbacatePay cobra). */
export function planFromAmount(amountCents: number | null | undefined, cycle: BillingCycle | null): SellablePlanId | null {
  if (typeof amountCents !== "number" || !cycle) return null
  return SELLABLE_PLANS.find((plan) => expectedPriceCents(plan, cycle) === amountCents)?.id ?? null
}

function words(text: string | null | undefined): string[] {
  return (text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** Plano de um produto pelo nome ou externalId; nenhum ou mais de um plano citado = não reconhecido. */
export function productPlan(product: Pick<AbacateProduct, "name" | "externalId">): SellablePlanId | null {
  const found = new Set([...words(product.externalId), ...words(product.name)])
  const plans = SELLABLE_PLANS.filter((plan) => found.has(plan.id) || found.has(plan.name.toLowerCase()))
  return plans.length === 1 ? plans[0].id : null
}

export type CatalogStatus = "ok" | "missing" | "price_mismatch"

export type CatalogEntry = {
  plan: SellablePlanId
  cycle: BillingCycle
  expectedCents: number
  status: CatalogStatus
  /** Produto usado (ok) ou o mais recente com preço diferente (price_mismatch). */
  product: AbacateProduct | null
  /** Outros produtos que também servem para o mesmo plano e ciclo (usamos o mais recente). */
  duplicates: number
}

export type IgnoredReason = "archived" | "no_plan" | "no_cycle" | "unsupported_cycle"

export type Catalog = {
  entries: CatalogEntry[]
  ignored: { product: AbacateProduct; reason: IgnoredReason }[]
}

function newestFirst(a: AbacateProduct, b: AbacateProduct) {
  return new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime()
}

export function matchCatalog(products: readonly AbacateProduct[]): Catalog {
  const ignored: Catalog["ignored"] = []
  const byKey = new Map<string, AbacateProduct[]>()
  for (const product of products) {
    if (product.status !== "ACTIVE") {
      ignored.push({ product, reason: "archived" })
      continue
    }
    const plan = productPlan(product)
    if (!plan) {
      ignored.push({ product, reason: "no_plan" })
      continue
    }
    const cycle = cycleFromProvider(product.cycle)
    if (!cycle) {
      ignored.push({ product, reason: product.cycle ? "unsupported_cycle" : "no_cycle" })
      continue
    }
    const key = `${plan}:${cycle}`
    byKey.set(key, [...(byKey.get(key) ?? []), product])
  }

  const entries: CatalogEntry[] = []
  for (const plan of SELLABLE_PLANS) {
    for (const cycle of ["monthly", "annual"] as const) {
      const expectedCents = expectedPriceCents(plan, cycle)
      const candidates = [...(byKey.get(`${plan.id}:${cycle}`) ?? [])].sort(newestFirst)
      const priced = candidates.filter((product) => product.price === expectedCents)
      if (priced.length) {
        entries.push({ plan: plan.id, cycle, expectedCents, status: "ok", product: priced[0], duplicates: priced.length - 1 })
      } else if (candidates.length) {
        entries.push({ plan: plan.id, cycle, expectedCents, status: "price_mismatch", product: candidates[0], duplicates: 0 })
      } else {
        entries.push({ plan: plan.id, cycle, expectedCents, status: "missing", product: null, duplicates: 0 })
      }
    }
  }
  return { entries, ignored }
}

export function catalogEntry(catalog: Catalog | null, plan: string, cycle: BillingCycle): CatalogEntry | null {
  return catalog?.entries.find((entry) => entry.plan === plan && entry.cycle === cycle) ?? null
}

export type CheckoutAvailability = Record<SellablePlanId, Record<BillingCycle, boolean>>

export function checkoutAvailability(catalog: Catalog | null): CheckoutAvailability {
  return Object.fromEntries(
    SELLABLE_PLANS.map((plan) => [
      plan.id,
      {
        monthly: catalogEntry(catalog, plan.id, "monthly")?.status === "ok",
        annual: catalogEntry(catalog, plan.id, "annual")?.status === "ok",
      },
    ])
  ) as CheckoutAvailability
}