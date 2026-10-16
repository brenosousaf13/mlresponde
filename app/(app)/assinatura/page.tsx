import { CircleCheckIcon, CreditCardIcon, FlaskConicalIcon, InfoIcon, LightbulbIcon, LoaderIcon, MessagesSquareIcon } from "lucide-react"
import type { Metadata } from "next"

import { AccessBadge } from "@/components/app/access-badge"
import { PageHeader } from "@/components/app/page-header"
import { CancelSubscriptionButton } from "@/components/plans/cancel-subscription-button"
import { PaymentReturnRefresher } from "@/components/plans/payment-return"
import { PlanPicker } from "@/components/plans/plan-picker"
import { UsageMeter } from "@/components/plans/usage-meter"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { cancelReasonText, PAYMENT_METHOD_LABELS } from "@/lib/billing/subscription"
import { requireSection } from "@/lib/dal/app-context"
import { getPlanUsage } from "@/lib/dal/plan"
import { getSubscriptionPageState, type SubscriptionPageState } from "@/lib/dal/subscription"
import { formatDate, pluralize } from "@/lib/format"
import {
  FEATURE_LABELS,
  planName,
  requiredPlanName,
  sellablePlan,
  SUPPORT_LABELS,
  TRIAL_PLAN,
} from "@/lib/plans/plans"
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
  const [usage, billing] = await Promise.all([getPlanUsage(context), getSubscriptionPageState(context)])
  const contracted = sellablePlan(organization.plan)
  const isTrial = plan.id === TRIAL_PLAN.id
  const periodEnd = organization.currentPeriodEnd ? formatDate(organization.currentPeriodEnd) : null
  const cancelledButActive = access.state === "active" && organization.subscriptionStatus === "canceled" && periodEnd

  const blockedText =
    organization.subscriptionStatus === "trialing"
      ? `Seu teste grátis terminou em ${formatDate(access.trialEndsAt)}. Assine um plano para voltar a usar todas as funcionalidades. Seus dados continuam guardados.`
      : "Sua assinatura não está ativa. Assine um plano para voltar a usar todas as funcionalidades. Seus dados continuam guardados."
  const summary = {
    trial: `Seu teste grátis vai até ${formatDate(access.trialEndsAt)} (${pluralize(access.trialDaysLeft, "dia restante", "dias restantes")}). Nele você conhece tudo do plano Pro, com 1 conta do Mercado Livre. Ao assinar, o plano escolhido começa na hora.`,
    active: cancelledButActive
      ? `Sua assinatura foi cancelada e não terá novas cobranças. Você continua com acesso até ${periodEnd}.`
      : "Sua assinatura está ativa. Obrigado por usar a maanu!",
    blocked: blockedText,
  }[access.state]
  const paymentReturn = params.pagamento === "concluido" ? billing.lastCheckout : null

  const recurso = params.recurso === "pos_venda" || params.recurso === "melhorias_anuncio" ? params.recurso : null
  const upsell = recurso && !features[recurso] ? UPSELL[recurso] : null
  // Contas no limite não é problema (só impede conectar outra): vermelho só se passar do limite.
  const accountsRaw = quotaStatus(usage.accounts.active, usage.accounts.limit)
  const accountsQuota = accountsRaw.used > (accountsRaw.limit ?? Infinity) ? accountsRaw : { ...accountsRaw, level: "ok" as const }
  const accountsFull = accountsRaw.level === "reached"

  return (
    <>
      <PageHeader title="Assinatura" description="Seu plano, o quanto você já usou e os planos disponíveis." />
      {paymentReturn?.status === "pending" ? (
        <Alert>
          <LoaderIcon className="animate-spin motion-reduce:animate-none" />
          <AlertTitle>Estamos confirmando o seu pagamento</AlertTitle>
          <AlertDescription>
            Assim que a AbacatePay confirmar (costuma levar alguns segundos), o plano {planName(paymentReturn.plan)} é liberado
            e esta tela atualiza sozinha.
          </AlertDescription>
          <PaymentReturnRefresher />
        </Alert>
      ) : paymentReturn?.status === "paid" ? (
        <Alert>
          <CircleCheckIcon className="text-primary" />
          <AlertTitle>Pagamento confirmado!</AlertTitle>
          <AlertDescription>O plano {planName(paymentReturn.plan)} está ativo. Obrigado por assinar a maanu.</AlertDescription>
        </Alert>
      ) : null}
      {billing.testMode ? (
        <Alert>
          <FlaskConicalIcon />
          <AlertTitle>Pagamentos em modo de teste</AlertTitle>
          <AlertDescription>
            Nada é cobrado de verdade. Na página de pagamento, use o cartão 4242 4242 4242 4242, qualquer validade futura e
            qualquer CVV.
          </AlertDescription>
        </Alert>
      ) : null}
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

      {billing.details && billing.current ? (
        <SubscriptionCard billing={billing} periodEnd={periodEnd} />
      ) : null}

      {/* Os cards dos planos têm rodapé; sem o ajuste, o card de fora também perde o espaço de baixo (has-data-[slot=card-footer]). */}
      <Card className="has-data-[slot=card-footer]:pb-(--card-spacing)">
        <CardHeader>
          <CardTitle>Planos</CardTitle>
          <CardDescription>
            Todos os planos têm a IA completa nas perguntas, o Painel e os Resultados. O que muda é o volume, o pós-venda e as
            melhorias de anúncio.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PlanPicker
            currentPlanId={contracted?.id ?? null}
            active={access.state === "active"}
            billing={{
              checkoutEnabled: billing.checkoutEnabled,
              blockedReason: billing.blockedReason,
              availability: billing.availability,
              current: billing.current,
              nextChargeAt: organization.currentPeriodEnd,
            }}
          />
        </CardContent>
      </Card>
    </>
  )
}

function formatCents(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100)
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  )
}

/** A assinatura na AbacatePay: valor, forma de pagamento, próxima cobrança, avisos e cancelar. */
function SubscriptionCard({ billing, periodEnd }: { billing: SubscriptionPageState; periodEnd: string | null }) {
  const current = billing.current!
  const details = billing.details!
  const active = current.status === "active"
  const card =
    details.method === "CARD" && details.cardLast4
      ? `${details.cardBrand ? `${details.cardBrand} ` : "Cartão "}final ${details.cardLast4}`
      : details.method
        ? (PAYMENT_METHOD_LABELS[details.method] ?? details.method)
        : "—"
  const reason = cancelReasonText(details.cancelReason)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCardIcon className="size-4 text-muted-foreground" />
          Sua assinatura
        </CardTitle>
        <CardDescription>Cobrança recorrente pela AbacatePay.</CardDescription>
        <CardAction className="flex gap-1.5">
          {details.devMode ? <Badge variant="outline">Teste</Badge> : null}
          {!active ? (
            <Badge variant="secondary">Cancelada</Badge>
          ) : current.paymentFailing ? (
            <Badge variant="destructive">Pagamento recusado</Badge>
          ) : (
            <Badge>Ativa</Badge>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Row label="Plano">
            {planName(current.plan)} · Mensal
          </Row>
          <Row label="Valor">
            {formatCents(details.amountCents)} por mês
          </Row>
          <Row label="Forma de pagamento">{card}</Row>
          <Row label={active ? "Próxima cobrança" : "Acesso até"}>{periodEnd ?? "—"}</Row>
        </dl>
        {active && details.scheduledPlan ? (
          <Alert>
            <InfoIcon />
            <AlertTitle>Troca de plano agendada</AlertTitle>
            <AlertDescription>
              A partir da próxima cobrança{periodEnd ? ` (${periodEnd})` : ""}, seu plano passa a ser o {planName(details.scheduledPlan)}.
            </AlertDescription>
          </Alert>
        ) : null}
        {current.paymentFailing ? (
          <Alert variant="destructive">
            <CreditCardIcon />
            <AlertTitle>O cartão recusou a última cobrança</AlertTitle>
            <AlertDescription>
              A AbacatePay vai tentar de novo nos próximos dias. Se preferir, use &quot;Pagar com outro cartão&quot; no seu plano,
              logo abaixo. Se todas as tentativas falharem, a assinatura é cancelada.
            </AlertDescription>
          </Alert>
        ) : null}
        {!active && reason ? (
          <p className="text-sm text-muted-foreground">A assinatura foi cancelada porque {reason}.</p>
        ) : null}
      </CardContent>
      <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t text-xs text-muted-foreground">
        <span>
          {details.lastPaymentAt ? `Último pagamento em ${formatDate(details.lastPaymentAt)}` : "Sem pagamentos ainda"}
          {details.lastReceiptUrl ? (
            <>
              {" · "}
              <a href={details.lastReceiptUrl} target="_blank" rel="noreferrer" className="underline underline-offset-3 hover:text-foreground">
                Ver recibo
              </a>
            </>
          ) : null}
        </span>
        {active ? <CancelSubscriptionButton planName={planName(current.plan) ?? current.plan} accessUntil={periodEnd} /> : null}
      </CardFooter>
    </Card>
  )
}
