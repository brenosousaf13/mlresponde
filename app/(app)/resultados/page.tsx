import { ChartColumnIncreasingIcon, ZapIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { AccountSelect } from "@/components/app/account-select"
import { PageHeader } from "@/components/app/page-header"
import { DailyChart } from "@/components/resultados/daily-chart"
import { HoursHeatmap } from "@/components/resultados/hours-heatmap"
import { ImpactHero } from "@/components/resultados/impact-hero"
import { ImproveCard } from "@/components/resultados/improve-card"
import { KpiCards } from "@/components/resultados/kpi-cards"
import { PeriodToggle } from "@/components/resultados/period-toggle"
import { SpeedChart } from "@/components/resultados/speed-chart"
import { TopicsCard } from "@/components/resultados/topics-card"
import { TopItemsCard } from "@/components/resultados/top-items-card"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { canManageOrganization, requireSection } from "@/lib/dal/app-context"
import { getResultsData } from "@/lib/dal/results"
import { formatDuration } from "@/lib/format"
import { formatFactor, formatNumber } from "@/lib/results/format"
import {
  BUSINESS_HOURS_LABEL,
  WEEKDAYS,
  estimateSavings,
  fillDaily,
  parsePeriod,
  speedDistribution,
  speedFactor,
  summarizeHours,
} from "@/lib/results/metrics"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Resultados" }

export default async function ResultsPage({ searchParams }: PageProps<"/resultados">) {
  const context = await requireSection("resultados")
  const params = await searchParams
  const days = parsePeriod(params.periodo)
  const organizationId = context.organization.id

  const supabase = await createClient()
  const { data: accountRows, error: accountsError } = await supabase
    .from("ml_accounts")
    .select("id, nickname, ml_user_id")
    .eq("organization_id", organizationId)
    .order("created_at")
  if (accountsError) throw accountsError
  const accounts = accountRows.map((account) => ({
    id: account.id,
    nickname: account.nickname || `Conta ${account.ml_user_id}`,
  }))
  const accountId =
    typeof params.conta === "string" && accounts.some((account) => account.id === params.conta) ? params.conta : null

  const { range, overview, topics, topicsSampled, assumptions } = await getResultsData(organizationId, {
    days,
    accountId,
  })
  const { current, previous } = overview
  const hours = summarizeHours(overview.hours)
  const savings = estimateSavings({ answers: current.ai, days, ...assumptions })
  const daily = fillDaily(overview.daily, range.startDay, days)
  const speedPoints = speedDistribution(overview.speed)
  const factor = speedFactor(current.aiMedianSeconds, current.humanMedianSeconds)
  const hasHumanTimes = current.humanTimed > 0

  const header = (
    <PageHeader
      title="Resultados"
      description="O que a IA fez pela sua loja, quanto isso vale e onde ela ainda pode ajudar."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {accounts.length > 1 ? <AccountSelect accounts={accounts} value={accountId} allowAll resetParams={[]} /> : null}
          <PeriodToggle value={days} />
        </div>
      }
    />
  )

  if (current.total === 0) {
    return (
      <>
        {header}
        <Card>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ChartColumnIncreasingIcon />
              </EmptyMedia>
              <EmptyTitle>Nenhuma pergunta nos últimos {days} dias</EmptyTitle>
              <EmptyDescription>
                {overview.lifetimeAi > 0
                  ? `A IA já respondeu ${formatNumber(overview.lifetimeAi)} perguntas desde o início. Escolha um período maior para ver os números.`
                  : "Assim que seus anúncios receberem perguntas, os números de tempo, economia e produtos aparecem aqui."}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="flex-row justify-center gap-2">
              {days < 90 ? (
                <Link href="/resultados?periodo=90" className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Ver 90 dias
                </Link>
              ) : null}
              <Link href="/assistente" className={buttonVariants({ size: "sm" })}>
                Configurar o Assistente de IA
              </Link>
            </EmptyContent>
          </Empty>
        </Card>
      </>
    )
  }

  return (
    <>
      {header}

      <ImpactHero
        days={days}
        savings={savings}
        assumptions={assumptions}
        aiAnswers={current.ai}
        lifetimeAi={overview.lifetimeAi}
        offHoursAi={hours.offHoursAi}
        canEdit={canManageOrganization(context.role)}
      />

      <KpiCards current={current} previous={previous} speed={overview.speed} hours={hours} />

      <Card>
        <CardHeader>
          <CardTitle>Perguntas por dia</CardTitle>
          <CardDescription>Quem respondeu cada pergunta, dia a dia, nos últimos {days} dias.</CardDescription>
        </CardHeader>
        <CardContent>
          <DailyChart points={daily} />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Velocidade de resposta</CardTitle>
            <CardDescription>
              Quem recebe resposta rápida tem mais chance de comprar com você, e não no concorrente.
            </CardDescription>
            {factor ? (
              <CardAction>
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-sage/60 px-2.5 py-1 text-xs font-medium text-brand-teal-ink ring-1 ring-brand-teal/25 dark:bg-brand-teal/10">
                  <ZapIcon className="size-3.5" />
                  {formatFactor(factor)} mais rápida
                </span>
              </CardAction>
            ) : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-primary/5 px-3 py-2.5 ring-1 ring-primary/15">
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-2 rounded-full bg-chart-1" />
                  IA (metade das respostas em até)
                </dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums">{formatDuration(current.aiMedianSeconds)}</dd>
              </div>
              <div className="rounded-lg bg-slate-500/5 px-3 py-2.5 ring-1 ring-slate-500/15">
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-2 rounded-full bg-chart-2" />
                  Você (metade das respostas em até)
                </dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums">
                  {formatDuration(current.humanMedianSeconds)}
                </dd>
              </div>
            </dl>
            {current.aiTimed + current.humanTimed > 0 ? (
              <SpeedChart points={speedPoints} showHuman={hasHumanTimes} />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">Ainda não há respostas no período.</p>
            )}
          </CardContent>
          <CardFooter className="text-xs text-muted-foreground">
            Conta só as perguntas que chegaram na hora; as antigas, importadas ao conectar a conta, ficam de fora.
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quando os compradores perguntam</CardTitle>
            <CardDescription>
              {hours.offHoursShare}% das perguntas chegam fora do horário comercial ({BUSINESS_HOURS_LABEL}). É aí que
              a IA mais faz diferença.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-5">
            <HoursHeatmap matrix={hours.matrix} aiMatrix={hours.aiMatrix} max={hours.max} />
            <dl className="mt-auto grid grid-cols-3 gap-3">
              {[
                { label: "Fora do horário", value: hours.offHoursShare },
                { label: "Noites (dias úteis)", value: hours.weekdayNightShare },
                { label: "Fins de semana", value: hours.weekendShare },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg bg-muted/60 px-3 py-2.5">
                  <dt className="text-xs text-muted-foreground">{stat.label}</dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums">{stat.value}%</dd>
                </div>
              ))}
            </dl>
          </CardContent>
          <CardFooter className="justify-between gap-3 text-xs text-muted-foreground">
            <span>
              {hours.peak
                ? `Horário de pico: ${WEEKDAYS[hours.peak.dow - 1]}, das ${hours.peak.hour}h às ${(hours.peak.hour + 1) % 24}h`
                : "Sem pico definido"}
            </span>
            <span>{formatNumber(hours.offHoursAi)} respondidas pela IA fora do horário</span>
          </CardFooter>
        </Card>
      </div>

      <TopItemsCard items={overview.items} total={current.total} improvementsIncluded={context.features.melhorias_anuncio} />

      <div className="grid gap-4 xl:grid-cols-2">
        <TopicsCard topics={topics.topics} total={topics.total} sampled={topicsSampled} />
        <ImproveCard causes={overview.causes} aiAnswers={current.ai} total={current.total} />
      </div>
    </>
  )
}
