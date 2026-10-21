import { Check, Minus } from "lucide-react"

import { siteConfig } from "@/lib/config/site"
import { formatBRL, formatInteger, pricePerDay } from "@/lib/site/calculator"
import {
  FEATURE_LABELS,
  SELLABLE_PLANS,
  SUPPORT_LABELS,
  formatPrice,
  type SellablePlan,
} from "@/lib/plans/plans"
import { cn } from "@/lib/utils"

import { Headline } from "./headline"
import { Container } from "./primitives"
import { Reveal } from "./reveal"
import { SiteButton } from "./site-button"

type Line = { text: string; included: boolean; isNew?: boolean; href?: string }

function planLines(plan: SellablePlan): Line[] {
  const { answersPerMonth, mlAccounts, listingImprovementsPerMonth } = plan.limits
  return [
    { text: `${formatInteger(answersPerMonth ?? 0)} respostas automáticas por mês`, included: true },
    { text: mlAccounts === 1 ? "1 conta do Mercado Livre" : `${mlAccounts} contas do Mercado Livre`, included: true },
    { text: "Assistente de IA, caixa de entrada e Resultados", included: true },
    { text: "Recuperador de devoluções", included: true, isNew: true, href: "#recuperar" },
    { text: "Escudo de Reputação", included: true, isNew: true, href: "#reputacao" },
    { text: FEATURE_LABELS.pos_venda, included: plan.features.includes("pos_venda") },
    {
      text: listingImprovementsPerMonth
        ? `${FEATURE_LABELS.melhorias_anuncio}: ${listingImprovementsPerMonth} análises por mês`
        : FEATURE_LABELS.melhorias_anuncio,
      included: Boolean(listingImprovementsPerMonth),
    },
    { text: SUPPORT_LABELS[plan.support], included: true },
  ]
}

export function PricingSection({ signupHref }: { signupHref: string }) {
  const cheapest = SELLABLE_PLANS[0]

  return (
    <section id="planos" aria-labelledby="planos-title" data-nav="light" className="relative scroll-mt-24 bg-brand-offwhite py-24 text-brand-graphite sm:py-36">
      <div aria-hidden className="light-grid pointer-events-none absolute inset-0 opacity-50 [mask-image:linear-gradient(#000,transparent_45%)]" />
      <Container className="relative max-w-7xl">
        <div className="mx-auto max-w-4xl text-center">
          <p className="font-mono text-xs tracking-[0.2em] text-brand-teal-ink uppercase">Planos</p>
          <Headline id="planos-title" as="h2" className="mt-5 font-display text-[2.4rem] leading-[1] font-semibold tracking-[-0.04em] sm:text-6xl">
            {formatBRL(pricePerDay(cheapest))} por dia pra nunca mais deixar comprador no vácuo
          </Headline>
          <Reveal delay={100}>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-pretty text-slate-600">
              Sem taxa de adesão e sem fidelidade. Todo plano começa com {siteConfig.trialDays} dias grátis com tudo do Pro, e você
              só cadastra o cartão se decidir continuar.
            </p>
          </Reveal>
        </div>

        <div className="mt-14 grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
          {SELLABLE_PLANS.map((plan, i) => {
            const highlight = Boolean(plan.highlight)
            return (
              <Reveal key={plan.id} delay={i * 90} className="h-full">
                <article
                  aria-labelledby={`plano-${plan.id}`}
                  className={cn(
                    "relative flex h-full flex-col rounded-[1.75rem] border p-7 transition-transform duration-300 hover:-translate-y-1",
                    highlight
                      ? "border-transparent bg-brand-night text-white shadow-[0_40px_90px_-40px] shadow-brand-teal/60 ring-1 ring-brand-teal/40"
                      : "border-brand-graphite/10 bg-white"
                  )}
                >
                  {highlight ? (
                    <span className="absolute -top-3 left-7 rounded-full bg-brand-teal px-3 py-1 text-xs font-semibold text-brand-graphite">
                      Recomendado
                    </span>
                  ) : null}
                  <h3 id={`plano-${plan.id}`} className="font-display text-2xl font-semibold tracking-tight">
                    {plan.name}
                  </h3>
                  <p className={cn("mt-1 text-sm", highlight ? "text-white/60" : "text-slate-500")}>{plan.tagline}</p>

                  <p className="mt-7 flex items-baseline gap-1">
                    <span className="font-display text-5xl font-semibold tracking-[-0.04em] tabular-nums">{formatPrice(plan.priceMonthly)}</span>
                    <span className={highlight ? "text-white/60" : "text-slate-500"}>/mês</span>
                  </p>
                  <p className={cn("mt-1 h-5 text-sm", highlight ? "text-white/55" : "text-slate-500")}>cobrado todo mês</p>

                  <SiteButton href={signupHref} variant={highlight ? "teal" : "graphite"} block className="mt-7">
                    Testar grátis por {siteConfig.trialDays} dias
                  </SiteButton>

                  <ul className="mt-8 flex flex-col gap-3 text-sm">
                    {planLines(plan).map((line) => (
                      <li key={line.text} className={cn("flex items-start gap-2.5", !line.included && (highlight ? "text-white/55" : "text-slate-500"))}>
                        {line.included ? (
                          <Check className={cn("mt-0.5 size-4 shrink-0", highlight ? "text-brand-mint" : "text-brand-teal-ink")} aria-hidden />
                        ) : (
                          <Minus className="mt-0.5 size-4 shrink-0" aria-hidden />
                        )}
                        <span>
                          {line.included ? null : <span className="sr-only">Não inclui: </span>}
                          {line.text}
                          {line.isNew ? (
                            <a
                              href={line.href}
                              className={cn(
                                "ml-2 inline-block rounded-full px-1.5 py-px align-[1px] text-[10px] font-semibold tracking-wide uppercase",
                                highlight ? "bg-brand-teal text-brand-graphite" : "bg-brand-sage text-brand-teal-ink"
                              )}
                            >
                              Novo
                            </a>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              </Reveal>
            )
          })}
        </div>
      </Container>
    </section>
  )
}