"use client"

import { RefreshCwIcon, WebhookIcon, XCircleIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { adminCancelSubscription, refreshAbacateCatalog, registerAbacateWebhook, type ActionResult } from "@/app/admin/billing-actions"
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

function useAction() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const run = (action: () => Promise<ActionResult>, after?: () => void) =>
    startTransition(async () => {
      const result = await action()
      if (result.ok) toast.success(result.message)
      else toast.error(result.message)
      after?.()
      router.refresh()
    })
  return { pending, run }
}

/** Lê de novo os produtos da AbacatePay. */
export function RefreshCatalogButton() {
  const { pending, run } = useAction()
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => run(refreshAbacateCatalog)}>
      {pending ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
      Ler de novo
    </Button>
  )
}

/** Cadastra o webhook da maanu na AbacatePay (o segredo fica só no servidor). */
export function RegisterWebhookButton({ disabled }: { disabled?: boolean }) {
  const { pending, run } = useAction()
  return (
    <Button size="sm" disabled={disabled || pending} onClick={() => run(registerAbacateWebhook)}>
      {pending ? <Spinner data-icon="inline-start" /> : <WebhookIcon data-icon="inline-start" />}
      Cadastrar webhook na AbacatePay
    </Button>
  )
}

/** Ficha do cliente: cancelar a assinatura na AbacatePay. */
export function AdminCancelSubscriptionButton({ organizationId, organizationName }: { organizationId: string; organizationName: string }) {
  const [open, setOpen] = useState(false)
  const { pending, run } = useAction()
  return (
    <>
      <Button variant="outline" size="xs" disabled={pending} onClick={() => setOpen(true)}>
        {pending ? <Spinner data-icon="inline-start" /> : <XCircleIcon data-icon="inline-start" />}
        Cancelar assinatura
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar a assinatura de {organizationName}?</AlertDialogTitle>
            <AlertDialogDescription>
              A AbacatePay para de cobrar na hora (não dá para desfazer; o cliente teria de assinar de novo). O acesso continua
              até o fim do período já pago. Reembolso, se combinado, é feito no painel da AbacatePay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={() => run(() => adminCancelSubscription(organizationId), () => setOpen(false))}
            >
              Cancelar assinatura
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}