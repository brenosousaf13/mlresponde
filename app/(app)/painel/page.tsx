import { ArrowRightIcon, CheckCircle2Icon, CircleIcon } from "lucide-react"
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
import { formatDate, pluralize } from "@/lib/format"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Painel" }

export default async function DashboardPage() {
  const context = await requireSection("painel")
  const firstName = context.profile.fullName.split(" ")[0]
  const { access, mlAccounts, organization } = context

  const steps = [
    { done: true, label: "Criar sua conta" },
    { done: mlAccounts.active > 0, label: "Conectar uma conta do Mercado Livre" },
    { done: false, label: "Configurar como a IA responde (chega na próxima atualização)" },
  ]

  return (
    <>
      <PageHeader
        title={firstName ? `Olá, ${firstName}` : "Olá"}
        description={`Aqui está o resumo da ${organization.name}.`}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
          <CardFooter className="mt-auto text-sm text-muted-foreground">
            {access.state === "trial"
              ? `O teste grátis vai até ${formatDate(access.trialEndsAt)}.`
              : "Sua assinatura está em dia."}
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Contas do Mercado Livre</CardDescription>
            <CardTitle className="text-2xl">
              {mlAccounts.active} de {organization.mlAccountsLimit}
            </CardTitle>
          </CardHeader>
          <CardFooter className="mt-auto">
            <Link href="/contas" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Gerenciar contas <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </CardFooter>
        </Card>
        <Card className="md:col-span-2 xl:col-span-1">
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
                  <span className={step.done ? "text-muted-foreground line-through" : undefined}>
                    {step.label}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
