/**
 * SEO da página de vendas (puro, testado em tests/unit/site-seo.test.ts): textos de busca, dados estruturados
 * (schema.org em JSON-LD), robôs permitidos e o conteúdo do /llms.txt.
 * Tudo sai de lib/config/site.ts, lib/plans/plans.ts e lib/site/faq.ts: preço ou pergunta mudou lá, muda aqui.
 * Regra: nada de nota, avaliação, depoimento ou número de clientes que não exista (Google pune e o CDC também).
 */
import { companyInfo, siteConfig } from "@/lib/config/site"
import { FEATURE_LABELS, SELLABLE_PLANS, SUPPORT_LABELS, formatPrice, monthlyPrice } from "@/lib/plans/plans"
import { formatWhatsapp, normalizeWhatsapp } from "@/lib/validation/forms"

import { FAQ } from "./faq"
import { SALES_PAGE_PATH } from "./host"

/** Data da última mudança de conteúdo da página de vendas (sitemap e dados estruturados). Atualize ao mudar o texto. */
export const SITE_CONTENT_UPDATED = "2026-10-15"

export const SITE_URL = siteConfig.marketingUrl

/**
 * A página de vendas entra no Google e nas buscas das IAs? **false enquanto estiver em /institucional para revisão**
 * (meta robots "noindex" e fora do sitemap; o link funciona normalmente e a prévia no WhatsApp também). Virar true
 * quando ela for para "/" com o app em app.maanu.com.br (CEREBRO.md §13 item 0i).
 */
export const SALES_PAGE_INDEXABLE = false

/** ≤ 60 caracteres: aparece inteiro no Google. Palavras que o vendedor procura primeiro. */
export const SEO_TITLE = "Respostas automáticas com IA para o Mercado Livre | maanu"

/** ≤ 160 caracteres. */
export const SEO_DESCRIPTION = `A ${siteConfig.name} responde com IA as perguntas dos seus anúncios no Mercado Livre em segundos, 24h por dia, do jeito da sua loja. ${siteConfig.trialDays} dias grátis, sem cartão.`

/** Imagem de compartilhamento da página de vendas (public/og/). */
export const SEO_IMAGE = {
  url: "/og/maanu-pagina-de-vendas.jpg",
  width: 1200,
  height: 630,
  alt: "maanu: respostas automáticas com IA para o Mercado Livre. Quem responde primeiro, vende primeiro.",
} as const

/** Caminhos que não interessam a buscadores (área logada, painel, rotas de servidor). */
export const PRIVATE_PATHS = [
  "/painel",
  "/perguntas",
  "/assistente",
  "/resultados",
  "/pos-venda",
  "/melhorias",
  "/contas",
  "/assinatura",
  "/configuracoes",
  "/onboarding",
  "/admin",
  "/acesso-negado",
  "/auth/",
  "/api/",
] as const

/**
 * Robôs de busca e de IA liberados explicitamente (além do "*"): buscadores, as buscas das IAs (ChatGPT, Claude,
 * Perplexity, Gemini, Copilot, Apple) e os robôs que alimentam os modelos. Lista de nomes públicos de cada empresa.
 */
export const SEARCH_AND_AI_CRAWLERS = [
  "Googlebot",
  "Google-Extended",
  "Bingbot",
  "DuckDuckBot",
  "DuckAssistBot",
  "YandexBot",
  "Applebot",
  "Applebot-Extended",
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Amazonbot",
  "meta-externalagent",
  "MistralAI-User",
  "cohere-ai",
  "CCBot",
] as const

function absolute(path: string) {
  return new URL(path, `${SITE_URL}/`).toString()
}

/** Endereço completo da página de vendas (hoje https://maanu.com.br/institucional). */
export const SALES_PAGE_URL = absolute(SALES_PAGE_PATH)

/** Seção da página de vendas (ex.: "planos" → https://maanu.com.br/institucional#planos). */
function section(id: string) {
  return `${SALES_PAGE_URL}#${id}`
}

function digits(value: string) {
  return value.replace(/\D/g, "")
}

const FEATURES = [
  "Responde as perguntas dos anúncios do Mercado Livre em segundos, 24 horas por dia",
  "Lê o anúncio inteiro antes de responder: ficha técnica, variações, estoque, tabela de medidas e descrição",
  "Só responde sozinha quando tem certeza; na dúvida, a pergunta fica com o vendedor com uma sugestão pronta",
  "Modo “Responder sempre” com mensagem padrão da loja",
  "Não passa telefone, e-mail nem links externos (segue as regras do Mercado Livre)",
  "Caixa de entrada com o que a IA respondeu, o que o vendedor respondeu e o que espera por ele",
  "Ensinar a IA: respostas corrigidas viram exemplo para as próximas perguntas",
  "Pós-venda com IA para quem já comprou (planos Pro e Escala)",
  "Melhorias de anúncio a partir das perguntas (planos Pro e Escala)",
  "Várias contas do Mercado Livre no mesmo painel",
  "Resultados: economia de tempo e dinheiro e tempo de resposta",
] as const

/** Dados estruturados (schema.org) da página de vendas, num único grafo JSON-LD. */
export function buildStructuredData() {
  const organizationId = absolute("/#organizacao")
  const websiteId = absolute("/#site")
  const softwareId = section("software")
  const sameAs = companyInfo.instagram ? [`https://www.instagram.com/${companyInfo.instagram}`] : undefined
  const contactPoint =
    companyInfo.email || companyInfo.whatsapp
      ? [
          {
            "@type": "ContactPoint",
            contactType: "customer support",
            areaServed: "BR",
            availableLanguage: "Portuguese",
            ...(companyInfo.email ? { email: companyInfo.email } : {}),
            ...(companyInfo.whatsapp ? { telephone: `+${companyInfo.whatsapp}` } : {}),
          },
        ]
      : undefined

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId,
        name: siteConfig.name,
        url: SALES_PAGE_URL,
        slogan: siteConfig.slogan,
        description: siteConfig.description,
        logo: { "@type": "ImageObject", url: absolute("/brand/maanu-icone-512.png"), width: 512, height: 512 },
        taxID: companyInfo.cnpj,
        identifier: { "@type": "PropertyValue", propertyID: "CNPJ", value: digits(companyInfo.cnpj) },
        areaServed: { "@type": "Country", name: "Brasil" },
        ...(sameAs ? { sameAs } : {}),
        ...(contactPoint ? { contactPoint } : {}),
      },
      {
        "@type": "WebSite",
        "@id": websiteId,
        url: absolute("/"),
        name: siteConfig.name,
        description: siteConfig.tagline,
        inLanguage: "pt-BR",
        publisher: { "@id": organizationId },
      },
      {
        "@type": "WebPage",
        "@id": section("pagina"),
        url: SALES_PAGE_URL,
        name: SEO_TITLE,
        description: SEO_DESCRIPTION,
        inLanguage: "pt-BR",
        isPartOf: { "@id": websiteId },
        about: { "@id": softwareId },
        primaryImageOfPage: { "@type": "ImageObject", url: absolute(SEO_IMAGE.url), width: SEO_IMAGE.width, height: SEO_IMAGE.height },
        dateModified: SITE_CONTENT_UPDATED,
      },
      {
        "@type": "SoftwareApplication",
        "@id": softwareId,
        name: siteConfig.name,
        url: SALES_PAGE_URL,
        description: siteConfig.description,
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "Atendimento automático com IA para vendedores do Mercado Livre",
        operatingSystem: "Web",
        inLanguage: "pt-BR",
        isAccessibleForFree: false,
        image: absolute(SEO_IMAGE.url),
        publisher: { "@id": organizationId },
        featureList: [...FEATURES],
        offers: SELLABLE_PLANS.map((plan) => ({
          "@type": "Offer",
          name: `Plano ${plan.name}`,
          description: plan.tagline,
          url: section("planos"),
          price: plan.priceMonthly,
          priceCurrency: "BRL",
          availability: "https://schema.org/InStock",
          seller: { "@id": organizationId },
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            price: plan.priceMonthly,
            priceCurrency: "BRL",
            unitText: "mês",
            billingDuration: "P1M",
          },
        })),
      },
      {
        "@type": "FAQPage",
        "@id": section("duvidas"),
        url: SALES_PAGE_URL,
        inLanguage: "pt-BR",
        mainEntity: FAQ.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      },
    ],
  }
}

/** JSON-LD pronto para ir num <script> (sem "<" cru, que fecharia a tag). */
export function structuredDataJson(): string {
  return JSON.stringify(buildStructuredData()).replace(/</g, "\\u003c")
}

function planLine(plan: (typeof SELLABLE_PLANS)[number]): string {
  const { answersPerMonth, mlAccounts, listingImprovementsPerMonth } = plan.limits
  const parts = [
    `${answersPerMonth === null ? "respostas ilimitadas" : `${answersPerMonth.toLocaleString("pt-BR")} respostas automáticas por mês`}`,
    mlAccounts === 1 ? "1 conta do Mercado Livre" : `${mlAccounts} contas do Mercado Livre`,
    ...(plan.features.includes("pos_venda") ? [FEATURE_LABELS.pos_venda] : []),
    ...(listingImprovementsPerMonth ? [`${FEATURE_LABELS.melhorias_anuncio} (${listingImprovementsPerMonth} análises por mês)`] : []),
    SUPPORT_LABELS[plan.support].toLowerCase(),
  ]
  return `- **${plan.name}** — ${formatPrice(plan.priceMonthly)}/mês (no anual, ${formatPrice(monthlyPrice(plan, "annual"))}/mês): ${parts.join("; ")}.`
}

/**
 * /llms.txt: resumo em Markdown para assistentes de IA (ChatGPT, Claude, Gemini, Perplexity...) entenderem e citarem a
 * maanu com os fatos certos. Formato da proposta llmstxt.org.
 */
export function buildLlmsTxt(links: { signup: string; login: string }): string {
  const lines = [
    `# ${siteConfig.name}`,
    "",
    `> A ${siteConfig.name} é uma plataforma brasileira (SaaS) de respostas automáticas com inteligência artificial para vendedores do Mercado Livre. Ela lê o anúncio e as regras da loja e responde as perguntas dos compradores em segundos, 24 horas por dia. Teste grátis de ${siteConfig.trialDays} dias, sem cartão de crédito.`,
    "",
    `- Site: ${SALES_PAGE_URL}`,
    `- Empresa: ${siteConfig.name}, CNPJ ${companyInfo.cnpj} (Brasil)`,
    ...(companyInfo.whatsapp
      ? [`- WhatsApp e telefone: +55 ${formatWhatsapp(normalizeWhatsapp(companyInfo.whatsapp))}`]
      : []),
    ...(companyInfo.email ? [`- E-mail: ${companyInfo.email}`] : []),
    "- Idioma: português do Brasil",
    `- Atualizado em: ${SITE_CONTENT_UPDATED}`,
    "",
    "## O que a maanu faz",
    "",
    ...FEATURES.map((feature) => `- ${feature}.`),
    "",
    "## Como funciona",
    "",
    "1. O vendedor conecta a conta do Mercado Livre pela autorização oficial do Mercado Livre (a maanu nunca pede a senha).",
    "2. Uma configuração guiada pergunta como a loja funciona: garantia, prazo de envio, trocas, nota fiscal e o jeito de falar com o cliente.",
    "3. A IA passa a responder as perguntas em segundos; o vendedor acompanha tudo numa caixa de entrada e assume a conversa quando quiser.",
    "",
    "## Para quem é",
    "",
    "Vendedores do Mercado Livre no Brasil, de lojas pequenas a operações com várias contas, que perdem vendas por demorar a responder perguntas (principalmente à noite, nos fins de semana e nos feriados).",
    "",
    "## Planos e preços",
    "",
    ...SELLABLE_PLANS.map(planLine),
    "",
    `Todos os planos começam com ${siteConfig.trialDays} dias grátis com tudo do plano Pro, sem cartão. Sem taxa de adesão e sem fidelidade; cancelamento pelo próprio app. Pagamento por cartão de crédito, processado pela AbacatePay.`,
    "",
    "## Perguntas frequentes",
    "",
    ...FAQ.flatMap((item) => [`### ${item.question}`, "", item.answer, ""]),
    "## Links",
    "",
    `- [Página de vendas](${SALES_PAGE_URL}): o que a maanu faz, planos e perguntas frequentes`,
    `- [Planos e preços](${section("planos")})`,
    `- [Criar conta grátis](${links.signup})`,
    `- [Entrar](${links.login})`,
    `- [Termos de Uso](${absolute("/termos")})`,
    `- [Política de Privacidade](${absolute("/privacidade")})`,
    "",
  ]
  // Espaço comum no lugar do não separável que o Intl põe em "R$ 97" (texto puro para as IAs).
  return lines.join("\n").replace(/\u00a0/g, " ")
}
