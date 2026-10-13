import { InfoIcon, LightbulbIcon, MessagesSquareIcon } from "lucide-react"
import type { Metadata } from "next"

import { AccessBadge } from "@/components/app/access-badge"
import { PageHeader } from "@/components/app/page-header"
import { PlanPicker } from "@/components/plans/plan-picker"
import { UsageMeter } from "@/components/plans/usage-meter"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { requireSection } from "@/lib/dal/app-context"
import { getPlanUsage } from "@/lib/dal/plan"
import { formatDate, pluralize } from "@/lib/format"
import { FEATURE_LABELS, requiredPlanName, sellablePlan, SUPPORT_LABELS, TRIAL_PLAN } from "@/lib/plans/plans"
import { periodText, quotaStatus } from "@/lib/plans/usage"

export const metadata: Metadata = { title: "Assinatura" }

const UPSELL = {
  pos_venda: {
    icon: MessagesSquareIcon,
    title: `${FEATURE_LABELS.pos_venda} é a partir do plano ${requiredPlanName("pos_venda")}`,
    text: "Um agente de IA conversa com quem já comprou: informa o envio, o rastreio e a previsão de entrega, tira dúvidas sobre o pedido e deixa para você só o que precisa de uma pessoa.",
  },
  melhorias_anuncio: {
    icon: LightbulbIcon,
    title: `${FEATURE_LABELS.melhorias_anuncio} é a partir do plano ${requiredPlanName("melhorias_anuncio")}`,
    text: "A IA lê as perguntas que cada anúncio recebe e diz o que mudar no título, na descrição e na ficha técnica para os compradores não precisarem perguntar — com o texto pronto para colar.",
  },
} as const

export default async function SubscriptionPage({ searchParams }: PageProps<"/assinatura">) {
  const context = await requireSection("assinatura")
  const { access, organization, features, plan } = context
  const params = await searchParams
  const usage = await getPlanUsage(context)
  const contracted = sellablePlan(organization.plan)
  const isTrial = plan.id === TRIAL_PLAN.id

  const summary = {
    trial: `Seu teste grátis vai até ${formatDate(access.trialEndsAt)} (${pluralize(access.trialDaysLeft, "dia restante", "dias restantes")}). Nele você conhece tudo do plano Pro, com 1 conta do Mercado Livre. Se assinar antes, você não perde os dias que faltam.`,
    active: "Sua assinatura está ativa. Obrigado por usar a maanu!",
    blocked: `Seu teste grátis terminou em ${formatDate(access.trialEndsAt)}. Assine um plano para voltar a usar todas as funcionalidades. Seus dados continuam guardados.`,
  }[access.state]

  const recurso = params.recurso === "pos_venda" || params.recurso === "melhorias_anuncio" ? params.recurso : null
  const upsell = recurso && !features[recurso] ? UPSELL[recurso] : null
  // Contas no limite não é problema (só impede conectar outra): vermelho só se passar do limite.
  const accountsRaw = quotaStatus(usage.accounts.active, usage.accounts.limit)
  const accountsQuota = accountsRaw.used > (accountsRaw.limit ?? Infinity) ? accountsRaw : { ...accountsRaw, level: "ok" as const }
  const accountsFull = accountsRaw.level === "reached"

  return (
    <>
      <PageHeader title="Assinatura" description="Seu plano, o quanto você já usou e os planos disponíveis." />
      {upsell ? (
        <Alert>
          <upsell.icon />
          <AlertTitle>{upsell.title}</AlertTitle>
          <AlertDescription>{upsell.text}</AlertDescription>
        </Alert>
      ) : null}


      <Card>
        <CardHeader>
          <CardTitle>{isTrial ? "Teste grátis" : `Plano ${plan.name}`}</CardTitle>
          <CardDescription>{summary}</CardDescription>
          <CardAction>
            <AccessBadge state={access.state} />
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-3">
          <UsageMeter label="Respostas automáticas" quota={usage.answers} hint={periodText(usage.period)} />
          <UsageMeter
            label="Contas do Mercado Livre ativas"
            quota={accountsQuota}
            hint={accountsFull ? "Para conectar outra, desative uma conta ou suba de plano." : "Ao mesmo tempo."}
          />
          {usage.improvements ? (
            <UsageMeter label="Melhorias de anúncio" quota={usage.improvements} hint={periodText(usage.period)} />
          ) : (
            <div className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Melhorias de anúncio</span>
              <span className="text-muted-foreground">Disponível a partir do plano {requiredPlanName("melhorias_anuncio")}.</span>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex-col items-start gap-1 border-t text-xs text-muted-foreground">
          <p className="flex items-start gap-1.5">
            <InfoIcon className="mt-px size-3.5 shrink-0" />
            Contam como resposta automática as perguntas respondidas pela IA (inclusive a mensagem padrão) e as mensagens de
            pós-venda enviadas pelo agente. Sugestões, testes e as respostas que você mesmo envia não contam. Se o limite
            acabar, as perguntas novas ficam para você responder.
          </p>
          {contracted ? <p>{SUPPORT_LABELS[contracted.support]}.</p> : null}
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Planos</CardTitle>
          <CardDescription>
            Todos os planos têm a IA completa nas perguntas, o Painel e os Resultados. O que muda é o volume, o pós-venda e as
            melhorias de anúncio.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PlanPicker currentPlanId={contracted?.id ?? null} active={access.state === "active"} />
        </CardContent>
      </Card>
    </>
  )
}
