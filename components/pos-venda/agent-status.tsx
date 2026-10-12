"use client"

import { useOptimistic, useTransition } from "react"
import { toast } from "sonner"

import { setAgentEnabled } from "@/app/(app)/pos-venda/actions"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/** Liga/pausa o agente de pós-venda de uma conta (pílula discreta no cabeçalho). */
export function AgentStatus({
  accountId,
  enabled,
  disabled,
  disabledReason,
}: {
  accountId: string
  enabled: boolean
  disabled?: boolean
  disabledReason?: string
}) {
  const [optimistic, setOptimistic] = useOptimistic(enabled)
  const [pending, startTransition] = useTransition()

  const control = (
    <label
      className={cn(
        "inline-flex h-8 items-center gap-2.5 rounded-full border bg-card px-3 text-sm shadow-xs",
        disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"
      )}
    >
      <span className={cn("size-2 rounded-full", optimistic ? "bg-brand-teal" : "bg-muted-foreground/40")} aria-hidden />
      <span className="font-medium">{optimistic ? "Agente respondendo" : "Agente pausado"}</span>
      <Switch
        size="sm"
        checked={optimistic}
        disabled={disabled || pending}
        aria-label={optimistic ? "Pausar o agente de pós-venda" : "Ligar o agente de pós-venda"}
        onCheckedChange={(checked) =>
          startTransition(async () => {
            setOptimistic(checked)
            try {
              const result = await setAgentEnabled(accountId, checked)
              if (result.ok) toast.success(result.message)
              else toast.error(result.message)
            } catch {
              toast.error("Não foi possível alterar agora.")
            }
          })
        }
      />
    </label>
  )

  if (!disabled || !disabledReason) return control
  return (
    <Tooltip>
      <TooltipTrigger render={<span />}>{control}</TooltipTrigger>
      <TooltipContent>{disabledReason}</TooltipContent>
    </Tooltip>
  )
}
