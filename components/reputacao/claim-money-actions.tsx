"use client"

import { AlertTriangleIcon, BadgeDollarSignIcon, LockIcon, PackageOpenIcon, PercentIcon, ScaleIcon, type LucideIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { claimMoneyAction, loadPartialRefundOffers } from "@/app/(app)/reputacao/reclamacoes/actions"
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
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatMoney } from "@/lib/customers/presentation"
import type { ClaimActionKind, PartialRefundOffers } from "@/lib/reputation/claim-details"

type MoneyKind = Extract<ClaimActionKind, "refund" | "partial_refund" | "allow_return" | "open_dispute">

const KIND_INFO: Record<MoneyKind, { label: string; icon: LucideIcon; title: string; confirm: string }> = {
  refund: {
    label: "Devolver o dinheiro",
    icon: BadgeDollarSignIcon,
    title: "Devolver o dinheiro ao comprador?",
    confirm: "Sim, devolver o dinheiro",
  },
  partial_refund: {
    label: "Oferecer reembolso parcial",
    icon: PercentIcon,
    title: "Oferecer reembolso parcial?",
    confirm: "Sim, enviar a oferta",
  },
  allow_return: {
    label: "Aceitar a devolução",
    icon: PackageOpenIcon,
    title: "Aceitar a devolução do produto?",
    confirm: "Sim, aceitar a devolução",
  },
  open_dispute: {
    label: "Pedir a mediação do ML",
    icon: ScaleIcon,
    title: "Pedir a mediação do Mercado Livre?",
    confirm: "Sim, pedir a mediação",
  },
}

/** Ações de dinheiro e mediação: só dono/administrador, com 2 confirmações (o que acontece + "tem certeza?"). */
export function ClaimMoneyActions({
  claimRowId,
  kinds,
  canManage,
  amount,
  currency,
}: {
  claimRowId: string
  kinds: MoneyKind[]
  canManage: boolean
  amount: number | null
  currency: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState<MoneyKind | null>(null)
  const [step, setStep] = useState<1 | 2>(1)
  const [offers, setOffers] = useState<PartialRefundOffers | null>(null)
  const [offersError, setOffersError] = useState<string | null>(null)
  const [percentage, setPercentage] = useState<string>("")
  const [pending, startTransition] = useTransition()

  const total = amount === null ? null : formatMoney(amount, currency)
  const chosen = offers?.offers.find((offer) => String(offer.percentage) === percentage) ?? null

  function start(kind: MoneyKind) {
    setOpen(kind)
    setStep(1)
    setPercentage("")
    setOffers(null)
    setOffersError(null)
    if (kind === "partial_refund") {
      startTransition(async () => {
        const result = await loadPartialRefundOffers(claimRowId).catch(() => ({ ok: false as const, message: "Não foi possível buscar as ofertas." }))
        if (result.ok) setOffers(result.offers)
        else setOffersError(result.message)
      })
    }
  }

  function execute() {
    if (!open) return
    startTransition(async () => {
      try {
        const result = await claimMoneyAction({
          claimRowId,
          kind: open,
          percentage: open === "partial_refund" ? Number(percentage) : undefined,
          confirmed: true,
        })
        if (result.ok) {
          toast.success(result.message)
          setOpen(null)
          router.refresh()
        } else toast.error(result.message)
      } catch {
        toast.error("Não foi possível falar com o Mercado Livre agora.")
      }
    })
  }

  function explanation(kind: MoneyKind) {
    if (kind === "refund") {
      return (
        "O Mercado Livre devolve " +
        (total ? total : "o valor da compra") +
        " ao comprador e encerra a reclamação. O dinheiro sai da sua conta do Mercado Pago."
      )
    }
    if (kind === "partial_refund") {
      return "O comprador recebe uma oferta para ficar com o produto e receber parte do dinheiro de volta. Se ele aceitar, a reclamação é encerrada; se recusar, ele pode pedir a mediação."
    }
    if (kind === "allow_return") {
      return "O comprador recebe uma etiqueta para devolver o produto. Quando a devolução for despachada ou chegar, o Mercado Livre devolve o dinheiro a ele."
    }
    return "Um representante do Mercado Livre entra na reclamação e decide. A partir daí você só fala com o mediador, não mais com o comprador."
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {kinds.map((kind) => {
          const Icon = KIND_INFO[kind].icon
          const button = (
            <Button
              key={kind}
              variant="outline"
              className="w-full justify-start bg-card"
              disabled={!canManage || pending}
              onClick={() => start(kind)}
            >
              <Icon data-icon="inline-start" />
              {KIND_INFO[kind].label}
              {canManage ? null : <LockIcon className="ml-auto" />}
            </Button>
          )
          if (canManage) return button
          return (
            <Tooltip key={kind}>
              <TooltipTrigger render={<span className="block" />}>{button}</TooltipTrigger>
              <TooltipContent>Só o dono ou um administrador da loja faz esta ação.</TooltipContent>
            </Tooltip>
          )
        })}
      </div>

      <AlertDialog open={open !== null} onOpenChange={(value) => (value ? null : setOpen(null))}>
        {open ? (
          <AlertDialogContent>
            {step === 1 ? (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>{KIND_INFO[open].title}</AlertDialogTitle>
                  <AlertDialogDescription>{explanation(open)}</AlertDialogDescription>
                </AlertDialogHeader>
                {open === "refund" && total ? (
                  <div className="rounded-lg border bg-muted/40 px-4 py-3 text-center">
                    <p className="text-xs text-muted-foreground">Valor da compra</p>
                    <p className="text-2xl font-semibold tabular-nums">{total}</p>
                  </div>
                ) : null}
                {open === "partial_refund" ? (
                  offersError ? (
                    <p className="text-sm text-destructive">{offersError}</p>
                  ) : !offers ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Spinner /> Buscando as ofertas que o Mercado Livre libera...
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {offers.recommendedMax !== null ? (
                        <p className="text-sm text-muted-foreground">
                          O ML recomenda oferecer até {offers.recommendedMax}%: reembolso parcial costuma sair mais barato que
                          a devolução.
                        </p>
                      ) : null}
                      <RadioGroup value={percentage} onValueChange={(value) => setPercentage(String(value))} className="max-h-56 overflow-y-auto">
                        {offers.offers.map((offer) => (
                          <Label
                            key={offer.percentage}
                            className="flex items-center gap-3 rounded-lg border px-3 py-2 font-normal has-data-checked:border-primary"
                          >
                            <RadioGroupItem value={String(offer.percentage)} />
                            <span className="font-medium tabular-nums">{offer.percentage}%</span>
                            <span className="ml-auto tabular-nums">{formatMoney(offer.amount, offers.currency)}</span>
                          </Label>
                        ))}
                      </RadioGroup>
                    </div>
                  )
                ) : null}
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction disabled={open === "partial_refund" && !chosen} onClick={() => setStep(2)}>
                    Continuar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            ) : (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangleIcon className="size-5 text-amber-600" />
                    Tem certeza?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {open === "refund"
                      ? "A maanu vai pedir ao Mercado Livre para devolver " + (total ?? "o valor da compra") + " ao comprador agora."
                      : open === "partial_refund" && chosen
                        ? "A maanu vai oferecer " +
                          chosen.percentage +
                          "% (" +
                          formatMoney(chosen.amount, offers?.currency) +
                          ") de reembolso ao comprador agora."
                        : open === "allow_return"
                          ? "A maanu vai aceitar a devolução no Mercado Livre agora."
                          : "A maanu vai pedir a mediação do Mercado Livre agora."}{" "}
                    Não dá para desfazer pela maanu.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={pending}>Não, voltar</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" disabled={pending} onClick={execute}>
                    {pending ? <Spinner data-icon="inline-start" /> : null}
                    {KIND_INFO[open].confirm}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            )}
          </AlertDialogContent>
        ) : null}
      </AlertDialog>
    </>
  )
}
