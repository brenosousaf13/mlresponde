import {
  BotIcon,
  HourglassIcon,
  MessageCircleQuestionIcon,
  MinusIcon,
  TimerIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDuration } from "@/lib/format"
import { formatFactor, formatHours, formatNumber, formatPercentChange } from "@/lib/results/format"
import {
  BUSINESS_HOURS_SHORT,
  percentChange,
  share,
  speedFactor,
  type HoursSummary,
  type OverviewTotals,
  type SpeedRow,
} from "@/lib/results/metrics"
import { cn } from "@/lib/utils"

type Kpi = {
  label: string
  icon: LucideIcon
  value: string
  badge?: { text: string; icon: LucideIcon; className?: string } | null
  headline: React.ReactNode
  detail: React.ReactNode
}

function TrendBadge({ change }: { change: number | null }) {
  if (change === null) return null
  const Icon = change > 0 ? TrendingUpIcon : change < 0 ? TrendingDownIcon : MinusIcon
  return (
    <Badge variant="outline">
      <Icon data-icon="inline-start" />
      {formatPercentChange(change)}
    </Badge>
  )
}

/** Os quatro números principais, no estilo dos cards do dashboard do shadcn. */
export function KpiCards({
  current,
  previous,
  speed,
  hours,
}: {
  current: OverviewTotals
  previous: OverviewTotals
  speed: SpeedRow[]
  hours: HoursSummary
}) {
  const answered = current.ai + current.manual + current.external
  const awaiting = current.open
  const aiRate = share(current.ai, current.total)
  const previousAiRate = share(previous.ai, previous.total)
  const rateDelta = previous.total > 0 ? aiRate - previousAiRate : null
  const factor = speedFactor(current.aiMedianSeconds, current.humanMedianSeconds)
  const fastAi = speed.find((row) => row.bucket === 0)?.ai ?? 0
  const fastShare = share(fastAi, current.aiTimed)

  const kpis: (Kpi & { trend?: number | null })[] = [
    {
      label: "Perguntas recebidas",
      icon: MessageCircleQuestionIcon,
      value: formatNumber(current.total),
      trend: percentChange(current.total, previous.total),
      headline: `${formatNumber(answered)} respondidas no período`,
      detail:
        awaiting > 0 ? (
          <Link href="/perguntas" className="font-medium text-amber-700 hover:underline dark:text-amber-400">
            {formatNumber(awaiting)} aguardando você
          </Link>
        ) : (
          "Nenhuma aguardando você"
        ),
    },
    {
      label: "Respondidas pela IA",
      icon: BotIcon,
      value: formatNumber(current.ai),
      badge: current.total > 0 ? { text: `${aiRate}% do total`, icon: ZapIcon, className: "border-primary/30 text-primary" } : null,
      headline:
        rateDelta === null
          ? "Sem você precisar fazer nada"
          : rateDelta === 0
            ? "Mesma automação do período anterior"
            : `${rateDelta > 0 ? "+" : ""}${rateDelta} pontos de automação`,
      detail: rateDelta === null ? "Comparação aparece no próximo período" : `Antes: ${previousAiRate}% das perguntas`,
    },
    {
      label: "Tempo de resposta da IA",
      icon: TimerIcon,
      value: formatDuration(current.aiMedianSeconds),
      badge: factor
        ? {
            text: `${formatFactor(factor)} mais rápida`,
            icon: ZapIcon,
            className: "border-emerald-600/30 text-emerald-700 dark:text-emerald-400",
          }
        : null,
      headline:
        current.humanMedianSeconds !== null
          ? `Você leva ${formatDuration(current.humanMedianSeconds)}`
          : "Sem respostas suas para comparar",
      detail: current.aiTimed > 0 ? `${fastShare}% delas em até 1 minuto` : "Metade das respostas sai nesse tempo",
    },
    {
      label: "Espera evitada",
      icon: HourglassIcon,
      value: formatHours(hours.waitAvoidedHours),
      headline:
        hours.offHoursAi > 0
          ? `${formatHours(hours.waitAvoidedHours / hours.offHoursAi)} a menos por comprador`
          : "Nenhuma resposta da IA fora do horário",
      detail: `Noites e fins de semana (fora de ${BUSINESS_HOURS_SHORT})`,
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi) => (
        <Card key={kpi.label} className="bg-linear-to-t from-primary/[0.04] to-card">
          <CardHeader>
            <CardDescription className="flex items-center gap-2">
              <kpi.icon className="size-4" />
              {kpi.label}
            </CardDescription>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <CardTitle className="text-3xl font-semibold whitespace-nowrap tabular-nums">{kpi.value}</CardTitle>
              {kpi.trend !== undefined ? (
                <TrendBadge change={kpi.trend} />
              ) : kpi.badge ? (
                <Badge variant="outline" className={cn(kpi.badge.className)}>
                  <kpi.badge.icon data-icon="inline-start" />
                  {kpi.badge.text}
                </Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardFooter className="mt-auto flex-col items-start gap-1 border-t-0 bg-transparent pt-0 text-sm">
            <p className="font-medium">{kpi.headline}</p>
            <p className="text-muted-foreground">{kpi.detail}</p>
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}