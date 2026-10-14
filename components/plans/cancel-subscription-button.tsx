"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { cancelMySubscription } from "@/app/(app)/assinatura/actions"
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

/** Cancelar a assinatura (com confirmação). O acesso continua até o fim do período já pago. */
export function CancelSubscriptionButton({ planName, accessUntil }: { planName: string; accessUntil: string | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const cancel = () =>
    startTransition(async () => {
      const result = await cancelMySubscription()
      if (result.ok) {
        toast.success(result.message)
        setOpen(false)
        router.refresh()
      } else {
        toast.error(result.message)
      }
    })

  return (
    <>
      <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={pending} onClick={() => setOpen(true)}>
        {pending ? <Spinner data-icon="inline-start" /> : null}
        Cancelar assinatura
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar a assinatura?</AlertDialogTitle>
            <AlertDialogDescription>
              Não haverá novas cobranças. Você continua com o plano {planName}
              {accessUntil ? ` até ${accessUntil}` : " até o fim do período já pago"}; depois disso, a maanu fica bloqueada até
              você assinar de novo. Seus dados e configurações continuam guardados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Manter assinatura</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={cancel}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              Cancelar assinatura
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}