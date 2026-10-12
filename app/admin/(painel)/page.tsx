import {
  ActivityIcon,
  BotIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  MessageCircleQuestionIcon,
  StoreIcon,
  UserPlusIcon,
  UsersIcon,
  WalletIcon,
  ZapIcon,
} from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { OrgStatusBadge, StageLabel } from "@/components/admin/badges"
import { DailyChart } from "@/components/admin/daily-chart"
import { FunnelCard } from "@/components/admin/funnel-card"
import { StatCard } from "@/components/admin/stat-card"
import { WhatsappLink } from "@/components/admin/whatsapp-link"
import { PageHeader } from "@/components/app/page-header"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  formatBrl,
  formatBrlShort,
  formatInteger,
  formatShare,
  formatTokens,
  formatUsd,
  percentChange,
  usdToBrl,
} from "@/lib/admin/format"
import { getAdminOverview } from "@/lib/dal/admin"
import { formatDateTime, timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Visão geral" }

export default async function AdminOverviewPage() {
  const data = await getAdminOverview()
  const { organizations: orgs, users, questions, ai, ml_accounts: accounts, alerts, platform } = data
  const rate = Number(platform.usd_brl_rate) || 0
  const byStatus = orgs.by_status
  const aiMonthBrl = usdToBrl(ai.cost_month_usd, rate)
  const aiPrevMonthBrl = usdToBrl(ai.cost_prev_month_usd, rate)

  const alertItems = [
    { count: alerts.questions_stuck, label: "perguntas paradas na fila (mais de 10 min)" },
    { count: alerts.questions_failed, label: "perguntas com falha esperando nova tentativa" },
    { count: alerts.conversations_stuck, label: "conversas de pós-venda paradas na fila" },
    { count: alerts.conversations_failed, label: "conversas de pós-venda com falha" },
    { count: alerts.ml_invalid_tokens, label: "contas do ML com conexão inválida (cliente precisa reconectar)" },
    { count: alerts.ai_errors_24h, label: "chamadas à OpenAI com erro nas últimas 24 h" },
  ].filter((item) => item.count > 0)

  return (
    <>
      <PageHeader
        title="Visão geral"
        description={`Tudo o que acontece na maanu agora. Atualizado em ${formatDateTime(data.generated_at)}.`}
        actions={
          <Link href="/admin/clientes" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <UsersIcon data-icon="inline-start" />
            Ver clientes
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Clientes"
          icon={StoreIcon}
          value={formatInteger(orgs.total)}
          headline={`${formatInteger(byStatus.trial ?? 0)} em teste · ${formatInteger(byStatus.active ?? 0)} assinantes`}
          detail={`${formatInteger(byStatus.courtesy ?? 0)} cortesia · ${formatInteger((byStatus.trial_expired ?? 0) + (byStatus.canceled ?? 0) + (byStatus.past_due ?? 0))} bloqueados`}
        />
        <StatCard
          label="Novos cadastros (30 dias)"
          icon={UserPlusIcon}
          value={formatInteger(users.new_30d)}
          change={percentChange(users.new_30d, users.new_prev_30d)}
          headline={`Hoje: ${formatInteger(users.new_today)} · 7 dias: ${formatInteger(users.new_7d)}`}
          detail={`${formatShare(users.confirmed, users.total)} de todos os usuários confirmaram o e-mail`}
        />
        <StatCard
          label="Usuários ativos (7 dias)"
          icon={UsersIcon}
          value={formatInteger(users.active_7d)}
          headline={`Hoje: ${formatInteger(users.active_today)} · 30 dias: ${formatInteger(users.active_30d)}`}
          detail={`${formatShare(users.active_7d, users.total)} dos ${formatInteger(users.total)} usuários (sem a equipe maanu)`}
        />
        <StatCard
          label="Receita recorrente (MRR)"
          icon={WalletIcon}
          value={formatBrlShort(orgs.mrr)}
          headline={`${formatInteger(orgs.paying)} assinante${orgs.paying === 1 ? "" : "s"} · ARR ${formatBrlShort(orgs.mrr * 12)}`}
          detail={
            orgs.paying_without_price > 0 ? (
              <span className="text-amber-700">
                {orgs.paying_without_price} assinante(s) sem mensalidade cadastrada
              </span>
            ) : (
              "Soma das mensalidades dos assinantes"
            )
          }
        />
        <StatCard
          label="Custo de IA no mês"
          icon={BotIcon}
          value={formatBrl(aiMonthBrl)}
          change={percentChange(aiMonthBrl, aiPrevMonthBrl)}
          invertChange
          headline={`${formatUsd(ai.cost_month_usd)} · hoje ${formatUsd(ai.cost_today_usd)}`}
          detail={`${formatTokens(ai.tokens_month)} tokens em ${formatInteger(ai.calls_month)} chamadas`}
        />
        <StatCard
          label="Perguntas (7 dias)"
          icon={MessageCircleQuestionIcon}
          value={formatInteger(questions.last_7d)}
          headline={`${formatShare(questions.ai_7d, questions.last_7d)} respondidas pela IA`}
          detail={`Hoje: ${formatInteger(questions.today)} · esperando vendedores: ${formatInteger(questions.open_now)}`}
        />
        <StatCard
          label="Contas do Mercado Livre"
          icon={ZapIcon}
          value={formatInteger(accounts.connected)}
          headline={`IA ligada em ${formatInteger(accounts.auto_reply_on)} · pós-venda em ${formatInteger(accounts.after_sale_on)}`}
          detail={
            accounts.invalid_token > 0 ? (
              <span className="text-destructive">{accounts.invalid_token} com conexão inválida</span>
            ) : (
              `${formatInteger(accounts.active)} ativas, todas conectadas`
            )
          }
        />
        <StatCard
          label="Operação"
          icon={ActivityIcon}
          value={
            platform.ai_paused ? (
              <span className="text-destructive">IA pausada</span>
            ) : alertItems.length ? (
              <span className="text-amber-700">{alertItems.length} alerta{alertItems.length === 1 ? "" : "s"}</span>
            ) : (
              "Tudo certo"
            )
          }
          headline={platform.ai_paused ? "Nenhuma resposta automática está saindo" : "Filas, conexões e OpenAI"}
          detail={
            <Link href="/admin/operacao" className="text-brand-teal-ink hover:underline">
              Ver operação
            </Link>
          }
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cadastros por dia</CardTitle>
            <CardDescription>Novos usuários nos últimos 30 dias (sem a equipe maanu).</CardDescription>
          </CardHeader>
          <CardContent>
            <DailyChart
              label="Cadastros"
              points={data.signups_daily.map((point) => ({ day: point.day, value: point.signups }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Custo de IA por dia</CardTitle>
            <CardDescription>Em dólar, como a OpenAI cobra. Cotação usada: {formatBrl(rate)}.</CardDescription>
            <CardAction>
              <Link href="/admin/uso-ia" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Detalhes
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            <DailyChart
              label="Custo"
              kind="usd"
              color="var(--chart-2)"
              points={data.ai_daily.map((point) => ({ day: point.day, value: Number(point.cost_usd) }))}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <FunnelCard funnel={orgs.funnel} />
        <Card>
          <CardHeader>
            <CardTitle>Últimos cadastros</CardTitle>
            <CardDescription>Quem entrou por último e em que etapa está.</CardDescription>
            <CardAction>
              <Link href="/admin/clientes" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Todos
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent className="px-0">
            {orgs.recent_signups.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhum cliente ainda.</p>
            ) : (
              <ul className="divide-y">
                {orgs.recent_signups.map((signup) => (
                  <li key={signup.organization_id}>
                    <Link
                      href={`/admin/clientes/${signup.organization_id}`}
                      className="flex items-center gap-3 px-6 py-2.5 transition-colors hover:bg-muted/60"
                    >
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">{signup.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {signup.owner_name || "Sem nome"} · {signup.owner_email}
                        </span>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <StageLabel stage={signup.stage} />
                        <span className="text-xs text-muted-foreground">{timeAgo(signup.created_at)}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Testes que acabam em até 3 dias</CardTitle>
            <CardDescription>Bom momento para chamar no WhatsApp e ajudar a assinar.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {orgs.trials_ending.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhum teste acabando nos próximos 3 dias.</p>
            ) : (
              <ul className="divide-y">
                {orgs.trials_ending.map((trial) => (
                  <li key={trial.organization_id} className="flex items-center gap-3 px-6 py-2.5">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <Link
                        href={`/admin/clientes/${trial.organization_id}`}
                        className="truncate text-sm font-medium hover:underline"
                      >
                        {trial.name}
                      </Link>
                      <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <StageLabel stage={trial.stage} />· {formatInteger(trial.ai_answers_30d)} respostas da IA
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                      <span className="font-medium text-amber-700">acaba {timeAgo(trial.trial_ends_at)}</span>
                      <WhatsappLink digits={trial.owner_whatsapp} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Alertas</CardTitle>
            <CardDescription>O que pode estar atrapalhando os clientes agora.</CardDescription>
            <CardAction>
              <Link href="/admin/operacao" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Operação
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {platform.ai_paused || alertItems.length ? (
              <ul className="flex flex-col gap-2">
                {platform.ai_paused ? (
                  <li className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
                    IA de toda a plataforma pausada{platform.ai_paused_reason ? `: ${platform.ai_paused_reason}` : ""}.
                  </li>
                ) : null}
                {alertItems.map((item) => (
                  <li
                    key={item.label}
                    className={cn("flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200")}
                  >
                    <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
                    <span>
                      <strong className="tabular-nums">{formatInteger(item.count)}</strong> {item.label}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-center gap-2 rounded-lg bg-brand-sage/60 px-3 py-3 text-sm text-brand-teal-ink">
                <CircleCheckIcon className="size-4" />
                Nenhum alerta: filas andando, contas conectadas e OpenAI respondendo.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Organizações internas (plano admin) ficam fora dos números: {formatInteger(orgs.internal)}. Situações:{" "}
        {(["trial", "active", "courtesy", "past_due", "canceled", "trial_expired"] as const).map((status) => (
          <span key={status} className="mr-2 inline-flex items-center gap-1">
            <OrgStatusBadge status={status} /> {formatInteger(byStatus[status] ?? 0)}
          </span>
        ))}
      </p>
    </>
  )
}
