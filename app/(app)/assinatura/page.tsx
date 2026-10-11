import { CreditCardIcon } from "lucide-react"
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
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { requireSection } from "@/lib/dal/app-context"
import { formatDate, pluralize } from "@/lib/format"

export const metadata: Metadata = { title: "Assinatura" }

export default async function SubscriptionPage() {
  const { access } = await requireSection("assinatura")

  const summary = {
    trial: `Seu teste grátis vai até ${formatDate(access.trialEndsAt)} (${pluralize(access.trialDaysLeft, "dia restante", "dias restantes")}). Se assinar antes, você não perde os dias que faltam.`,
    active: "Sua assinatura está ativa. Obrigado por usar a plataforma!",
    blocked: `Seu teste grátis terminou em ${formatDate(access.trialEndsAt)}. Assine um plano para voltar a usar todas as funcionalidades. Seus dados continuam guardados.`,
  }[access.state]

  return (
    <>
      <PageHeader title="Assinatura" description="Acompanhe seu plano e seu período de teste." />
      <Card>
        <CardHeader>
          <CardTitle>Status da conta</CardTitle>
          <CardDescription>{summary}</CardDescription>
          <CardAction>
            <AccessBadge state={access.state} />
          </CardAction>
        </CardHeader>
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
