import {
  ArrowRightIcon,
  BotIcon,
  ChartColumnIncreasingIcon,
  CheckCircle2Icon,
  CircleIcon,
  InboxIcon,
  MessageCircleQuestionIcon,
  TimerIcon,
} from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { AccessBadge } from "@/components/app/access-badge"
import { PageHeader } from "@/components/app/page-header"
import { AwaitingQuestionsCard, RecentQuestionsCard, TopItemsCard } from "@/components/painel/question-cards"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requireSection } from "@/lib/dal/app-context"
import { getDashboardData } from "@/lib/dal/dashboard"
import { formatDate, formatDuration, formatNumber, pluralize } from "@/lib/format"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Painel" }

const DAYS = 7

export default async function DashboardPage() {
  const context = await requireSection("painel")
  const firstName = context.profile.fullName.split(" ")[0]
  const { access, mlAccounts, organization } = context

  const {
    total,
    answeredAi,
    awaiting,
    avgAiSeconds,
    autoReplyOn,
    assistantReady,
    answeredEver,
    awaitingQuestions,
    recentQuestions,
    topItems,
    topItemsSampled,
  } = await getDashboardData(organization.id, DAYS)
  const aiRate = total ? Math.round((answeredAi / total) * 100) : 0

  const steps = [
    { done: true, label: "Criar sua conta", href: null },
    { done: mlAccounts.active > 0, label: "Conectar uma conta do Mercado Livre", href: "/contas" },
    { done: assistantReady, label: "Configurar o assistente de IA (perguntas sobre a loja)", href: "/assistente" },
    { done: autoReplyOn, label: "Ligar as respostas automáticas", href: "/assistente" },
    { done: answeredEver > 0, label: "Receber a primeira resposta", href: "/perguntas" },
  ]
  const stepsDone = steps.every((step) => step.done)

  const metrics = [
    { label: "Perguntas recebidas", value: formatNumber(total), hint: `últimos ${DAYS} dias`, icon: MessageCircleQuestionIcon },
    {
      label: "Respondidas pela IA",
      value: formatNumber(answeredAi),
      hint: total ? `${aiRate}% das perguntas` : `últimos ${DAYS} dias`,
      icon: BotIcon,
    },
    { label: "Aguardando você", value: formatNumber(awaiting), hint: "para responder", icon: InboxIcon, href: "/perguntas" },
    {
      label: "Tempo médio da IA",
      value: formatDuration(avgAiSeconds),
      hint: "da pergunta à resposta",
      icon: TimerIcon,
    },
  ]

  return (
    <>
      <PageHeader
        title={firstName ? `Olá, ${firstName}` : "Olá"}
        description={`Aqui está o resumo da ${organization.name}.`}
        actions={
          <Link href="/resultados" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "bg-card")}>
            <ChartColumnIncreasingIcon data-icon="inline-start" />
            Ver resultados da IA
          </Link>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <CardHeader>
              <CardDescription className="flex items-center gap-2">
                <metric.icon className="size-4" />
                {metric.label}
              </CardDescription>
              <CardTitle className="text-3xl tabular-nums">{metric.value}</CardTitle>
            </CardHeader>
            <CardFooter className="mt-auto justify-between text-sm text-muted-foreground">
              {metric.hint}
              {metric.href && awaiting > 0 ? (
                <Link href={metric.href} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                  Responder <ArrowRightIcon className="size-3.5" />
                </Link>
              ) : null}
            </CardFooter>
          </Card>
        ))}
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          {stepsDone ? null : (
            <Card>
              <CardHeader>
                <CardTitle>Primeiros passos</CardTitle>
                <CardDescription>O que falta para a IA trabalhar por você</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-3 text-sm">
                  {steps.map((step) => (
                    <li key={step.label} className="flex items-start gap-2">
                      {step.done ? (
                        <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                      ) : (
                        <CircleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      )}
                      {step.done || !step.href ? (
                        <span className={step.done ? "text-muted-foreground line-through" : undefined}>{step.label}</span>
                      ) : (
                        <Link href={step.href} className="font-medium hover:underline">
                          {step.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          <AwaitingQuestionsCard questions={awaitingQuestions} total={awaiting} />
          <RecentQuestionsCard questions={recentQuestions} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardDescription>Assinatura</CardDescription>
              <CardTitle className="text-2xl">
                {access.state === "trial" ? pluralize(access.trialDaysLeft, "dia restante", "dias restantes") : "Plano ativo"}
              </CardTitle>
              <CardAction>
                <AccessBadge state={access.state} />
              </CardAction>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {access.state === "trial"
                ? `O teste grátis vai até ${formatDate(access.trialEndsAt)}.`
                : "Sua assinatura está em dia."}
            </CardContent>
            <CardFooter className="mt-auto">
              <Link href="/contas" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                {mlAccounts.active} de {organization.mlAccountsLimit} conta{organization.mlAccountsLimit === 1 ? "" : "s"} ML
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </CardFooter>
          </Card>
          <TopItemsCard items={topItems} sampled={topItemsSampled} days={DAYS} />
        </div>
      </div>
    </>
  )
}
