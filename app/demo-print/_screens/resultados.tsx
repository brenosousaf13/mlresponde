import { PageHeader } from "@/components/app/page-header"
import { DailyChart } from "@/components/resultados/daily-chart"
import { ImpactHero } from "@/components/resultados/impact-hero"
import { PeriodToggle } from "@/components/resultados/period-toggle"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { estimateSavings, fillDaily, type DailyRow } from "@/lib/results/metrics"

const DAYS = 30
const ASSUMPTIONS = { minutesPerAnswer: 3, hourlyCost: 20 }

/** Perguntas por dia nos últimos 30 dias (inventadas, com mais movimento no fim de semana e à noite). */
function demoRows(): DailyRow[] {
  const rows: DailyRow[] = []
  const today = new Date()
  for (let i = DAYS - 1; i >= 0; i--) {
    const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i))
    const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6
    const wave = Math.round(8 * Math.sin(i / 2.3) + 6 * Math.cos(i / 4.1))
    const total = 58 + wave + (weekend ? 16 : 0) + Math.round(i / 3)
    const human = Math.max(3, Math.round(total * 0.09))
    const open = i === 0 ? 1 : 0
    rows.push({ day: date.toISOString().slice(0, 10), total, ai: total - human - open, human, open })
  }
  return rows
}

export function ResultsScreen() {
  const rows = demoRows()
  const startDay = rows[0].day
  const aiAnswers = rows.reduce((total, row) => total + row.ai, 0)
  const savings = estimateSavings({ answers: aiAnswers, days: DAYS, ...ASSUMPTIONS })
  return (
    <>
      <PageHeader
        title="Resultados"
        description="O que a IA fez pela sua loja, quanto isso vale e onde ela ainda pode ajudar."
        actions={<PeriodToggle value={DAYS} />}
      />
      <ImpactHero
        days={DAYS}
        savings={savings}
        assumptions={ASSUMPTIONS}
        aiAnswers={aiAnswers}
        lifetimeAi={Math.round(aiAnswers * 3.4)}
        offHoursAi={Math.round(aiAnswers * 0.46)}
        canEdit={false}
      />
      <Card>
        <CardHeader>
          <CardTitle>Perguntas por dia</CardTitle>
          <CardDescription>Quem respondeu cada pergunta, dia a dia, nos últimos {DAYS} dias.</CardDescription>
        </CardHeader>
        <CardContent>
          <DailyChart points={fillDaily(rows, startDay, DAYS)} />
        </CardContent>
      </Card>
    </>
  )
}