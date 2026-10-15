import { describe, expect, it } from "vitest"

import { companyInfo, siteConfig } from "@/lib/config/site"
import { SELLABLE_PLANS } from "@/lib/plans/plans"
import { FAQ } from "@/lib/site/faq"
import { isIndexableHost } from "@/lib/site/host"
import {
  PRIVATE_PATHS,
  SEARCH_AND_AI_CRAWLERS,
  SEO_DESCRIPTION,
  SEO_TITLE,
  buildLlmsTxt,
  buildStructuredData,
  structuredDataJson,
} from "@/lib/site/seo"

type Node = Record<string, unknown> & { "@type": string }

const graph = () => buildStructuredData()["@graph"] as Node[]
const node = (type: string) => graph().find((item) => item["@type"] === type) as Node

describe("textos de busca", () => {
  it("título e descrição cabem no Google e falam do Mercado Livre", () => {
    expect(SEO_TITLE.length).toBeLessThanOrEqual(60)
    expect(SEO_DESCRIPTION.length).toBeLessThanOrEqual(160)
    expect(SEO_TITLE).toContain("Mercado Livre")
    expect(SEO_DESCRIPTION).toContain("Mercado Livre")
    expect(SEO_TITLE).toContain(siteConfig.name)
  })
})

describe("dados estruturados (schema.org)", () => {
  it("tem empresa, site, página, software e perguntas frequentes num grafo só", () => {
    expect(graph().map((item) => item["@type"])).toEqual([
      "Organization",
      "WebSite",
      "WebPage",
      "SoftwareApplication",
      "FAQPage",
    ])
    expect(() => JSON.parse(structuredDataJson())).not.toThrow()
  })

  it("preços iguais aos planos vendidos e URLs absolutas no domínio oficial", () => {
    const offers = node("SoftwareApplication").offers as { price: number; priceCurrency: string; url: string }[]
    expect(offers.map((offer) => offer.price)).toEqual(SELLABLE_PLANS.map((plan) => plan.priceMonthly))
    expect(offers.every((offer) => offer.priceCurrency === "BRL" && offer.url.startsWith(siteConfig.marketingUrl))).toBe(true)
  })

  it("CNPJ da empresa", () => {
    expect(node("Organization").taxID).toBe(companyInfo.cnpj)
  })

  it("todas as perguntas frequentes entram, com resposta", () => {
    const questions = node("FAQPage").mainEntity as { name: string; acceptedAnswer: { text: string } }[]
    expect(questions).toHaveLength(FAQ.length)
    expect(questions.every((question) => question.name && question.acceptedAnswer.text.length > 20)).toBe(true)
  })

  it("nunca inventa nota, avaliação ou depoimento", () => {
    const json = structuredDataJson()
    for (const forbidden of ["aggregateRating", "AggregateRating", "review", "Review", "ratingValue"]) {
      expect(json).not.toContain(forbidden)
    }
  })

  it("não deixa '<' cru dentro da tag script", () => {
    expect(structuredDataJson()).not.toContain("<")
  })
})

describe("robôs e endereços", () => {
  it("buscadores e IAs principais estão liberados pelo nome", () => {
    for (const bot of ["Googlebot", "Bingbot", "GPTBot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot", "Google-Extended"]) {
      expect(SEARCH_AND_AI_CRAWLERS).toContain(bot)
    }
  })

  it("área logada fica fora; página de vendas e páginas legais, não", () => {
    expect(PRIVATE_PATHS).toContain("/painel")
    expect(PRIVATE_PATHS).toContain("/admin")
    const paths: readonly string[] = PRIVATE_PATHS
    expect(paths.some((path) => path === "/" || path.startsWith("/termos") || path.startsWith("/privacidade"))).toBe(false)
  })

  it("só o endereço oficial entra nos buscadores", () => {
    expect(isIndexableHost("maanu.com.br")).toBe(true)
    expect(isIndexableHost("MAANU.com.br.")).toBe(true)
    expect(isIndexableHost("localhost:3000")).toBe(true)
    expect(isIndexableHost("mlresponde-v2.vercel.app")).toBe(false)
    expect(isIndexableHost("maanu-git-v2.vercel.app")).toBe(false)
    expect(isIndexableHost("app.maanu.com.br")).toBe(false)
    expect(isIndexableHost("www.maanu.com.br")).toBe(false)
    expect(isIndexableHost(null)).toBe(false)
  })
})

describe("/llms.txt", () => {
  const text = buildLlmsTxt({ signup: "https://maanu.com.br/cadastro", login: "https://maanu.com.br/login" })

  it("segue o formato (título, resumo e seções em Markdown)", () => {
    expect(text.startsWith(`# ${siteConfig.name}\n\n> `)).toBe(true)
    expect(text).toContain("## Planos e preços")
    expect(text).toContain("## Perguntas frequentes")
    expect(text).toContain("## Links")
  })

  it("traz os preços atuais, o CNPJ e todas as perguntas frequentes", () => {
    for (const plan of SELLABLE_PLANS) expect(text).toContain(`**${plan.name}** — R$ ${plan.priceMonthly}/mês`)
    expect(text).toContain(companyInfo.cnpj)
    for (const item of FAQ) expect(text).toContain(`### ${item.question}`)
    expect(text).toContain("https://maanu.com.br/cadastro")
  })
})
