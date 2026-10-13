import { Progress } from "@/components/ui/progress"
import { formatNumber } from "@/lib/format"
import type { Quota } from "@/lib/plans/usage"
import { cn } from "@/lib/utils"

const INDICATOR = {
  unlimited: "",
  ok: "",
  warning: "[&_[data-slot=progress-indicator]]:bg-amber-500",
  reached: "[&_[data-slot=progress-indicator]]:bg-destructive",
} as const

/** Barra de uso de um limite do plano ("312 de 500"). */
export function UsageMeter({
  label,
  quota,
  hint,
  className,
}: {
  label: string
  quota: Quota
  hint?: React.ReactNode
  className?: string
}) {
  const value =
    quota.limit === null ? `${formatNumber(quota.used)} · sem limite` : `${formatNumber(quota.used)} de ${formatNumber(quota.limit)}`
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span
          className={cn(
            "shrink-0 tabular-nums text-muted-foreground",
            quota.level === "warning" && "text-amber-700 dark:text-amber-400",
            quota.level === "reached" && "font-medium text-destructive"
          )}
        >
          {value}
        </span>
      </div>
      {quota.limit === null ? null : (
        <Progress value={quota.percent} aria-label={`${label}: ${value}`} className={INDICATOR[quota.level]} />
      )}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
