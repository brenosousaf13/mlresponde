import { MessageCircleQuestionIcon, MessagesSquareIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { ToneBadge } from "@/components/admin/badges"
import { HourlyChart } from "@/components/admin/hourly-chart"
import { PlatformAiSwitch } from "@/components/admin/platform-ai-switch"
import { PageHeader } from "@/components/app/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatInteger, formatMs, formatShare } from "@/lib/admin/format"
import { AI_FEATURES, QUESTION_STATUS } from "@/lib/admin/labels"
import type { QueueStats } from "@/lib/admin/types"
import { getAdminOperations } from "@/lib/dal/admin"
import { formatDateTime, timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Operação" }

function QueueCard({ title, icon: Icon, stats }: { title: string; icon: typeof MessageCircleQuestionIcon; stats: QueueStats }) {
  const items = [
    { label: "Na fila", value: stats.pending },
    { label: "Processando", value: stats.processing },
    { label: "Com falha (vai tentar de novo)", value: stats.failed, warn: stats.failed > 0 },
    { label: "Paradas há mais de 10 min", value: stats.stuck, danger: stats.stuck > 0 },
    { label: "Esperando o vendedor", value: stats.needs_review },
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4" />
          {title}
        </CardTitle>
        <CardDescription>
          {stats.oldest_waiting_at ? `A mais antiga na fila chegou ${timeAgo(stats.oldest_waiting_at)}.` : "Fila vazia."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {items.map((item) => (
            <div
              key={item.label}
              className={cn(
                "rounded-lg bg-muted/60 px-3 py-2",
                item.warn && "bg-amber-500/10 text-amber-900",
                item.danger && "bg-destructive/10 text-destructive"
              )}
            >
              <dt className="text-xs text-muted-foreground">{item.label}</dt>
              <dd className="mt-0.5 text-xl font-semibold tabular-nums">{formatInteger(item.value)}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

export default async function AdminOperationsPage() {
  const ops = await getAdminOperations()
  const ai = ops.ai_24h

  return (
    <>
      <PageHeader title="Operação" description="Filas, erros e conexões: o que pode estar travando as respostas agora." />

      <PlatformAiSwitch
        paused={ops.platform.ai_paused}
        reason={ops.platform.ai_paused_reason}
        pausedAt={ops.platform.ai_paused_at}
        pausedBy={ops.platform.ai_paused_by_email}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <QueueCard title="Perguntas" icon={MessageCircleQuestionIcon} stats={ops.questions} />
        <QueueCard title="Pós-venda" icon={MessagesSquareIcon} stats={ops.conversations} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Últimas 24 horas</CardTitle>
          <CardDescription>
            {formatInteger(ai.calls)} chamadas à IA, {formatInteger(ai.failed)} com erro ({formatShare(ai.failed, ai.calls)}),
            tempo médio {formatMs(ai.avg_latency_ms)}.
            {ai.last_error ? ` Último erro ${timeAgo(ai.last_error.created_at)} (${AI_FEATURES[ai.last_error.feature]?.short ?? ai.last_error.feature}).` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HourlyChart points={ops.hourly} />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Erros recentes (48 h)</CardTitle>
            <CardDescription>Perguntas e conversas que falharam ao processar.</CardDescription>
          </CardHeader>
          <CardContent>
            {ops.recent_errors.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nenhum erro nas últimas 48 horas.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {ops.recent_errors.map((error) => (
                  <li key={`${error.kind}-${error.id}`} className="rounded-lg border px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <ToneBadge tone="slate">{error.kind === "question" ? "Pergunta" : "Pós-venda"}</ToneBadge>
                        <Link href={`/admin/clientes/${error.organization_id}`} className="font-medium text-foreground hover:underline">
                          {error.organization_name}
                        </Link>
                        {error.account_nickname ? `· ${error.account_nickname}` : ""}
                      </span>
                      <time>{formatDateTime(error.updated_at)}</time>
                    </div>
                    <p className="mt-1 font-mono text-xs break-all text-destructive">{error.error}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {QUESTION_STATUS[error.status] ?? error.status} · {formatInteger(error.attempts)} tentativa(s)
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contas do ML com problema</CardTitle>
            <CardDescription>Conexão inválida ou erro ao renovar o acesso nas últimas 24 h.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {ops.accounts_with_problems.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Todas as contas conectadas.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Conta</TableHead>
                    <TableHead>Conexão</TableHead>
                    <TableHead className="pr-6">Erro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ops.accounts_with_problems.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell className="pl-6">
                        <span className="font-medium">{account.nickname ?? "Sem apelido"}</span>
                        <Link
                          href={`/admin/clientes/${account.organization_id}`}
                          className="block text-xs text-muted-foreground hover:underline"
                        >
                          {account.organization_name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <ToneBadge tone={account.token_status === "invalid" ? "red" : "amber"}>
                          {account.token_status === "invalid" ? "Inválida" : "Instável"}
                        </ToneBadge>
                      </TableCell>
                      <TableCell className="max-w-72 pr-6">
                        <span className="line-clamp-2 text-xs text-muted-foreground" title={account.error ?? undefined}>
                          {account.error ?? "—"}
                        </span>
                        {account.error_at ? <span className="text-xs text-muted-foreground">{timeAgo(account.error_at)}</span> : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
