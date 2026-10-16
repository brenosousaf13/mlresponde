"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"

import { changePlan, subscribeToPlan } from "@/app/(app)/assinatura/actions"
import { CheckoutRedirectDialog } from "@/components/plans/checkout-redirect-dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import type { CheckoutAvailability } from "@/lib/billing/abacatepay/catalog"
import { isUpgrade, planIntent, type CurrentSubscription } from "@/lib/billing/subscription"
import { formatDate } from "@/lib/format"
import { formatPrice, planName, type SellablePlan } from "@/lib/plans/plans"

export type PlanPickerBilling = {
  /** Contratação pelo app ligada para este usuário. */
  checkoutEnabled: boolean
  /** Motivo de os botões estarem desligados para este usuário (null = "em breve"). */
  blockedReason: string | null
  availability: CheckoutAvailability | null
  current: CurrentSubscription | null
  /** Próxima cobrança / fim do período pago (textos da troca de plano). */
  nextChargeAt: string | null
}

function priceText(plan: SellablePlan) {
  return `${formatPrice(plan.priceMonthly)} por mês`
}

type Confirmation = { title: string; description: string; confirm: string; run: () => void }

/** Tempo mínimo da tela de espera, para o cliente conseguir ler que vai para a AbacatePay. */
const MIN_REDIRECT_MESSAGE_MS = 1800

/** Botão de cada plano na tela Assinatura: assinar, trocar de plano ou assinar de novo com outro cartão. */
export function PlanActionButton({
  plan,
  billing,
  highlight,
  legacyCurrent,
}: {
  plan: SellablePlan
  billing: PlanPickerBilling
  highlight: boolean
  /** Contratação desligada: o plano já é o da organização (cadastrado pela equipe). */
  legacyCurrent: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  // Indo para a página de pagamento: a tela de espera fica aberta até ela abrir (e fecha se o cliente voltar).
  const [redirect, setRedirect] = useState<{ url: string | null } | null>(null)
  const variant = highlight ? "default" : "outline"

  useEffect(() => {
    const reset = (event: PageTransitionEvent) => {
      if (event.persisted) setRedirect(null)
    }
    window.addEventListener("pageshow", reset)
    return () => window.removeEventListener("pageshow", reset)
  }, [])

  if (!billing.checkoutEnabled) {
    return (
      <>
        <Button disabled variant={variant} className="w-full">
          {legacyCurrent ? "Plano atual" : `Assinar o ${plan.name}`}
        </Button>
        {legacyCurrent ? null : (
          <p className="text-center text-xs text-muted-foreground">{billing.blockedReason ?? "Contratação pelo app em breve"}</p>
        )}
      </>
    )
  }

  const current = billing.current
  const intent = planIntent(current, plan.id)
  const nextCharge = billing.nextChargeAt ? formatDate(billing.nextChargeAt) : null

  if (intent === "current") {
    const scheduled = current?.scheduledPlan ? planName(current.scheduledPlan) : null
    return (
      <>
        <Button disabled variant="outline" className="w-full">
          Plano atual
        </Button>
        {scheduled ? (
          <p className="text-center text-xs text-muted-foreground">
            Muda para o {scheduled} {nextCharge ? `em ${nextCharge}` : "na próxima cobrança"}
          </p>
        ) : null}
      </>
    )
  }

  if (!billing.availability?.[plan.id]?.monthly) {
    return (
      <>
        <Button disabled variant={variant} className="w-full">
          Assinar o {plan.name}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Indisponível no momento
        </p>
      </>
    )
  }

  if (intent === "change_plan" && current?.scheduledPlan === plan.id) {
    return (
      <>
        <Button disabled variant={variant} className="w-full">
          Troca agendada
        </Button>
        <p className="text-center text-xs text-muted-foreground">Começa {nextCharge ? `em ${nextCharge}` : "na próxima cobrança"}</p>
      </>
    )
  }

  const goToCheckout = () => {
    const startedAt = Date.now()
    setRedirect({ url: null })
    startTransition(async () => {
      const result = await subscribeToPlan(plan.id)
      if (result.ok && result.url) {
        const url = result.url
        setRedirect({ url })
        const remaining = MIN_REDIRECT_MESSAGE_MS - (Date.now() - startedAt)
        if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining))
        window.location.assign(url)
        return
      }
      setRedirect(null)
      toast.error(result.message)
    })
  }

  const requestChange = () =>
    startTransition(async () => {
      const result = await changePlan(plan.id)
      if (result.ok) {
        toast.success(result.message)
        router.refresh()
      } else {
        toast.error(result.message)
      }
    })

  let label = `Assinar o ${plan.name}`
  let onClick = goToCheckout
  if (intent === "change_plan" && current) {
    const upgrade = isUpgrade(current.plan, plan.id)
    label = `Mudar para o ${plan.name}`
    onClick = () =>
      setConfirmation({
        title: `Mudar para o plano ${plan.name}?`,
        description: upgrade
          ? `O ${plan.name} fica liberado agora mesmo. A partir da próxima cobrança${nextCharge ? ` (${nextCharge})` : ""}, o valor passa a ser ${priceText(plan)}.`
          : `Você continua com o plano ${planName(current.plan)} até ${nextCharge ?? "a próxima cobrança"}. Depois, o plano muda para o ${plan.name} e passa a custar ${priceText(plan)}. Se houver mais contas do Mercado Livre ativas do que o ${plan.name} permite, as mais novas ficam inativas.`,
        confirm: `Mudar para o ${plan.name}`,
        run: requestChange,
      })
  } else if (intent === "replace" && current) {
    // Cobrança recusada: assinatura nova com outro cartão (a anterior é cancelada quando a nova for paga).
    label = current.plan === plan.id ? "Pagar com outro cartão" : `Assinar o ${plan.name}`
    onClick = () =>
      setConfirmation({
        title: "Assinar de novo com outro cartão?",
        description: `Abrimos uma página de pagamento nova (${plan.name}, ${priceText(plan)}). Quando o pagamento for aprovado, a assinatura com a cobrança recusada é cancelada.`,
        confirm: "Ir para o pagamento",
        run: goToCheckout,
      })
  }

  return (
    <>
      <Button variant={variant} className="w-full" disabled={pending || redirect !== null} onClick={onClick}>
        {pending || redirect !== null ? <Spinner data-icon="inline-start" /> : null}
        {label}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        {intent === "change_plan" ? "Sem nova página de pagamento" : "Você vai para a página segura da AbacatePay"}
      </p>
      <CheckoutRedirectDialog
        open={redirect !== null}
        url={redirect?.url ?? null}
        summary={`Plano ${plan.name} · ${priceText(plan)}`}
      />
      <AlertDialog open={confirmation !== null} onOpenChange={(open) => (open ? null : setConfirmation(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmation?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const run = confirmation?.run
                setConfirmation(null)
                run?.()
              }}
            >
              {confirmation?.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}