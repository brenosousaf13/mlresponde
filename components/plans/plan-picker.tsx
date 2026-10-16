"use client"

import { CheckIcon, MinusIcon } from "lucide-react"

import { PlanActionButton, type PlanPickerBilling } from "@/components/plans/plan-action-button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNumber } from "@/lib/format"
import {
  formatPrice,
  SELLABLE_PLANS,
  SUPPORT_LABELS,
  type SellablePlan,
  type SellablePlanId,
} from "@/lib/plans/plans"
import { cn } from "@/lib/utils"

function planLines(plan: SellablePlan) {
  const accounts = plan.limits.mlAccounts
  const improvements = plan.limits.listingImprovementsPerMonth
  return [
    { included: true, text: `${formatNumber(plan.limits.answersPerMonth ?? 0)} respostas automáticas por mês` },
    { included: true, text: `${accounts} ${accounts === 1 ? "conta" : "contas"} do Mercado Livre` },
    { included: true, text: "IA nas perguntas completa: Assistente, ensinar, bloqueios" },
    { included: true, text: "Painel, Resultados e relatórios" },
    { included: plan.features.includes("pos_venda"), text: "Pós-venda com IA" },
    {
      included: Boolean(improvements),
      text: improvements ? `Melhorias de anúncio: ${improvements} análises por mês` : "Melhorias de anúncio",
    },
    { included: true, text: SUPPORT_LABELS[plan.support] },
  ]
}

/** Os 3 planos lado a lado (cobrança mensal). */
export function PlanPicker({
  currentPlanId,
  active,
  billing,
}: {
  /** Plano contratado (null = teste grátis, cortesia ou sem plano). */
  currentPlanId: SellablePlanId | null
  /** A assinatura está ativa (o plano atual aparece como "seu plano"). */
  active: boolean
  /** Contratação pela AbacatePay (botões de assinar, trocar e assinar de novo). */
  billing: PlanPickerBilling
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-right text-xs text-muted-foreground">Sem fidelidade. Troque de plano ou cancele quando quiser.</p>

      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        {SELLABLE_PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlanId
          return (
            <Card
              key={plan.id}
              className={cn(
                "relative",
                plan.highlight && "ring-2 ring-primary",
                isCurrent && !plan.highlight && "ring-2 ring-foreground/20"
              )}
            >
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  {isCurrent ? (
                    <Badge variant="secondary">{active ? "Seu plano" : "Plano escolhido"}</Badge>
                  ) : plan.highlight ? (
                    <Badge>Mais completo</Badge>
                  ) : null}
                </div>
                <CardDescription>{plan.tagline}</CardDescription>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold tracking-tight tabular-nums">{formatPrice(plan.priceMonthly)}</span>
                  <span className="text-sm text-muted-foreground">/mês</span>
                </div>
                <p className="text-xs text-muted-foreground">Cobrado todo mês no cartão de crédito</p>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="flex flex-col gap-2.5 text-sm">
                  {planLines(plan).map((line) => (
                    <li key={line.text} className={cn("flex items-start gap-2", !line.included && "text-muted-foreground")}>
                      {line.included ? (
                        <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                      ) : (
                        <MinusIcon className="mt-0.5 size-4 shrink-0" />
                      )}
                      <span className={cn(!line.included && "line-through decoration-muted-foreground/40")}>{line.text}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter className="flex-col items-stretch gap-1.5">
                <PlanActionButton
                  plan={plan}
                  billing={billing}
                  highlight={Boolean(plan.highlight)}
                  legacyCurrent={isCurrent && active}
                />
              </CardFooter>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
