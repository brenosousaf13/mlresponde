import { BotIcon, CoinsIcon, GaugeIcon, TriangleAlertIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { OrgStatusBadge } from "@/components/admin/badges"
import { DailyChart } from "@/components/admin/daily-chart"
import { StatCard } from "@/components/admin/stat-card"
import { PageHeader } from "@/components/app/page-header"
import { PeriodToggle } from "@/components/resultados/period-toggle"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  formatBrl,
  formatInteger,
  formatMs,
  formatShare,
  formatTokens,
  formatUsd,
  percentChange,
  usdToBrl,
} from "@/lib/admin/format"
import { AI_FEATURES } from "@/lib/admin/labels"
import { MODEL_PRICES, modelPrice } from "@/lib/ai/pricing"
import { getAdminAiUsage } from "@/lib/dal/admin"
import { formatDateTime } from "@/lib/format"
import { parsePeriod } from "@/lib/results/metrics"

export const metadata: Metadata = { title: "Uso de IA" }

const PRICE = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })

export default async function AdminAiUsagePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const days = parsePeriod(params.periodo)
  const usage = await getAdminAiUsage(days)
  const rate = Number(usage.usd_brl_rate) || 0
  const totals = usage.totals
  const cost = Number(totals.cost_usd)
  const answerCost = Number(usage.by_feature.find((row) => row.feature === "question_answer")?.cost_usd ?? 0)
  const afterSaleCost = Number(usage.by_feature.find((row) => row.feature === "after_sale_answer")?.cost_usd ?? 0)
  const perAnswer = usage.answers.questions_ai > 0 ? answerCost / usage.answers.questions_ai : null
  const perAfterSale = usage.answers.after_sale_ai > 0 ? afterSaleCost / usage.answers.after_sale_ai : null

  return (
    <>
      <PageHeader
        title="Uso de IA"
        description="Tokens e custo de cada chamada à OpenAI: respostas, sugestões, testes e pós-venda."
        actions={<PeriodToggle value={days} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`Custo em ${days} dias`}
          icon={CoinsIcon}
          value={formatUsd(cost)}
          change={percentChange(cost, Number(usage.previous.cost_usd))}
          invertChange
          headline={`${formatBrl(usdToBrl(cost, rate))} (cotação ${formatBrl(rate)})`}
          detail={`Período anterior: ${formatUsd(usage.previous.cost_usd)}`}
        />
        <StatCard
          label="Tokens"
          icon={BotIcon}
          value={formatTokens(totals.total_tokens)}
          change={percentChange(totals.total_tokens, usage.previous.total_tokens)}
          invertChange
          headline={`Entrada ${formatTokens(totals.input_tokens)} · saída ${formatTokens(totals.output_tokens)}`}
          detail={`${formatShare(totals.cached_input_tokens, totals.input_tokens)} da entrada veio do cache (90% mais barato)`}
        />
        <StatCard
          label="Chamadas"
          icon={GaugeIcon}
          value={formatInteger(totals.calls)}
          headline={`Tempo médio ${formatMs(totals.avg_latency_ms)}`}
          detail={
            totals.failed > 0 ? (
              <span className="text-destructive">
                {formatInteger(totals.failed)} com erro ({formatShare(totals.failed, totals.calls)})
              </span>
            ) : (
              "Nenhuma falha"
            )
          }
        />
        <StatCard
          label="Custo por resposta da IA"
          icon={CoinsIcon}
          value={perAnswer !== null ? formatUsd(perAnswer) : "—"}
          headline={`${formatInteger(usage.answers.questions_ai)} perguntas respondidas pela IA`}
          detail={
            perAfterSale !== null
              ? `Pós-venda: ${formatUsd(perAfterSale)} por mensagem (${formatInteger(usage.answers.after_sale_ai)})`
              : "Inclui as análises que ficaram com o vendedor"
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Custo por dia</CardTitle>
          <CardDescription>Em dólar, como a OpenAI cobra.</CardDescription>
        </CardHeader>
        <CardContent>
          <DailyChart
            label="Custo"
            kind="usd"
            color="var(--chart-2)"
            points={usage.daily.map((point) => ({ day: point.day, value: Number(point.cost_usd) }))}
            className="aspect-auto h-64 w-full"
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Por função</CardTitle>
            <CardDescription>Onde os tokens são gastos.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Função</TableHead>
                  <TableHead className="text-right">Chamadas</TableHead>
                  <TableHead className="text-right">Tokens por chamada</TableHead>
                  <TableHead className="pr-6 text-right">Custo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usage.by_feature.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                      Nenhuma chamada no período.
                    </TableCell>
                  </TableRow>
                ) : (
                  usage.by_feature.map((row) => (
                    <TableRow key={row.feature}>
                      <TableCell className="pl-6 whitespace-normal">
                        {AI_FEATURES[row.feature]?.label ?? row.feature}
                        {row.failed ? <span className="block text-xs text-destructive">{row.failed} com erro</span> : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatInteger(row.calls)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatTokens(row.avg_tokens)}</TableCell>
                      <TableCell className="pr-6 text-right tabular-nums">
                        {formatUsd(Number(row.cost_usd))}
                        <span className="block text-xs text-muted-foreground">{formatShare(Number(row.cost_usd), cost)}</span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Por modelo</CardTitle>
            <CardDescription>
              Preços cadastrados (US$ por 1 milhão de tokens):{" "}
              {Object.entries(MODEL_PRICES)
                .map(
                  ([model, price]) =>
                    `${model}: ${PRICE.format(price.input)} entrada, ${PRICE.format(price.cachedInput)} em cache, ${PRICE.format(price.output)} saída`
                )
                .join(" · ")}
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Modelo</TableHead>
                  <TableHead className="text-right">Entrada</TableHead>
                  <TableHead className="text-right">Saída</TableHead>
                  <TableHead className="pr-6 text-right">Custo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usage.by_model.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                      Nenhuma chamada no período.
                    </TableCell>
                  </TableRow>
                ) : (
                  usage.by_model.map((row) => (
                    <TableRow key={row.model}>
                      <TableCell className="pl-6">
                        <span className="font-mono text-xs">{row.model}</span>
                        {!modelPrice(row.model) && row.total_tokens > 0 ? (
                          <span className="mt-0.5 flex items-center gap-1 text-xs text-amber-700">
                            <TriangleAlertIcon className="size-3" />
                            Sem preço em lib/ai/pricing.ts (custo zerado)
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatTokens(row.input_tokens)}
                        <span className="block text-xs text-muted-foreground">{formatTokens(row.cached_input_tokens)} cache</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatTokens(row.output_tokens)}</TableCell>
                      <TableCell className="pr-6 text-right tabular-nums">{formatUsd(Number(row.cost_usd))}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Clientes que mais gastam</CardTitle>
          <CardDescription>Custo de IA de cada loja no período, ao lado da mensalidade.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Loja</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Chamadas</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead className="pr-6 text-right">Mensalidade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usage.top_organizations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                    Nenhuma chamada no período.
                  </TableCell>
                </TableRow>
              ) : (
                usage.top_organizations.map((row) => (
                  <TableRow key={row.organization_id}>
                    <TableCell className="pl-6">
                      <Link href={`/admin/clientes/${row.organization_id}`} className="font-medium hover:underline">
                        {row.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <OrgStatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatInteger(row.calls)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatTokens(row.tokens)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatUsd(Number(row.cost_usd))}
                      <span className="block text-xs text-muted-foreground">{formatBrl(usdToBrl(Number(row.cost_usd), rate))}</span>
                    </TableCell>
                    <TableCell className="pr-6 text-right tabular-nums">
                      {row.monthly_price !== null ? formatBrl(Number(row.monthly_price)) : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {usage.recent_errors.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Últimas falhas da OpenAI</CardTitle>
            <CardDescription>A fila tenta de novo sozinha; muitas falhas seguidas pedem atenção.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {usage.recent_errors.map((error, index) => (
                <li key={`${error.created_at}-${index}`} className="rounded-lg bg-destructive/5 px-3 py-2 text-sm">
                  <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {AI_FEATURES[error.feature]?.label ?? error.feature} · {error.organization_name ?? "sem loja"}
                    </span>
                    <time>{formatDateTime(error.created_at)}</time>
                  </div>
                  <p className="mt-0.5 font-mono text-xs break-all text-destructive">{error.error ?? "Erro sem mensagem"}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  )
}
