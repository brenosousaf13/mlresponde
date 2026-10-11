import { CoinsIcon, MoonStarIcon, PiggyBankIcon, TrendingUpIcon } from "lucide-react"

import { AssumptionsDialog } from "@/components/resultados/assumptions-dialog"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency, formatHours, formatNumber, formatWorkDays } from "@/lib/results/format"
import type { Assumptions, Savings } from "@/lib/results/metrics"

/** Destaque do topo: quanto a IA economizou no período, em dinheiro e em horas. */
export function ImpactHero({
  days,
  savings,
  assumptions,
  aiAnswers,
  lifetimeAi,
  offHoursAi,
  canEdit,
}: {
  days: number
  savings: Savings
  assumptions: Assumptions
  aiAnswers: number
  lifetimeAi: number
  offHoursAi: number
  canEdit: boolean
}) {
  const perAnswer = (assumptions.minutesPerAnswer / 60) * assumptions.hourlyCost
  const stats = [
    {
      icon: TrendingUpIcon,
      label: "No ritmo atual",
      value: `${formatCurrency(savings.yearlyAmount)} por ano`,
      hint: `cerca de ${formatCurrency(savings.monthlyAmount)} por mês`,
    },
    {
      icon: CoinsIcon,
      label: "Respostas da IA",
      value: formatNumber(aiAnswers),
      hint: lifetimeAi > aiAnswers ? `${formatNumber(lifetimeAi)} desde o início` : `nos últimos ${days} dias`,
    },
    {
      icon: MoonStarIcon,
      label: "Fora do horário comercial",
      value: formatNumber(offHoursAi),
      hint: "respondidas enquanto você descansava",
    },
  ]

  return (
    <Card className="relative bg-brand-navy text-white ring-0">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-24 size-96 rounded-full bg-brand-blue/50 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 left-1/4 size-80 rounded-full bg-brand-yellow/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgb(255_255_255/0.07)_1px,transparent_0)] bg-size-[18px_18px]"
      />
      <CardHeader className="relative gap-2">
        <CardDescription className="flex items-center gap-2 text-white/70">
          <PiggyBankIcon className="size-4" />
          Economia estimada com a IA · últimos {days} dias
        </CardDescription>
        <CardTitle className="text-4xl font-semibold tracking-tight text-brand-yellow tabular-nums sm:text-5xl">
          {formatCurrency(savings.amount)}
        </CardTitle>
        <p className="col-span-2 max-w-2xl text-sm text-white/80 sm:text-base">
          {aiAnswers > 0 ? (
            <>
              São <span className="font-semibold text-white">{formatHours(savings.hours)}</span> de atendimento que você
              não precisou fazer, o equivalente a{" "}
              <span className="font-semibold text-white">{formatWorkDays(savings.workDays)}</span> de trabalho.
            </>
          ) : (
            "Quando a IA começar a responder sozinha, a economia de tempo e dinheiro aparece aqui."
          )}
        </p>
        <CardAction>
          <AssumptionsDialog
            assumptions={assumptions}
            canEdit={canEdit}
            triggerClassName="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
          />
        </CardAction>
      </CardHeader>
      <CardContent className="relative">
        <dl className="grid gap-3 sm:grid-cols-3">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-lg bg-white/[0.07] px-3 py-2.5 ring-1 ring-white/10">
              <dt className="flex items-center gap-1.5 text-xs text-white/60">
                <stat.icon className="size-3.5" />
                {stat.label}
              </dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">{stat.value}</dd>
              <dd className="text-xs text-white/60">{stat.hint}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
      <CardFooter className="relative border-white/10 bg-black/15 text-xs text-white/60">
        Cálculo: {formatNumber(aiAnswers)} respostas da IA × {String(assumptions.minutesPerAnswer).replace(".", ",")} min ×{" "}
        {formatCurrency(assumptions.hourlyCost)}/h ({formatCurrency(perAnswer)} por resposta). É uma estimativa do seu
        tempo; não inclui as vendas que a resposta rápida ajuda a fechar.
      </CardFooter>
    </Card>
  )
}