"use client"

import { RefreshCwIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

import { syncClaimAction } from "@/app/(app)/reputacao/reclamacoes/actions"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

/** Lê a reclamação de novo no Mercado Livre. */
export function SyncClaimButton({ claimRowId, disabled }: { claimRowId: string; disabled?: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <Button
      variant="outline"
      className="bg-card"
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          const result = await syncClaimAction(claimRowId).catch(() => ({ ok: false, message: "Não foi possível atualizar agora." }))
          if (result.ok) {
            toast.success(result.message)
            router.refresh()
          } else toast.error(result.message)
        })
      }
    >
      {pending ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
      {pending ? "Atualizando..." : "Atualizar"}
    </Button>
  )
}
