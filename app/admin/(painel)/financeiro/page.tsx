import { BotIcon, LandmarkIcon, PiggyBankIcon, ReceiptIcon, TriangleAlertIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { OrgStatusBadge, StageLabel } from "@/components/admin/badges"
import { FinanceSettingsDialog } from "@/components/admin/finance-settings-dialog"
import { StatCard } from "@/components/admin/stat-card"
import { WhatsappLink } from "@/components/admin/whatsapp-link"
import { PageHeader } from "@/components/app/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { summarizeFinance } from "@/lib/admin/finance"
import { formatBrl, formatInteger, formatUsd, percentChange } from "@/lib/admin/format"
import { getAdminFinance } from "@/lib/dal/admin"
import { formatDate, timeAgo } from "@/lib/format"
import { planName } from "@/lib/plans/plans"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Financeiro" }

const monthName = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date(iso))

export default async function AdminFinancePage() {
  const finance = await getAdminFinance()
  const summary = summarizeFinance(finance)
  const elapsedPct = Math.round(summary.elapsed * 100)

  return (
    <>
      <PageHeader
        title="Financeiro"
        description={`Receita, custo de IA e margem de ${monthName(finance.month_start)} (${elapsedPct}% do mês).`}
        actions={<FinanceSettingsDialog rate={summary.rate} fixedCosts={summary.fixedCosts} />}
      />

      {finance.paying_without_price > 0 ? (
        <Alert>
          <TriangleAlertIcon />
          <AlertTitle>{finance.paying_without_price} assinante(s) sem mensalidade cadastrada</AlertTitle>
          <AlertDescription>
            Quem assina pela AbacatePay tem a mensalidade preenchida sozinha. Para os demais, o MRR vem da mensalidade
            cadastrada (Clientes → Editar assinatura).
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Receita recorrente (MRR)"
          icon={LandmarkIcon}
          value={formatBrl(summary.mrr)}
          headline={`ARR ${formatBrl(summary.arr)}`}
          detail={`${formatInteger(summary.paying)} assinante(s) · ticket médio ${formatBrl(summary.arpa)}`}
        />
        <StatCard
          label="Custo de IA no mês"
          icon={BotIcon}
          value={formatBrl(summary.aiCostMonthBrl)}
          change={percentChange(summary.aiCostProjectedBrl, summary.aiCostPrevMonthBrl)}
          invertChange
          headline={`Projeção do mês: ${formatBrl(summary.aiCostProjectedBrl)}`}
          detail={`${formatUsd(summary.aiCostMonthUsd)} até agora · mês passado ${formatBrl(summary.aiCostPrevMonthBrl)}`}
        />
        <StatCard
          label="Custos fixos"
          icon={ReceiptIcon}
          value={formatBrl(summary.fixedCosts)}
          headline={`Cotação do dólar: ${formatBrl(summary.rate)}`}
          detail="Ajuste em Ajustar números"
        />
        <StatCard
          label="Margem estimada do mês"
          icon={PiggyBankIcon}
          value={<span className={cn(summary.margin < 0 && "text-destructive")}>{formatBrl(summary.margin)}</span>}
          headline={
            summary.marginShare !== null ? `${Math.round(summary.marginShare * 100)}% da receita` : "Sem receita no mês"
          }
          detail="MRR − custo de IA projetado − custos fixos"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Receita × custo de IA por cliente</CardTitle>
          <CardDescription>
            Custo de IA projetado para o mês inteiro no ritmo atual. Quem custa mais do que paga aparece primeiro
            {summary.lossCount ? ` (${summary.lossCount} hoje)` : ""}.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Loja</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Mensalidade</TableHead>
                <TableHead className="text-right">Custo IA (mês)</TableHead>
                <TableHead className="text-right">Custo ÷ mensalidade</TableHead>
                <TableHead className="pr-6 text-right">Margem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                    Nenhum assinante nem custo de IA neste mês.
                  </TableCell>
                </TableRow>
              ) : (
                summary.rows.map((row) => (
                  <TableRow key={row.organization_id}>
                    <TableCell className="pl-6">
                      <Link href={`/admin/clientes/${row.organization_id}`} className="font-medium hover:underline">
                        {row.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {planName(row.plan) ?? "Sem plano"} · {formatInteger(row.ai_answers_month)} respostas da IA
                      </span>
                    </TableCell>
                    <TableCell>
                      <OrgStatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.monthly_price !== null ? formatBrl(Number(row.monthly_price)) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatBrl(row.aiCostProjectedBrl)}
                      <span className="block text-xs text-muted-foreground">{formatBrl(row.aiCostBrl)} até agora</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.costShare === null ? "—" : row.costShare > 0 && row.costShare < 0.01 ? "< 1%" : `${Math.round(row.costShare * 100)}%`}
                    </TableCell>
                    <TableCell className={cn("pr-6 text-right font-medium tabular-nums", row.loss && "text-destructive")}>
                      {formatBrl(row.margin)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pagamento atrasado</CardTitle>
            <CardDescription>Clientes com a situação &quot;Pagamento atrasado&quot; (app bloqueado).</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {finance.past_due.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Ninguém com pagamento atrasado.</p>
            ) : (
              <ul className="divide-y">
                {finance.past_due.map((row) => (
                  <li key={row.organization_id} className="flex items-center gap-3 px-6 py-2.5">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <Link href={`/admin/clientes/${row.organization_id}`} className="truncate text-sm font-medium hover:underline">
                        {row.name}
                      </Link>
                      <span className="truncate text-xs text-muted-foreground">{row.owner_email}</span>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs">
                      <span className="font-medium tabular-nums">
                        {row.monthly_price !== null ? formatBrl(Number(row.monthly_price)) : "—"}
                      </span>
                      <span className="text-muted-foreground">
                        {row.current_period_end ? `venceu ${formatDate(row.current_period_end, "short")}` : "sem data"}
                      </span>
                      <WhatsappLink digits={row.owner_whatsapp} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Testes que acabam em 7 dias</CardTitle>
            <CardDescription>Quem está perto de decidir se assina.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {finance.trials_ending.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nenhum teste acabando nos próximos 7 dias.</p>
            ) : (
              <ul className="divide-y">
                {finance.trials_ending.map((row) => (
                  <li key={row.organization_id} className="flex items-center gap-3 px-6 py-2.5">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <Link href={`/admin/clientes/${row.organization_id}`} className="truncate text-sm font-medium hover:underline">
                        {row.name}
                      </Link>
                      <StageLabel stage={row.stage} />
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs">
                      <span className="font-medium text-amber-700">acaba {timeAgo(row.trial_ends_at)}</span>
                      <span className="text-muted-foreground">{formatInteger(row.ai_answers_30d)} respostas da IA</span>
                      <WhatsappLink digits={row.owner_whatsapp} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Sem gateway de pagamento ainda: receita = mensalidade cadastrada dos clientes com assinatura ativa. Custo de IA sem
        loja (ex.: cliente apagado) no mês: {formatUsd(finance.ai_cost_unassigned_month_usd)}.
      </p>
    </>
  )
}
