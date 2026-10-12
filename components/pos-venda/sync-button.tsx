"use client"

import { RefreshCwIcon } from "lucide-react"
import { useTransition } from "react"
import { toast } from "sonner"

import { syncConversations } from "@/app/(app)/pos-venda/actions"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

export function AfterSaleSyncButton() {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      variant="outline"
      className="bg-card"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const result = await syncConversations()
            if (result.ok) toast.success(result.message)
            else toast.error(result.message)
          } catch {
            toast.error("Não foi possível sincronizar agora.")
          }
        })
      }
    >
      {pending ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
      Sincronizar com o ML
    </Button>
  )
}
