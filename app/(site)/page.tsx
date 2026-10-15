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
import { SavingsCalculator } from "@/components/site/savings-calculator"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import { siteConfig } from "@/lib/config/site"
import { appHref } from "@/lib/site/host"
import { SEO_DESCRIPTION, SEO_IMAGE, SEO_TITLE, structuredDataJson } from "@/lib/site/seo"

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
  alternates: { canonical: "/", languages: { "pt-BR": "/", "x-default": "/" } },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large", "max-video-preview": -1 },
  },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: siteConfig.name,
    url: "/",
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
