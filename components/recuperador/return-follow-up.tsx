import { CheckCircle2Icon, CircleDotIcon, CircleIcon, ClockIcon, XCircleIcon } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { timeAgo } from "@/lib/format"
import type { FollowUp, FollowUpStepState } from "@/lib/recovery/follow-up"
import { FOLLOW_UP_BOX } from "@/lib/recovery/presentation"
import { cn } from "@/lib/utils"

const STEP_ICON: Record<FollowUpStepState, { Icon: typeof CircleIcon; className: string }> = {
  done: { Icon: CheckCircle2Icon, className: "text-emerald-600" },
  current: { Icon: CircleDotIcon, className: "text-primary" },
  upcoming: { Icon: CircleIcon, className: "text-muted-foreground" },
  failed: { Icon: XCircleIcon, className: "text-amber-600" },
}

/**
 * Acompanhamento depois do envio (em análise no ML, ressarcido, ML manteve a decisão...). Mostra o estado, os passos, o
 * que acontece em cada desfecho e quando a maanu leu a devolução no ML pela última vez (nada de atualização silenciosa).
 * Contrato: FollowUp (lib/recovery/follow-up.ts); `syncedAt` = recovery_returns.synced_at.
 */
export function ReturnFollowUpCard({ followUp, syncedAt, now }: { followUp: FollowUp; syncedAt: string; now: Date }) {
  return (
    <Card data-slot="return-follow-up" data-stage={followUp.stage} className={cn(FOLLOW_UP_BOX[followUp.tone])}>
      <CardHeader>
        <CardTitle className="text-lg">{followUp.title}</CardTitle>
        <CardDescription>{followUp.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ol className="flex flex-col gap-2">
          {followUp.steps.map((step) => {
            const { Icon, className } = STEP_ICON[step.state]
            return (
              <li key={step.key} data-step={step.key} data-state={step.state} className="flex items-start gap-2.5 text-sm">
                <Icon className={cn("mt-0.5 size-4 shrink-0", className)} />
                <span className="flex flex-col">
                  <span className={cn("font-medium", step.state === "upcoming" && "text-muted-foreground")}>{step.label}</span>
                  {step.detail ? <span className="text-xs text-muted-foreground">{step.detail}</span> : null}
                </span>
              </li>
            )
          })}
        </ol>
        {followUp.nextSteps.length ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">Próximos passos</p>
            <ul className="list-inside list-disc text-sm text-muted-foreground">
              {followUp.nextSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {followUp.watching ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ClockIcon className="size-3.5" />
            Última leitura no Mercado Livre {timeAgo(syncedAt, now)}. Use “Atualizar” para ler agora.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}