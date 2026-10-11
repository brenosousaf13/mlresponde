"use client"

import { RefreshCwIcon } from "lucide-react"
import { useTransition } from "react"
import { toast } from "sonner"

import { syncQuestions } from "@/app/(app)/perguntas/actions"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

export function SyncButton() {
  const [pending, startTransition] = useTransition()

  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const result = await syncQuestions()
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
