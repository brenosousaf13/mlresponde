"use client"

import { CopyIcon, RefreshCwIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

import { refreshRecovery, syncReturnAction } from "@/app/(app)/recuperador/actions"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

/** Lê de novo as devoluções da conta no Mercado Livre (no máximo 1 vez por minuto). */
export function RefreshRecoveryButton({ accountId, disabled }: { accountId: string; disabled?: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <Button
      variant="outline"
      className="bg-card"
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const result = await refreshRecovery(accountId)
            if (result.ok) {
              toast.success(result.message)
              router.refresh()
            } else toast.error(result.message)
          } catch {
            toast.error("Não foi possível atualizar agora.")
          }
        })
      }
    >
      {pending ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
      {pending ? "Atualizando..." : "Atualizar agora"}
    </Button>
  )
}

/** Lê de novo uma devolução no Mercado Livre. */
export function SyncReturnButton({ returnRowId }: { returnRowId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <Button
      variant="outline"
      className="bg-card"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const result = await syncReturnAction(returnRowId)
            if (result.ok) {
              toast.success(result.message)
              router.refresh()
            } else toast.error(result.message)
          } catch {
            toast.error("Não foi possível atualizar agora.")
          }
        })
      }
    >
      {pending ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
      {pending ? "Atualizando..." : "Atualizar"}
    </Button>
  )
}

/** Copia o texto pronto de um achado (para colar no Mercado Livre). */
export function CopyTextButton({ text, label = "Copiar texto" }: { text: string; label?: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="bg-card"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          toast.success("Texto copiado. Cole no Mercado Livre ao pedir a revisão.")
        } catch {
          toast.error("Não deu para copiar. Selecione o texto e copie à mão.")
        }
      }}
    >
      <CopyIcon data-icon="inline-start" />
      {label}
    </Button>
  )
}
