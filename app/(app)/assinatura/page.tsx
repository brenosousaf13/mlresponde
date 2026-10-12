import { CheckCircle2Icon, CreditCardIcon, LockIcon, MessagesSquareIcon } from "lucide-react"
import type { Metadata } from "next"

import { AccessBadge } from "@/components/app/access-badge"
import { PageHeader } from "@/components/app/page-header"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { requireSection } from "@/lib/dal/app-context"
import { formatDate, pluralize } from "@/lib/format"
import { FEATURE_LABELS, planName, requiredPlanName } from "@/lib/plans/plans"

export const metadata: Metadata = { title: "Assinatura" }

export default async function SubscriptionPage({ searchParams }: PageProps<"/assinatura">) {
  const { access, organization, features } = await requireSection("assinatura")
  const params = await searchParams
  const currentPlan = planName(organization.plan)

  const summary = {
    trial: `Seu teste grátis vai até ${formatDate(access.trialEndsAt)} (${pluralize(access.trialDaysLeft, "dia restante", "dias restantes")}). Se assinar antes, você não perde os dias que faltam.`,
    active: "Sua assinatura está ativa. Obrigado por usar a plataforma!",
    blocked: `Seu teste grátis terminou em ${formatDate(access.trialEndsAt)}. Assine um plano para voltar a usar todas as funcionalidades. Seus dados continuam guardados.`,
  }[access.state]

  return (
    <>
      <PageHeader title="Assinatura" description="Acompanhe seu plano e seu período de teste." />
      {params.recurso === "pos_venda" && !features.pos_venda ? (
        <Alert>
          <MessagesSquareIcon />
          <AlertTitle>{FEATURE_LABELS.pos_venda} é exclusivo do plano {requiredPlanName("pos_venda")}</AlertTitle>
          <AlertDescription>
            Com ele, um agente de IA conversa com quem já comprou: informa o envio, o rastreio e a previsão de entrega, tira
            dúvidas sobre o pedido e deixa para você só o que precisa de uma pessoa.
          </AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Status da conta</CardTitle>
          <CardDescription>
            {currentPlan ? <span className="mb-1 block font-medium text-foreground">Plano {currentPlan}</span> : null}
            {summary}
          </CardDescription>
          <CardAction>
            <AccessBadge state={access.state} />
          </CardAction>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Recursos do seu plano</CardTitle>
          <CardDescription>O que está liberado para a sua loja.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col divide-y rounded-xl border text-sm">
            <li className="flex items-center justify-between gap-3 p-3.5">
              <span className="flex items-center gap-2.5">
                <CheckCircle2Icon className="size-4 text-emerald-600" />
                Respostas automáticas às perguntas dos anúncios
              </span>
              <Badge variant="secondary">Incluído</Badge>
            </li>
            <li className="flex items-center justify-between gap-3 p-3.5">
              <span className="flex items-center gap-2.5">
                {features.pos_venda ? (
                  <CheckCircle2Icon className="size-4 text-emerald-600" />
                ) : (
                  <LockIcon className="size-4 text-muted-foreground" />
                )}
                {FEATURE_LABELS.pos_venda}
              </span>
              {features.pos_venda ? (
                <Badge variant="secondary">Incluído</Badge>
              ) : (
                <Badge variant="outline">Plano {requiredPlanName("pos_venda")}</Badge>
              )}
            </li>
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Planos</CardTitle>
          <CardDescription>Cobrança mensal, sem fidelidade.</CardDescription>
        </CardHeader>
        <CardContent>
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CreditCardIcon />
              </EmptyMedia>
              <EmptyTitle>Contratação pelo app em breve</EmptyTitle>
              <EmptyDescription>
                Estamos finalizando os planos. Assim que estiverem disponíveis, você poderá escolher e
                assinar por aqui mesmo.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    </>
  )
}
