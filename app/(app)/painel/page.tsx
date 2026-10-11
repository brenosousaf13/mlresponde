import {
  ArrowRightIcon,
  BotIcon,
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
import { formatDate, formatDuration, pluralize } from "@/lib/format"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Painel" }

export default async function DashboardPage() {
  const context = await requireSection("painel")
  const firstName = context.profile.fullName.split(" ")[0]
  const { access, mlAccounts, organization } = context

  const { total, answeredAi, awaiting, avgAiSeconds, autoReplyOn, hasBriefing, answeredEver } =
    await getDashboardData(organization.id)
  const aiRate = total ? Math.round((answeredAi / total) * 100) : 0

  const steps = [
    { done: true, label: "Criar sua conta", href: null },
    { done: mlAccounts.active > 0, label: "Conectar uma conta do Mercado Livre", href: "/contas" },
    { done: hasBriefing, label: "Preencher as informações da loja", href: "/respostas" },
    { done: autoReplyOn, label: "Ligar as respostas automáticas", href: "/respostas" },
    { done: answeredEver > 0, label: "Receber a primeira resposta", href: "/perguntas" },
  ]

  const metrics = [
    { label: "Perguntas recebidas", value: String(total), hint: "últimos 7 dias", icon: MessageCircleQuestionIcon },
    {
      label: "Respondidas pela IA",
      value: String(answeredAi),
      hint: total ? `${aiRate}% das perguntas` : "últimos 7 dias",
      icon: BotIcon,
    },
    { label: "Aguardando você", value: String(awaiting), hint: "para responder", icon: InboxIcon, href: "/perguntas" },
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
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
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
      </div>
    </>
  )
}
