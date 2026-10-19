import { CrownIcon, GaugeIcon, InfoIcon, ShieldIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDate, formatNumber } from "@/lib/format"
import { slackSentence, type MetricSlack, type ReputationReading, type ReputationSlack } from "@/lib/reputation/metrics"
import {
  BAND_BAR,
  COLOR_BADGE,
  COLOR_TITLES,
  THERMOMETER,
  formatRate,
  powerSellerLabel,
} from "@/lib/reputation/presentation"
import { BAND_LABELS, COLOR_LABELS, METRIC_LABELS, MIN_SALES_FOR_REPUTATION } from "@/lib/reputation/thresholds"
import { cn } from "@/lib/utils"

/** Termômetro do ML com a folga de cada métrica (quantos problemas cabem antes de cair de cor). */
export function ThermometerCard({
  reading,
  slack,
  className,
}: {
  reading: ReputationReading
  slack: ReputationSlack
  className?: string
}) {
  const leader = powerSellerLabel(reading.powerSellerStatus)
  const period = reading.periodDays
  return (
    <Card className={cn("bg-linear-to-t from-primary/[0.04] to-card", className)}>
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          <GaugeIcon className="size-4" />
          Termômetro do Mercado Livre
        </CardDescription>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-2xl font-semibold">{COLOR_TITLES[reading.color]}</CardTitle>
          {leader ? (
            <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-300">
              <CrownIcon />
              {leader}
            </Badge>
          ) : null}
          {reading.protected ? (
            <Badge variant="outline" className="gap-1">
              <ShieldIcon />
              Protegida
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Thermometer color={reading.color} />
        <p className="text-sm text-muted-foreground">
          {period ? "Medida pelos últimos " + period + " dias" : "Período de medição não informado"} ·{" "}
          {formatNumber(reading.salesCompleted)} {reading.salesCompleted === 1 ? "venda concluída" : "vendas concluídas"}
        </p>

        {slack.gray ? (
          <Alert>
            <InfoIcon />
            <AlertTitle>Sua conta ainda não tem cor</AlertTitle>
            <AlertDescription>
              A reputação começa a contar com {MIN_SALES_FOR_REPUTATION} vendas concluídas nos últimos 365 dias
              {slack.salesToStart ? " (faltam " + slack.salesToStart + ")" : ""}. Sem cor, os anúncios não aparecem nas primeiras
              posições das buscas.
            </AlertDescription>
          </Alert>
        ) : null}

        {reading.protected ? (
          <Alert>
            <ShieldIcon />
            <AlertTitle>
              Reputação protegida{reading.protectionEndDate ? " até " + formatDate(reading.protectionEndDate) : ""}
            </AlertTitle>
            <AlertDescription>
              O ML mostra {COLOR_LABELS[reading.color]} enquanto durar a proteção. Os números abaixo são os reais
              {reading.realColor && reading.realColor !== "none" ? ": hoje a cor real é " + COLOR_LABELS[reading.realColor] : ""}.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-3 md:grid-cols-3">
          {slack.metrics.map((metric) => (
            <MetricTile key={metric.key} metric={metric} gray={slack.gray} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function Thermometer({ color }: { color: ReputationReading["color"] }) {
  return (
    <div className="flex flex-col gap-2" role="img" aria-label={"Termômetro: " + COLOR_TITLES[color]}>
      <div className="flex items-center gap-1.5">
        {THERMOMETER.map((segment) => {
          const active = segment.color === color
          return (
            <div
              key={segment.color}
              className={cn(
                "h-3 flex-1 rounded-full transition-all",
                segment.className,
                active ? "h-4 shadow-sm ring-2 ring-foreground/70 ring-offset-2 ring-offset-card" : "opacity-25"
              )}
            />
          )
        })}
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>Vermelho</span>
        <span>Verde</span>
      </div>
    </div>
  )
}

function MetricTile({ metric, gray }: { metric: MetricSlack; gray: boolean }) {
  const labels = METRIC_LABELS[metric.key]
  const fill = metric.limit ? Math.min(100, Math.round((metric.rate / metric.limit) * 100)) : 100
  const sentence = gray ? null : slackSentence(metric, labels)
  const improve =
    metric.toImprove && metric.improvesTo
      ? "Para voltar ao " +
        BAND_LABELS[metric.improvesTo] +
        ", " +
        metric.toImprove +
        " " +
        (metric.toImprove === 1 ? labels.singular + " precisa" : labels.plural + " precisam") +
        " sair da conta (ou as vendas sem problema crescerem)."
      : null
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{labels.title}</p>
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", COLOR_BADGE[metric.band])}>
          {BAND_LABELS[metric.band]}
        </span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-2xl font-semibold tabular-nums">{formatRate(metric.rate)}</span>
        <span className="text-xs text-muted-foreground">
          {formatNumber(metric.value)} de {formatNumber(metric.base)} vendas{metric.approximate ? " (aprox.)" : ""}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className={cn("h-full rounded-full", BAND_BAR[metric.band])} style={{ width: Math.max(fill, metric.value ? 4 : 0) + "%" }} />
        </div>
        {metric.limit !== null ? (
          <span className="text-[11px] text-muted-foreground">Limite da cor atual: {formatRate(metric.limit)}</span>
        ) : null}
      </div>
      {sentence ? (
        <p className={cn("text-sm font-medium", metric.slack !== null && metric.slack <= 1 ? "text-red-700 dark:text-red-300" : "")}>
          {sentence}
          {metric.approximate ? " (aprox.)" : ""}
        </p>
      ) : null}
      {gray ? <p className="text-sm text-muted-foreground">A folga aparece quando a conta ganhar cor.</p> : null}
      {improve ? <p className="text-sm text-muted-foreground">{improve}</p> : null}
      {metric.leaderSlack !== null ? (
        <p className="text-xs text-muted-foreground">
          MercadoLíder: {metric.leaderSlack === 0 ? "sem folga" : "folga de " + metric.leaderSlack} até perder a medalha.
        </p>
      ) : null}
    </div>
  )
}
