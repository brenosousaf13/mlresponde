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
    <Card data-slot="return-follow-up" data-stage={followUp.stage} className={cn("border [--card-spacing:--spacing(5)]", FOLLOW_UP_BOX[followUp.tone])}>
      <CardHeader className="gap-2">
        <CardTitle className="text-lg font-semibold tracking-tight text-pretty">{followUp.title}</CardTitle>
        <CardDescription className="leading-relaxed text-pretty">{followUp.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <ol className="flex flex-col gap-4">
          {followUp.steps.map((step) => {
            const { Icon, className } = STEP_ICON[step.state]
            return (
              <li key={step.key} data-step={step.key} data-state={step.state} className="relative flex items-start gap-3 text-sm before:absolute before:top-7 before:-bottom-4 before:left-3.5 before:w-px before:bg-foreground/15 last:before:hidden">
                <span className={cn("relative flex size-7 shrink-0 items-center justify-center rounded-full border border-foreground/10 bg-card", step.state === "current" && "border-primary/30 bg-primary/10 ring-3 ring-primary/10")}>
                  <Icon className={cn("size-4", className)} />
                </span>
                <span className={cn("flex min-w-0 flex-1 flex-col gap-1 py-1", step.state === "current" && "rounded-lg bg-primary/5 px-3")}>
                  <span className={cn("font-medium", step.state === "upcoming" && "text-muted-foreground", step.state === "current" && "font-semibold text-primary")}>{step.label}</span>
                  {step.detail ? <span className="text-xs leading-relaxed text-muted-foreground">{step.detail}</span> : null}
                </span>
              </li>
            )
          })}
        </ol>
        {followUp.nextSteps.length ? (
          <div className={cn("flex flex-col gap-2.5 rounded-lg border border-foreground/10 bg-card/70 p-4", followUp.stale && "border-amber-500/30 bg-amber-500/5")}>
            <p className={cn("text-xs font-semibold", followUp.stale ? "text-amber-700 dark:text-amber-300" : "text-foreground")}>Próximos passos</p>
            <ul className="list-outside list-disc space-y-2 pl-4 text-sm leading-relaxed text-muted-foreground marker:text-foreground/40">
              {followUp.nextSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {followUp.watching ? (
          <p className="flex items-start gap-2 border-t border-foreground/10 pt-3 text-xs leading-relaxed text-muted-foreground">
            <ClockIcon className="mt-0.5 size-3.5 shrink-0" />
            Última leitura no Mercado Livre {timeAgo(syncedAt, now)}. Use “Atualizar” para ler agora.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
