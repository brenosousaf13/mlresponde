import { Badge } from "@/components/ui/badge"
import { ORG_STAGE, ORG_STATUS, type Tone } from "@/lib/admin/labels"
import type { OrgStage, OrgStatus } from "@/lib/admin/types"
import { cn } from "@/lib/utils"

const TONES: Record<Tone, string> = {
  teal: "border-primary/30 bg-primary/10 text-brand-teal-ink",
  sage: "border-brand-teal/25 bg-brand-sage/70 text-brand-teal-ink",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  red: "border-destructive/30 bg-destructive/10 text-destructive",
  slate: "border-slate-400/30 bg-slate-500/10 text-slate-600 dark:text-slate-300",
  graphite: "border-transparent bg-brand-graphite text-brand-offwhite",
  violet: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
}

const DOTS: Record<Tone, string> = {
  teal: "bg-primary",
  sage: "bg-brand-teal/60",
  amber: "bg-amber-500",
  red: "bg-destructive",
  slate: "bg-slate-400",
  graphite: "bg-brand-graphite",
  violet: "bg-violet-500",
}

export function ToneBadge({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <Badge variant="outline" className={cn(TONES[tone], className)}>
      {children}
    </Badge>
  )
}

export function OrgStatusBadge({ status }: { status: OrgStatus }) {
  const info = ORG_STATUS[status] ?? ORG_STATUS.trial_expired
  return (
    <ToneBadge tone={info.tone}>
      <span title={info.hint}>{info.label}</span>
    </ToneBadge>
  )
}

/** Etapa de ativação: ponto colorido + texto (mais leve que um selo, para tabelas). */
export function StageLabel({ stage, className }: { stage: OrgStage; className?: string }) {
  const info = ORG_STAGE[stage] ?? ORG_STAGE.onboarding
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <span className={cn("size-1.5 shrink-0 rounded-full", DOTS[info.tone])} />
      {info.label}
    </span>
  )
}
