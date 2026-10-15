"use client"

import { Check, Minus } from "lucide-react"
import { useState } from "react"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { siteConfig } from "@/lib/config/site"
import { formatBRL, formatInteger, pricePerDay } from "@/lib/site/calculator"
import {
  FEATURE_LABELS,
  SELLABLE_PLANS,
  SUPPORT_LABELS,
  formatPrice,
  monthlyPrice,
  type BillingCycle,
  type SellablePlan,
} from "@/lib/plans/plans"
import { cn } from "@/lib/utils"

import { Container, Eyebrow, SectionTitle } from "./primitives"
import { Reveal } from "./reveal"
import { SiteButton } from "./site-button"

type Line = { text: string; included: boolean }

function planLines(plan: SellablePlan): Line[] {
  const { answersPerMonth, mlAccounts, listingImprovementsPerMonth } = plan.limits
  return [
    { text: `${formatInteger(answersPerMonth ?? 0)} respostas automáticas por mês`, included: true },
    { text: mlAccounts === 1 ? "1 conta do Mercado Livre" : `${mlAccounts} contas do Mercado Livre`, included: true },
    { text: "Assistente de IA, caixa de entrada e Resultados", included: true },
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
  const [cycle, setCycle] = useState<BillingCycle>("monthly")
  const cheapest = SELLABLE_PLANS[0]

  return (
    <section id="planos" aria-labelledby="planos-title" className="scroll-mt-24 pt-20 pb-4 sm:pt-28 sm:pb-6">
      <Container>
        <Reveal className="mx-auto max-w-4xl text-center">
          <Eyebrow>Planos</Eyebrow>
          <SectionTitle id="planos-title" className="mt-5">
            {formatBRL(pricePerDay(cheapest))} por dia{" "}
            <span className="text-muted-foreground">pra nunca mais deixar comprador no vácuo.</span>
          </SectionTitle>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-pretty text-muted-foreground">
            Sem taxa de adesão e sem fidelidade. Todo plano começa com {siteConfig.trialDays} dias grátis com tudo do Pro, e
            você só cadastra o cartão se decidir continuar.
          </p>

          <ToggleGroup
            aria-label="Forma de pagamento"
            value={[cycle]}
            onValueChange={(next) => {
              const choice = next[0]
              if (choice === "monthly" || choice === "annual") setCycle(choice)
            }}
            spacing={0}
            className="mx-auto mt-9 rounded-full border border-border bg-white p-1 shadow-sm"
          >
            <ToggleGroupItem
              value="monthly"
              className="h-10 rounded-full! px-5 text-sm aria-pressed:bg-brand-graphite aria-pressed:text-white aria-pressed:hover:bg-brand-graphite aria-pressed:hover:text-white"
            >
              Mensal
            </ToggleGroupItem>
            <ToggleGroupItem
              value="annual"
              className="h-10 gap-2 rounded-full! px-5 text-sm aria-pressed:bg-brand-graphite aria-pressed:text-white aria-pressed:hover:bg-brand-graphite aria-pressed:hover:text-white"
            >
              Anual
              <span className="rounded-full bg-brand-sage px-2 py-0.5 text-[11px] font-semibold text-brand-teal-ink">
                2 meses grátis
              </span>
            </ToggleGroupItem>
          </ToggleGroup>
        </Reveal>

        <div className="mt-12 grid items-stretch gap-4 lg:grid-cols-3">
          {SELLABLE_PLANS.map((plan, i) => {
            const highlight = Boolean(plan.highlight)
            return (
              <Reveal key={plan.id} delay={i * 90} className="h-full">
                <article
                  aria-labelledby={`plano-${plan.id}`}
                  className={cn(
                    "relative flex h-full flex-col rounded-[1.75rem] border p-7",
                    highlight
                      ? "border-transparent bg-brand-night text-white shadow-[0_40px_90px_-40px] shadow-brand-teal/60 ring-1 ring-brand-teal/40"
                      : "border-border bg-white"
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
                  <p className={cn("mt-1 text-sm", highlight ? "text-white/60" : "text-muted-foreground")}>{plan.tagline}</p>

                  <p className="mt-7 flex items-baseline gap-1">
                    <span className="font-display text-5xl font-semibold tracking-[-0.04em] tabular-nums">
                      {formatPrice(monthlyPrice(plan, cycle))}
                    </span>
                    <span className={highlight ? "text-white/60" : "text-muted-foreground"}>/mês</span>
                  </p>
                  <p className={cn("mt-1 h-5 text-sm", highlight ? "text-white/55" : "text-muted-foreground")}>
                    {cycle === "annual" ? `${formatPrice(plan.priceAnnual)} cobrados uma vez por ano` : "cobrado todo mês"}
                  </p>

                  <SiteButton href={signupHref} variant={highlight ? "teal" : "graphite"} block className="mt-7">
                    Testar grátis por {siteConfig.trialDays} dias
                  </SiteButton>

                  <ul className="mt-8 flex flex-col gap-3 text-sm">
                    {planLines(plan).map((line) => (
                      <li
                        key={line.text}
                        className={cn(
                          "flex items-start gap-2.5",
                          !line.included && (highlight ? "text-white/55" : "text-muted-foreground")
                        )}
                      >
                        {line.included ? (
                          <Check
                            className={cn("mt-0.5 size-4 shrink-0", highlight ? "text-brand-mint" : "text-brand-teal-ink")}
                            aria-hidden
                          />
                        ) : (
                          <Minus className="mt-0.5 size-4 shrink-0" aria-hidden />
                        )}
                        <span>
                          {line.included ? null : <span className="sr-only">Não inclui: </span>}
                          {line.text}
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
