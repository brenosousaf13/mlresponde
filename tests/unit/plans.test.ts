import { describe, expect, it } from "vitest"

import { answersUsageNotice } from "@/lib/access/notices"
import {
  ADMIN_PLAN,
  BILLING_CYCLES,
  answersLimit,
  featureAccess,
  formatPrice,
  nextPlan,
  organizationIncludes,
  planInfo,
  PLANS,
  requiredPlanName,
  resolvePlan,
  SELLABLE_PLANS,
  sellablePlan,
  TRIAL_PLAN,
} from "@/lib/plans/plans"
import { hasQuotaLeft, monthPeriod, periodText, quotaStatus, usagePeriod } from "@/lib/plans/usage"

const NOW = new Date("2026-10-13T15:00:00Z")
/** O Intl separa "R$" do valor com espaço sem quebra. */
const plain = (text: string) => text.replace(/\s/g, " ")
const org = (plan: string | null, status = "active", trialEnds = "2026-10-20T00:00:00Z") => ({
  plan,
  subscription_status: status,
  trial_ends_at: trialEnds,
})

describe("catálogo de planos (decidido pelo Breno na Sessão 20)", () => {
  it("Starter, Pro e Escala com preços, limites e funcionalidades da tabela", () => {
    expect(SELLABLE_PLANS.map((plan) => plan.id)).toEqual(["starter", "pro", "escala"])
    const [starter, pro, escala] = SELLABLE_PLANS
    expect([starter.priceMonthly, pro.priceMonthly, escala.priceMonthly]).toEqual([97, 197, 397])
    expect([starter.limits.answersPerMonth, pro.limits.answersPerMonth, escala.limits.answersPerMonth]).toEqual([300, 1500, 5000])
    expect([starter.limits.mlAccounts, pro.limits.mlAccounts, escala.limits.mlAccounts]).toEqual([1, 3, 10])
    expect([starter.limits.listingImprovementsPerMonth, pro.limits.listingImprovementsPerMonth, escala.limits.listingImprovementsPerMonth]).toEqual([0, 20, 100])
    expect(starter.features).toEqual([])
    expect(pro.features).toContain("pos_venda")
    expect(escala.features).toContain("melhorias_anuncio")
    expect([starter.support, pro.support, escala.support]).toEqual(["email", "whatsapp", "priority"])
    expect(SELLABLE_PLANS.filter((plan) => plan.highlight).map((plan) => plan.id)).toEqual(["pro"])
  })

  it("só o plano mensal é vendido (R$ 97, R$ 197 e R$ 397)", () => {
    expect(BILLING_CYCLES).toEqual(["monthly"])
    expect(SELLABLE_PLANS.map((plan) => plain(formatPrice(plan.priceMonthly)))).toEqual(["R$ 97", "R$ 197", "R$ 397"])
    expect(SELLABLE_PLANS.every((plan) => !("priceAnnual" in plan))).toBe(true)
  })

  it("só os planos vendidos e o interno podem ser atribuídos (sem o antigo Essencial)", () => {
    expect(Object.keys(PLANS).sort()).toEqual(["admin", "escala", "pro", "starter"])
    expect(planInfo("essencial")).toBeNull()
    expect(planInfo(" PRO ")?.id).toBe("pro")
    expect(sellablePlan("admin")).toBeNull()
    expect(requiredPlanName("melhorias_anuncio")).toBe("Pro")
  })
})

describe("plano em vigor", () => {
  it("plano cadastrado vale mesmo durante o teste", () => {
    expect(resolvePlan(org("escala", "trialing"), NOW).id).toBe("escala")
    expect(resolvePlan(org("admin"), NOW)).toBe(ADMIN_PLAN)
  })

  it("sem plano e no prazo do teste = teste grátis (tudo do Pro, 1 conta, 300 respostas)", () => {
    const plan = resolvePlan(org(null, "trialing"), NOW)
    expect(plan).toBe(TRIAL_PLAN)
    expect(plan.features).toEqual(expect.arrayContaining(["pos_venda", "melhorias_anuncio"]))
    expect(plan.limits).toEqual({ answersPerMonth: 300, mlAccounts: 1, listingImprovementsPerMonth: 3 })
    expect(organizationIncludes(org(null, "trialing"), "pos_venda", NOW)).toBe(true)
  })

  it("teste vencido, cortesia sem plano ou plano desconhecido = Starter (sem extras)", () => {
    expect(resolvePlan(org(null, "trialing", "2026-10-01T00:00:00Z"), NOW).id).toBe("starter")
    expect(resolvePlan(org(null, "active"), NOW).id).toBe("starter")
    expect(resolvePlan(org("essencial"), NOW).id).toBe("starter")
    expect(organizationIncludes(org("essencial"), "pos_venda", NOW)).toBe(false)
  })

  it("funcionalidades liberadas (admin da plataforma vê tudo)", () => {
    const starter = resolvePlan(org("starter"), NOW)
    expect(featureAccess(starter)).toEqual({ pos_venda: false, melhorias_anuncio: false })
    expect(featureAccess(starter, true)).toEqual({ pos_venda: true, melhorias_anuncio: true })
    expect(featureAccess(resolvePlan(org("pro"), NOW))).toEqual({ pos_venda: true, melhorias_anuncio: true })
  })

  it("limite de respostas: acordo do administrador vence o do plano", () => {
    const pro = resolvePlan(org("pro"), NOW)
    expect(answersLimit(pro, null)).toBe(1500)
    expect(answersLimit(pro, 2500)).toBe(2500)
    expect(answersLimit(pro, 0)).toBe(0)
    expect(answersLimit(ADMIN_PLAN, null)).toBeNull()
  })

  it("próximo plano para subir", () => {
    expect(nextPlan(resolvePlan(org("starter"), NOW))?.id).toBe("pro")
    expect(nextPlan(resolvePlan(org("pro"), NOW))?.id).toBe("escala")
    expect(nextPlan(resolvePlan(org("escala"), NOW))).toBeNull()
    expect(nextPlan(TRIAL_PLAN)?.id).toBe("pro")
    expect(nextPlan(ADMIN_PLAN)).toBeNull()
  })
})

describe("período e cota", () => {
  it("mês do calendário em Brasília (renova dia 1º à meia-noite)", () => {
    const period = monthPeriod(NOW)
    expect(period.from.toISOString()).toBe("2026-10-01T03:00:00.000Z")
    expect(period.to.toISOString()).toBe("2026-11-01T03:00:00.000Z")
    // 31/10 às 23h em Brasília ainda é outubro.
    expect(monthPeriod(new Date("2026-11-01T02:00:00Z")).from.toISOString()).toBe("2026-10-01T03:00:00.000Z")
    expect(monthPeriod(new Date("2026-12-15T12:00:00Z")).to.toISOString()).toBe("2027-01-01T03:00:00.000Z")
    expect(periodText(period)).toBe("Renova em 1 de novembro de 2026")
  })

  it("no teste grátis o período é o teste inteiro", () => {
    const period = usagePeriod(TRIAL_PLAN, { createdAt: "2026-10-12T10:00:00Z", trialEndsAt: "2026-10-19T10:00:00Z" }, NOW)
    expect(period).toEqual({
      from: new Date("2026-10-12T10:00:00Z"),
      to: new Date("2026-10-19T10:00:00Z"),
      kind: "trial",
    })
    expect(periodText(period)).toBe("No teste grátis, até 19 de outubro de 2026")
    expect(usagePeriod(PLANS.pro, { createdAt: "2026-10-12T10:00:00Z", trialEndsAt: "2026-10-19T10:00:00Z" }, NOW).kind).toBe("month")
  })

  it("níveis: ok, aviso a partir de 80%, esgotado e sem limite", () => {
    expect(quotaStatus(100, 500)).toMatchObject({ level: "ok", remaining: 400, percent: 20 })
    expect(quotaStatus(400, 500)).toMatchObject({ level: "warning", percent: 80 })
    expect(quotaStatus(500, 500)).toMatchObject({ level: "reached", remaining: 0, percent: 100 })
    expect(quotaStatus(620, 500)).toMatchObject({ level: "reached", remaining: 0, percent: 100 })
    expect(quotaStatus(3, 0)).toMatchObject({ level: "reached", percent: 100 })
    expect(quotaStatus(9999, null)).toMatchObject({ level: "unlimited", limit: null, remaining: null })
    expect(hasQuotaLeft(19, 20)).toBe(true)
    expect(hasQuotaLeft(20, 20)).toBe(false)
    expect(hasQuotaLeft(1000, null)).toBe(true)
  })

  it("aviso no topo das páginas", () => {
    const access = { state: "active" as const, trialEndsAt: "2026-10-20T00:00:00Z", trialDaysLeft: 0 }
    expect(answersUsageNotice(access, quotaStatus(100, 500), "Renova em 1 de novembro de 2026")).toBeNull()
    expect(answersUsageNotice(access, quotaStatus(410, 500), "Renova em 1 de novembro de 2026")).toMatchObject({
      level: "warning",
      title: "Você já usou 82% das respostas automáticas",
    })
    const reached = answersUsageNotice(access, quotaStatus(1500, 1500), "Renova em 1 de novembro de 2026")
    expect(reached?.level).toBe("reached")
    expect(reached?.description).toContain("1.500")
    expect(answersUsageNotice({ ...access, state: "blocked" }, quotaStatus(500, 500), "x")).toBeNull()
    expect(answersUsageNotice(access, quotaStatus(9000, null), "x")).toBeNull()
    expect(answersUsageNotice(access, null, "x")).toBeNull()
  })
})
