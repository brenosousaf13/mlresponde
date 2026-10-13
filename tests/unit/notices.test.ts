import { describe, expect, it } from "vitest"

import type { Access } from "@/lib/access/access"
import { mlConnectionNotice, trialNotice } from "@/lib/access/notices"

const trial = (daysLeft: number): Access => ({
  state: "trial",
  trialEndsAt: "2026-10-19T17:30:00Z",
  trialDaysLeft: daysLeft,
})
const active: Access = { state: "active", trialEndsAt: "2026-10-01T00:00:00Z", trialDaysLeft: 0 }
const blocked: Access = { state: "blocked", trialEndsAt: "2026-10-01T00:00:00Z", trialDaysLeft: 0 }

describe("trialNotice", () => {
  it("mostra os dias que faltam e a data final no fuso de São Paulo", () => {
    expect(trialNotice(trial(5), "trialing", 7)).toMatchObject({
      kind: "trial",
      daysLeft: 5,
      title: "Faltam 5 dias de teste",
      detail: "Grátis até 19 de outubro",
      short: "5 dias de teste",
      urgent: false,
    })
  })

  it("fração restante do teste para o anel", () => {
    const notice = trialNotice(trial(7), "trialing", 7)
    expect(notice?.kind === "trial" && notice.remaining).toBe(1)
    const ending = trialNotice(trial(2), "trialing", 7)
    expect(ending?.kind === "trial" && ending.remaining).toBeCloseTo(2 / 7)
  })

  it("últimos dias ganham destaque e o último dia tem texto próprio", () => {
    expect(trialNotice(trial(2), "trialing", 7)).toMatchObject({ urgent: true })
    expect(trialNotice(trial(1), "trialing", 7)).toMatchObject({
      title: "Último dia de teste grátis",
      short: "Último dia de teste",
      urgent: true,
    })
  })

  it("teste estendido além do padrão não estoura o anel", () => {
    const notice = trialNotice(trial(10), "trialing", 7)
    expect(notice).toMatchObject({ totalDays: 10, remaining: 1 })
  })

  it("some com assinatura ativa ou cortesia", () => {
    expect(trialNotice(active, "active", 7)).toBeNull()
    expect(trialNotice(active, "trialing", 7)).toBeNull()
  })

  it("bloqueado: teste encerrado, pagamento pendente ou assinatura inativa", () => {
    expect(trialNotice(blocked, "trialing", 7)).toMatchObject({ kind: "ended", title: "Seu teste grátis terminou" })
    expect(trialNotice(blocked, "past_due", 7)).toMatchObject({ kind: "ended", title: "Pagamento pendente" })
    expect(trialNotice(blocked, "canceled", 7)).toMatchObject({ kind: "ended", title: "Assinatura inativa" })
  })
})

describe("mlConnectionNotice", () => {
  it("pede para conectar enquanto não houver nenhuma conta", () => {
    expect(mlConnectionNotice(trial(5), { total: 0, active: 0 })).toMatchObject({ kind: "connect" })
    expect(mlConnectionNotice(active, { total: 0, active: 0 })).toMatchObject({ kind: "connect" })
  })

  it("pede para reativar quando as contas existem mas nenhuma está ativa", () => {
    expect(mlConnectionNotice(trial(5), { total: 2, active: 0 })).toMatchObject({ kind: "reactivate" })
  })

  it("some quando há conta ativa", () => {
    expect(mlConnectionNotice(trial(5), { total: 1, active: 1 })).toBeNull()
  })

  it("não aparece com a conta bloqueada (a página de contas fica fechada)", () => {
    expect(mlConnectionNotice(blocked, { total: 0, active: 0 })).toBeNull()
  })
})
