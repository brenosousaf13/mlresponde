"use client"

import { RefreshCwIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

import { refreshReputation } from "@/app/(app)/reputacao/actions"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

/** Lê de novo a reputação da conta no Mercado Livre (no máximo a cada 2 minutos). */
export function RefreshReputationButton({ accountId, disabled }: { accountId: string; disabled?: boolean }) {
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
            const result = await refreshReputation(accountId)
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
