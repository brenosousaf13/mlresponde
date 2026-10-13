import {
  ArrowLeftIcon,
  BotIcon,
  ClockIcon,
  ExternalLinkIcon,
  HourglassIcon,
  MessageCircleQuestionIcon,
  ShieldCheckIcon,
} from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { AuditList } from "@/components/admin/audit-list"
import { OrgStatusBadge, StageLabel, ToneBadge } from "@/components/admin/badges"
import { DailyChart } from "@/components/admin/daily-chart"
import { ExtendTrialMenu } from "@/components/admin/extend-trial-menu"
import { MemberActions } from "@/components/admin/member-actions"
import { MlAccountPause } from "@/components/admin/ml-account-pause"
import { OrgNotesForm } from "@/components/admin/org-notes-form"
import { OrgSubscriptionDialog } from "@/components/admin/org-subscription-dialog"
import { StatCard } from "@/components/admin/stat-card"
import { WhatsappLink } from "@/components/admin/whatsapp-link"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatBrl, formatInteger, formatShare, formatTokens, formatUsd } from "@/lib/admin/format"
import { AI_FEATURES, MEMBER_ROLES, ML_ACCOUNT_STATUS, QUESTION_STATUS, SUBSCRIPTION_STATUSES } from "@/lib/admin/labels"
import { formatDocument } from "@/lib/billing/documents"
import { getAdminOrganization, getAdminOrganizationPlan, requireAdmin } from "@/lib/dal/admin"
import { formatDate, formatDateTime, timeAgo } from "@/lib/format"
import { BILLING_CYCLE_LABELS, planName } from "@/lib/plans/plans"
import { periodText } from "@/lib/plans/usage"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Cliente" }

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  )
}

export default async function AdminClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [admin, detail] = await Promise.all([requireAdmin(), getAdminOrganization(id)])
  if (!detail) notFound()

  const org = detail.organization
  const planUsage = await getAdminOrganizationPlan(org)
  const questions = detail.questions_30d
  const aiCost30d = Number(org.ai_cost_30d_usd)
  const usageDaily = detail.usage_daily.map((point) => ({ day: point.day, value: Number(point.cost_usd) }))
  const canExtend = org.status === "trial" || org.status === "trial_expired" || org.status === "canceled" || org.status === "past_due"

  return (
    <>
      <div className="flex flex-col gap-3">
        <Link href="/admin/clientes" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" />
          Clientes
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold tracking-tight">{org.name}</h2>
              <OrgStatusBadge status={org.status} />
              {org.owner_banned ? <ToneBadge tone="red">Acesso bloqueado</ToneBadge> : null}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <StageLabel stage={org.stage} />
              <span>Cliente desde {formatDate(org.created_at)}</span>
              <span>Último acesso: {org.last_seen_at ? timeAgo(org.last_seen_at) : "nunca"}</span>
              <span className="font-mono text-xs">{org.organization_id}</span>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {canExtend ? <ExtendTrialMenu organizationId={org.organization_id} /> : null}
            <OrgSubscriptionDialog
              values={{
                id: org.organization_id,
                name: org.name,
                plan: org.plan,
                subscription_status: org.subscription_status,
                trial_ends_at: org.trial_ends_at,
                current_period_end: org.current_period_end,
                billing_exempt: org.billing_exempt,
                ml_accounts_limit: org.ml_accounts_limit,
                monthly_price: org.monthly_price === null ? null : Number(org.monthly_price),
                ml_active: org.ml_active,
                monthly_answers_limit: planUsage.monthlyAnswersLimit,
                billing_cycle: planUsage.billingCycle,
              }}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Perguntas (30 dias)"
          icon={MessageCircleQuestionIcon}
          value={formatInteger(questions.total)}
          headline={`${formatShare(questions.ai, questions.total)} respondidas pela IA`}
          detail={`${formatInteger(questions.manual)} pelo vendedor · ${formatInteger(questions.outside)} no ML`}
        />
        <StatCard
          label="Esperando o vendedor"
          icon={HourglassIcon}
          value={formatInteger(org.open_now)}
          headline={`${formatInteger(questions.fallback)} com a mensagem padrão (30 dias)`}
          detail={`Pós-venda: ${formatInteger(detail.conversations_30d.total)} conversas, ${formatInteger(detail.conversations_30d.open)} abertas`}
        />
        <StatCard
          label="Custo de IA (30 dias)"
          icon={BotIcon}
          value={formatUsd(aiCost30d)}
          headline={`${formatInteger(org.ai_calls_30d)} chamadas · ${formatTokens(org.ai_tokens_30d)} tokens`}
          detail={`No mês: ${formatUsd(org.ai_cost_month_usd)}`}
        />
        <StatCard
          label="Mensalidade"
          icon={ClockIcon}
          value={org.monthly_price !== null ? formatBrl(Number(org.monthly_price)) : "—"}
          headline={planName(org.plan) ? `Plano ${planName(org.plan)}` : "Sem plano"}
          detail={
            org.status === "trial"
              ? `Teste acaba ${timeAgo(org.trial_ends_at)} (${formatDate(org.trial_ends_at, "short")})`
              : SUBSCRIPTION_STATUSES[org.subscription_status as keyof typeof SUBSCRIPTION_STATUSES] ?? org.subscription_status
          }
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Contas do Mercado Livre</CardTitle>
              <CardDescription>
                {formatInteger(org.ml_active)} ativa(s) de um limite de {formatInteger(org.ml_accounts_limit)}.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {detail.ml_accounts.length === 0 ? (
                <p className="px-6 py-6 text-center text-sm text-muted-foreground">Nenhuma conta conectada ainda.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Conta</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead>IA</TableHead>
                      <TableHead className="text-right">Perguntas (30d)</TableHead>
                      <TableHead className="pr-6 text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.ml_accounts.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell className="pl-6">
                          <div className="flex flex-col">
                            <span className="font-medium">{account.nickname || `Conta ${account.ml_user_id}`}</span>
                            <span className="text-xs text-muted-foreground">
                              ID ML {account.ml_user_id} · desde {formatDate(account.created_at, "short")}
                            </span>
                            {account.last_refresh_error ? (
                              <span className="max-w-80 truncate text-xs text-destructive" title={account.last_refresh_error}>
                                {account.last_refresh_error}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-1">
                            <ToneBadge tone={account.status === "active" ? "teal" : "slate"}>
                              {ML_ACCOUNT_STATUS[account.status] ?? account.status}
                            </ToneBadge>
                            {account.status !== "disconnected" && account.token_status === "invalid" ? (
                              <ToneBadge tone="red">Conexão inválida</ToneBadge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex flex-col gap-0.5">
                            <span className={cn(account.auto_reply_enabled ? "text-brand-teal-ink" : "text-muted-foreground")}>
                              Perguntas: {account.auto_reply_enabled ? "ligada" : account.configured ? "pausada" : "não configurada"}
                              {account.auto_reply_enabled && account.answer_mode === "always" ? " (sempre)" : ""}
                            </span>
                            <span className={cn("text-xs", account.after_sale_enabled ? "text-brand-teal-ink" : "text-muted-foreground")}>
                              Pós-venda: {account.after_sale_enabled ? "ligado" : "desligado"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <div>{formatInteger(account.questions_30d)}</div>
                          <span className="text-xs text-muted-foreground">
                            {formatShare(account.ai_answers_30d, account.questions_30d)} IA · {formatInteger(account.open_now)} esperando
                          </span>
                        </TableCell>
                        <TableCell className="pr-6 text-right">
                          <MlAccountPause
                            account={{
                              id: account.id,
                              nickname: account.nickname || `Conta ${account.ml_user_id}`,
                              autoReply: account.auto_reply_enabled,
                              afterSale: account.after_sale_enabled,
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Custo de IA por dia</CardTitle>
              <CardDescription>Últimos 30 dias, em dólar. Inclui respostas, sugestões e testes.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <DailyChart label="Custo" kind="usd" color="var(--chart-2)" points={usageDaily} className="aspect-auto h-44 w-full" />
              {detail.usage_by_feature.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Uso</TableHead>
                      <TableHead className="text-right">Chamadas</TableHead>
                      <TableHead className="text-right">Tokens</TableHead>
                      <TableHead className="text-right">Custo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.usage_by_feature.map((row) => (
                      <TableRow key={row.feature}>
                        <TableCell>
                          {AI_FEATURES[row.feature]?.label ?? row.feature}
                          {row.failed ? <span className="ml-2 text-xs text-destructive">{row.failed} com erro</span> : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatInteger(row.calls)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatTokens(row.tokens)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatUsd(Number(row.cost_usd))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-sm text-muted-foreground">Nenhuma chamada à IA nos últimos 30 dias.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Últimas perguntas</CardTitle>
              <CardDescription>As 10 mais recentes, para entender o que a loja recebe (suporte).</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {detail.recent_questions.length === 0 ? (
                <p className="px-6 py-6 text-center text-sm text-muted-foreground">Nenhuma pergunta ainda.</p>
              ) : (
                <ul className="divide-y">
                  {detail.recent_questions.map((question) => (
                    <li key={question.id} className="flex flex-col gap-0.5 px-6 py-2.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm">{question.question_text || "(sem texto)"}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(question.created_at)}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {QUESTION_STATUS[question.status] ?? question.status}
                        {question.answer_source === "ai" ? (question.fallback_reason ? " pela IA (mensagem padrão)" : " pela IA") : ""}
                        {question.answer_source === "manual" ? " pelo vendedor" : ""}
                        {question.item_title ? ` · ${question.item_title}` : ""}
                        {question.account_nickname ? ` · ${question.account_nickname}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Assinatura</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                <Row label="Situação">
                  <OrgStatusBadge status={org.status} />
                </Row>
                <Row label="Plano">{planName(org.plan) ?? "—"}</Row>
                <Row label="Plano em vigor">{planUsage.plan.name}</Row>
                <Row label="Ciclo">{planUsage.billingCycle ? BILLING_CYCLE_LABELS[planUsage.billingCycle] : "—"}</Row>
                <Row label="Respostas automáticas">
                  {formatInteger(planUsage.answers.used)} de{" "}
                  {planUsage.answers.limit === null ? "sem limite" : formatInteger(planUsage.answers.limit)}
                  {planUsage.monthlyAnswersLimit !== null ? " (acordo)" : ""}
                  <span className="block text-xs font-normal text-muted-foreground">{periodText(planUsage.period)}</span>
                </Row>
                <Row label="Melhorias de anúncio">
                  {planUsage.improvements
                    ? `${formatInteger(planUsage.improvements.used)} de ${
                        planUsage.improvements.limit === null ? "sem limite" : formatInteger(planUsage.improvements.limit)
                      }`
                    : "Não inclui"}
                </Row>
                <Row label="Mensalidade">{org.monthly_price !== null ? formatBrl(Number(org.monthly_price)) : "—"}</Row>
                <Row label="Fim do teste">{formatDateTime(org.trial_ends_at)}</Row>
                <Row label="Pago até">{org.current_period_end ? formatDate(org.current_period_end, "short") : "—"}</Row>
                <Row label="Cortesia">{org.billing_exempt ? "Sim" : "Não"}</Row>
                <Row label="Limite de contas ML">{formatInteger(org.ml_accounts_limit)}</Row>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Usuários</CardTitle>
              <CardDescription>{formatInteger(detail.members.length)} com acesso a esta loja.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {detail.members.map((member) => {
                const banned = Boolean(member.banned_until && new Date(member.banned_until) > new Date())
                return (
                  <div key={member.user_id} className="flex items-start gap-2 rounded-lg border p-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-medium">{member.full_name || "Sem nome"}</span>
                        <ToneBadge tone="slate">{MEMBER_ROLES[member.role] ?? member.role}</ToneBadge>
                        {member.is_platform_admin ? <ToneBadge tone="graphite">Admin maanu</ToneBadge> : null}
                      </div>
                      <span className="truncate text-xs text-muted-foreground">{member.email}</span>
                      <WhatsappLink digits={member.whatsapp} className="text-xs" />
                      <div className="flex flex-wrap gap-1.5">
                        {member.email_confirmed_at ? null : <ToneBadge tone="amber">E-mail não confirmado</ToneBadge>}
                        {banned ? <ToneBadge tone="red">Bloqueado</ToneBadge> : null}
                        {member.mfa_factors > 0 ? (
                          <ToneBadge tone="teal">
                            <ShieldCheckIcon />2 etapas
                          </ToneBadge>
                        ) : null}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Último acesso: {member.last_seen_at || member.last_sign_in_at ? timeAgo((member.last_seen_at ?? member.last_sign_in_at)!) : "nunca"}
                        {member.terms_version ? ` · termos ${member.terms_version}` : ""}
                      </span>
                    </div>
                    <MemberActions
                      isSelf={member.user_id === admin.userId}
                      member={{
                        userId: member.user_id,
                        email: member.email,
                        fullName: member.full_name ?? "",
                        whatsapp: member.whatsapp,
                        emailConfirmed: Boolean(member.email_confirmed_at),
                        banned,
                        isPlatformAdmin: member.is_platform_admin,
                      }}
                    />
                  </div>
                )
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dados de cobrança</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.billing ? (
                <dl className="divide-y">
                  <Row label={detail.billing.document_type.toUpperCase()}>
                    {formatDocument(detail.billing.document_type, detail.billing.document)}
                  </Row>
                  <Row label={detail.billing.document_type === "cnpj" ? "Razão social" : "Nome"}>{detail.billing.legal_name}</Row>
                  <Row label="Endereço">
                    {detail.billing.street}, {detail.billing.address_number}
                    {detail.billing.complement ? ` - ${detail.billing.complement}` : ""}
                    <br />
                    {detail.billing.district} · {detail.billing.city}/{detail.billing.state}
                  </Row>
                  <Row label="CEP">{detail.billing.postal_code.replace(/^(\d{5})(\d{3})$/, "$1-$2")}</Row>
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">Ainda não preencheu (pede no próximo acesso).</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notas internas</CardTitle>
              <CardDescription>Só a equipe maanu vê.</CardDescription>
            </CardHeader>
            <CardContent>
              <OrgNotesForm organizationId={org.organization_id} notes={detail.notes?.notes ?? ""} />
            </CardContent>
            {detail.notes?.updated_at ? (
              <CardFooter className="text-xs text-muted-foreground">
                Atualizado {timeAgo(detail.notes.updated_at)}
                {detail.notes.updated_by_email ? ` por ${detail.notes.updated_by_email}` : ""}
              </CardFooter>
            ) : null}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Histórico</CardTitle>
              <CardDescription>O que foi alterado pelo painel.</CardDescription>
              <CardAction>
                <Link
                  href={`/admin/auditoria?cliente=${org.organization_id}`}
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  Tudo
                  <ExternalLinkIcon data-icon="inline-end" />
                </Link>
              </CardAction>
            </CardHeader>
            <CardContent>
              <AuditList rows={detail.audit} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
