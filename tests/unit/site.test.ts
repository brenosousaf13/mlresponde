import { describe, expect, it } from "vitest"

import {
  CALCULATOR_DEFAULTS,
  estimateSavings,
  formatBRL,
  formatBRLWhole,
  formatInteger,
  pricePerDay,
} from "@/lib/site/calculator"
import { SALES_PAGE_PATH, appHostUrl, appHref, isLocalHost, siteHostRouting } from "@/lib/site/host"
import { SELLABLE_PLANS } from "@/lib/plans/plans"

describe("endereços do site (página de vendas × app)", () => {
  const route = (url: string, appHost?: string, adminHost?: string) =>
    siteHostRouting({ url, host: new URL(url).host, appHost, adminHost })

  it("a página de vendas está em /institucional por enquanto (revisão), com o app ainda em '/'", () => {
    expect(SALES_PAGE_PATH).toBe("/institucional")
  })

  it("sem APP_HOST: a página de vendas abre sem login e o resto do app segue no mesmo endereço", () => {
    expect(route("https://maanu.com.br/institucional")).toEqual({ kind: "landing" })
    expect(route("https://maanu.com.br/institucional?utm_source=instagram")).toEqual({ kind: "landing" })
    expect(route("http://localhost:3000/institucional")).toEqual({ kind: "landing" })
    // "/" continua sendo o app (leva ao painel ou ao login), como antes da página de vendas.
    expect(route("https://maanu.com.br/")).toEqual({ kind: "pass" })
    expect(route("https://maanu.com.br/login")).toEqual({ kind: "pass" })
    expect(route("https://maanu.com.br/painel?x=1")).toEqual({ kind: "pass" })
    expect(route("https://maanu.com.br/institucional-extra")).toEqual({ kind: "pass" })
  })

  it("com APP_HOST, o domínio principal mantém a página de vendas, as páginas legais e as rotas de servidores", () => {
    const app = "app.maanu.com.br"
    expect(route("https://maanu.com.br/institucional", app)).toEqual({ kind: "landing" })
    expect(route("https://maanu.com.br/termos", app)).toEqual({ kind: "pass" })
    expect(route("https://maanu.com.br/privacidade", app)).toEqual({ kind: "pass" })
    expect(route("https://maanu.com.br/sitemap.xml", app)).toEqual({ kind: "pass" })
    expect(route("https://maanu.com.br/api/webhook/mercadolivre", app)).toEqual({ kind: "pass" })
    expect(route("https://maanu.com.br/api/webhook/abacatepay?webhookSecret=x", app)).toEqual({ kind: "pass" })
    expect(route("https://maanu.com.br/api/cron/questions", app)).toEqual({ kind: "pass" })
  })

  it("com APP_HOST, o resto vai para o mesmo caminho no endereço do app (com a busca)", () => {
    const app = "app.maanu.com.br"
    expect(route("https://maanu.com.br/login?next=%2Fperguntas", app)).toEqual({
      kind: "redirect",
      url: "https://app.maanu.com.br/login?next=%2Fperguntas",
    })
    expect(route("https://maanu.com.br/auth/confirm?token_hash=abc&type=signup&next=%2Fonboarding", app)).toEqual({
      kind: "redirect",
      url: "https://app.maanu.com.br/auth/confirm?token_hash=abc&type=signup&next=%2Fonboarding",
    })
    // Retorno do OAuth do ML no endereço antigo: o cookie do OAuth está no endereço do app.
    expect(route("https://maanu.com.br/api/auth/callback/mercadolivre?code=1&state=2", app)).toEqual({
      kind: "redirect",
      url: "https://app.maanu.com.br/api/auth/callback/mercadolivre?code=1&state=2",
    })
    // Prefixo parecido não é página legal.
    expect(route("https://maanu.com.br/termos-extra", app).kind).toBe("redirect")
  })

  it("no endereço do app, '/' leva ao painel e o resto passa", () => {
    const app = "app.maanu.com.br"
    expect(route("https://app.maanu.com.br/?utm=x", app)).toEqual({ kind: "redirect", url: "https://app.maanu.com.br/painel" })
    expect(route("https://app.maanu.com.br/login", app)).toEqual({ kind: "pass" })
    expect(route("https://APP.maanu.com.br./cadastro", "app.maanu.com.br")).toEqual({ kind: "pass" })
  })

  it("o endereço do painel do administrador fica com as regras próprias", () => {
    expect(route("https://admin.maanu.com.br/", "app.maanu.com.br", "admin.maanu.com.br")).toEqual({ kind: "pass" })
  })

  it("teste local com *.localhost mantém http e a porta", () => {
    expect(isLocalHost("app.localhost:3000")).toBe(true)
    expect(isLocalHost("maanu.com.br")).toBe(false)
    expect(appHostUrl("http://localhost:3000/login?a=1", "app.localhost")).toBe("http://app.localhost:3000/login?a=1")
    expect(appHostUrl("http://maanu.com.br:8080/x", "app.maanu.com.br")).toBe("https://app.maanu.com.br/x")
    expect(siteHostRouting({ url: "http://localhost:3000/cadastro", host: "localhost:3000", appHost: "app.localhost" })).toEqual({
      kind: "redirect",
      url: "http://app.localhost:3000/cadastro",
    })
  })

  it("links da página de vendas para o app", () => {
    expect(appHref("/cadastro", "https://app.maanu.com.br")).toBe("https://app.maanu.com.br/cadastro")
    expect(appHref("/login", "https://maanu.com.br/")).toBe("https://maanu.com.br/login")
    expect(appHref("/cadastro", "")).toBe("/cadastro")
    expect(appHref("/cadastro", null)).toBe("/cadastro")
    expect(appHref("/cadastro", "não é url")).toBe("/cadastro")
  })
})

describe("calculadora da página de vendas", () => {
  it("usa a mesma conta da tela Resultados", () => {
    const estimate = estimateSavings(CALCULATOR_DEFAULTS)
    expect(estimate.questionsPerMonth).toBe(600)
    expect(estimate.hoursPerMonth).toBe(30)
    expect(estimate.moneyPerMonth).toBe(600)
  })

  it("não indica plano (de propósito: não afastar ninguém do teste grátis)", () => {
    const estimate = estimateSavings({ questionsPerDay: 200, minutesPerAnswer: 3, hourlyCost: 20 })
    expect(estimate.questionsPerMonth).toBe(6000)
    expect(Object.keys(estimate).sort()).toEqual(["hoursPerMonth", "moneyPerMonth", "questionsPerMonth"])
  })

  it("mantém os valores dentro dos limites dos controles", () => {
    const estimate = estimateSavings({ questionsPerDay: -5, minutesPerAnswer: 99, hourlyCost: Number.NaN })
    expect(estimate.questionsPerMonth).toBe(30)
    expect(estimate.hoursPerMonth).toBe(5)
    expect(estimate.moneyPerMonth).toBe(50)
  })

  it("preço por dia e formatos em reais", () => {
    expect(formatBRL(pricePerDay(SELLABLE_PLANS[0]))).toBe("R$ 3,23")
    expect(formatBRLWhole(1240.4)).toBe("R$ 1.240")
    expect(formatInteger(1500)).toBe("1.500")
  })
})
