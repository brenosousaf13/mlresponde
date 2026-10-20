import type { Metadata } from "next"

import { CertaintySection } from "@/components/site/certainty-section"
import { DailyRoutine } from "@/components/site/daily-routine"
import { FaqSection } from "@/components/site/faq-section"
import { FinalCta } from "@/components/site/final-cta"
import { Hero } from "@/components/site/hero"
import { HowItWorks } from "@/components/site/how-it-works"
import { ListingReading } from "@/components/site/listing-reading"
import { MobileCtaBar } from "@/components/site/mobile-cta-bar"
import { PricingSection } from "@/components/site/pricing-section"
import { ProblemSection } from "@/components/site/problem-section"
import { QuestionTicker } from "@/components/site/question-ticker"
import { ReputationSection } from "@/components/site/reputation-section"
import { SavingsCalculator } from "@/components/site/savings-calculator"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import { siteConfig } from "@/lib/config/site"
import { SALES_PAGE_PATH, appHref } from "@/lib/site/host"
import { SALES_PAGE_INDEXABLE, SEO_DESCRIPTION, SEO_IMAGE, SEO_TITLE, structuredDataJson } from "@/lib/site/seo"

/** Verificação do Google Search Console e do Bing Webmaster Tools por meta tag (opcional; o DNS também serve). */
const verification = {
  ...(process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : {}),
  ...(process.env.BING_SITE_VERIFICATION ? { other: { "msvalidate.01": process.env.BING_SITE_VERIFICATION } } : {}),
}

export const metadata: Metadata = {
  title: { absolute: SEO_TITLE },
  description: SEO_DESCRIPTION,
  applicationName: siteConfig.name,
  category: "business",
  alternates: { canonical: SALES_PAGE_PATH, languages: { "pt-BR": SALES_PAGE_PATH, "x-default": SALES_PAGE_PATH } },
  // SALES_PAGE_INDEXABLE (lib/site/seo.ts): false tira a página do Google sem tirá-la do ar.
  robots: {
    index: SALES_PAGE_INDEXABLE,
    follow: true,
    googleBot: {
      index: SALES_PAGE_INDEXABLE,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: siteConfig.name,
    url: SALES_PAGE_PATH,
    title: SEO_TITLE,
    description: SEO_DESCRIPTION,
    images: [{ ...SEO_IMAGE, type: "image/jpeg" }],
  },
  twitter: { card: "summary_large_image", title: SEO_TITLE, description: SEO_DESCRIPTION, images: [{ ...SEO_IMAGE }] },
  ...(Object.keys(verification).length ? { verification } : {}),
}

export default function SalesPage() {
  const signupHref = appHref("/cadastro")
  const loginHref = appHref("/login")

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: structuredDataJson() }}
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
        <ReputationSection signupHref={signupHref} />
        <PricingSection signupHref={signupHref} />
        <SavingsCalculator signupHref={signupHref} />
        <FaqSection signupHref={signupHref} />
        <FinalCta signupHref={signupHref} />
      </main>
      <SiteFooter signupHref={signupHref} loginHref={loginHref} />
      <MobileCtaBar signupHref={signupHref} />
    </>
  )
}
