import type { Metadata } from "next"

import { CertaintySection } from "@/components/site/certainty-section"
import { DailyRoutine } from "@/components/site/daily-routine"
import { FaqSection, FAQ } from "@/components/site/faq-section"
import { FinalCta } from "@/components/site/final-cta"
import { Hero } from "@/components/site/hero"
import { HowItWorks } from "@/components/site/how-it-works"
import { ListingReading } from "@/components/site/listing-reading"
import { MobileCtaBar } from "@/components/site/mobile-cta-bar"
import { PricingSection } from "@/components/site/pricing-section"
import { ProblemSection } from "@/components/site/problem-section"
import { QuestionTicker } from "@/components/site/question-ticker"
import { SavingsCalculator } from "@/components/site/savings-calculator"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import { siteConfig } from "@/lib/config/site"
import { SELLABLE_PLANS } from "@/lib/plans/plans"
import { appHref } from "@/lib/site/host"

const title = `${siteConfig.name} · IA que responde as perguntas do Mercado Livre por você`
const description = `A ${siteConfig.name} lê o seu anúncio e responde os compradores do Mercado Livre em segundos, 24 horas por dia, do jeito da sua loja. Teste grátis por ${siteConfig.trialDays} dias, sem cartão.`

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/" },
  openGraph: { type: "website", locale: "pt_BR", siteName: siteConfig.name, url: "/", title, description },
  twitter: { card: "summary_large_image", title, description },
}

/** Dados estruturados (Google): o produto, os planos e as perguntas frequentes. */
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: siteConfig.name,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: siteConfig.marketingUrl,
      description,
      offers: SELLABLE_PLANS.map((plan) => ({
        "@type": "Offer",
        name: plan.name,
        price: plan.priceMonthly,
        priceCurrency: "BRL",
      })),
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    },
  ],
}

export default function SalesPage() {
  const signupHref = appHref("/cadastro")
  const loginHref = appHref("/login")

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
      <SiteHeader signupHref={signupHref} loginHref={loginHref} />
      <main>
        <Hero signupHref={signupHref} />
        <QuestionTicker />
        <ProblemSection />
        <HowItWorks />
        <ListingReading />
        <CertaintySection />
        <DailyRoutine />
        <SavingsCalculator signupHref={signupHref} />
        <PricingSection signupHref={signupHref} />
        <FaqSection signupHref={signupHref} />
        <FinalCta signupHref={signupHref} />
      </main>
      <SiteFooter signupHref={signupHref} loginHref={loginHref} />
      <MobileCtaBar signupHref={signupHref} />
    </>
  )
}
