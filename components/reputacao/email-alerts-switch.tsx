"use client"

import { MailIcon } from "lucide-react"
import { useOptimistic, useTransition } from "react"
import { toast } from "sonner"

import { setEmailAlerts } from "@/app/(app)/reputacao/actions"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/** Liga/desliga os e-mails dos alertas urgentes (só dono ou administrador). */
export function EmailAlertsSwitch({ enabled, canManage }: { enabled: boolean; canManage: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(enabled)
  const [pending, startTransition] = useTransition()

  const control = (
    <label
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-full border bg-card px-3 text-sm shadow-xs",
        canManage ? "cursor-pointer" : "cursor-not-allowed opacity-70"
      )}
    >
      <MailIcon className="size-4 text-muted-foreground" />
      <span className="font-medium">Alertas por e-mail</span>
      <Switch
        size="sm"
        checked={optimistic}
        disabled={!canManage || pending}
        aria-label={optimistic ? "Desligar alertas por e-mail" : "Ligar alertas por e-mail"}
        onCheckedChange={(checked) =>
          startTransition(async () => {
            setOptimistic(checked)
            try {
              const result = await setEmailAlerts(checked)
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

  if (canManage) return control
  return (
    <Tooltip>
      <TooltipTrigger render={<span />}>{control}</TooltipTrigger>
      <TooltipContent>Só o dono ou um administrador da loja muda os alertas por e-mail.</TooltipContent>
    </Tooltip>
  )
}
