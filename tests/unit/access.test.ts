import { describe, expect, it } from "vitest"

import { computeAccess, decideSectionAccess } from "@/lib/access/access"

const now = new Date("2026-10-11T12:00:00Z")
const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString()

const base = {
  subscription_status: "trialing",
  trial_ends_at: inDays(7),
  current_period_end: null,
  billing_exempt: false,
}

describe("computeAccess", () => {
  it("teste em andamento", () => {
    expect(computeAccess(base, now)).toMatchObject({ state: "trial", trialDaysLeft: 7 })
  })

  it("arredonda dias restantes para cima", () => {
    expect(computeAccess({ ...base, trial_ends_at: inDays(0.2) }, now).trialDaysLeft).toBe(1)
  })

  it("bloqueia quando o teste acaba sem assinatura", () => {
    expect(computeAccess({ ...base, trial_ends_at: inDays(-1) }, now)).toMatchObject({
      state: "blocked",
      trialDaysLeft: 0,
    })
  })

  it("assinatura ativa libera mesmo após o teste", () => {
    expect(
      computeAccess({ ...base, subscription_status: "active", trial_ends_at: inDays(-30) }, now).state
    ).toBe("active")
  })

  it("cortesia libera sempre", () => {
    expect(
      computeAccess({ ...base, subscription_status: "canceled", trial_ends_at: inDays(-30), billing_exempt: true }, now)
        .state
    ).toBe("active")
  })

  it("assinatura cancelada ou com pagamento pendente bloqueia após o teste", () => {
    expect(computeAccess({ ...base, subscription_status: "canceled", trial_ends_at: inDays(-1) }, now).state).toBe(
      "blocked"
    )
    expect(computeAccess({ ...base, subscription_status: "past_due", trial_ends_at: inDays(-1) }, now).state).toBe(
      "blocked"
    )
  })
})

describe("decideSectionAccess", () => {
  it("bloqueado só acessa assinatura e configurações", () => {
    const ctx = { access: "blocked" as const, hasActiveMlAccount: true }
    expect(decideSectionAccess("assinatura", ctx).allowed).toBe(true)
    expect(decideSectionAccess("configuracoes", ctx).allowed).toBe(true)
    expect(decideSectionAccess("painel", ctx)).toEqual({ allowed: false, redirectTo: "/assinatura", reason: "blocked" })
    expect(decideSectionAccess("contas", ctx)).toEqual({ allowed: false, redirectTo: "/assinatura", reason: "blocked" })
  })

  it("sem conta ML só libera contas, assinatura e configurações", () => {
    const ctx = { access: "trial" as const, hasActiveMlAccount: false }
    expect(decideSectionAccess("contas", ctx).allowed).toBe(true)
    expect(decideSectionAccess("painel", ctx)).toEqual({
      allowed: false,
      redirectTo: "/contas",
      reason: "no_ml_account",
    })
  })

  it("com conta ML e teste ativo libera tudo", () => {
    const ctx = { access: "trial" as const, hasActiveMlAccount: true }
    expect(decideSectionAccess("painel", ctx).allowed).toBe(true)
    expect(decideSectionAccess("perguntas", ctx).allowed).toBe(true)
    expect(decideSectionAccess("respostas", ctx).allowed).toBe(true)
  })

  it("perguntas e respostas exigem conta ML e assinatura em dia", () => {
    expect(decideSectionAccess("perguntas", { access: "trial", hasActiveMlAccount: false }).allowed).toBe(false)
    expect(decideSectionAccess("respostas", { access: "blocked", hasActiveMlAccount: true }).allowed).toBe(false)
  })
})
