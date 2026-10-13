import { cn } from "@/lib/utils"

/**
 * Anel com os dias que faltam do teste grátis: o arco mostra a parte do teste que ainda resta.
 * Teal no dia a dia; âmbar nos últimos dias.
 */
export function TrialRing({
  daysLeft,
  remaining,
  urgent = false,
  className,
}: {
  daysLeft: number
  /** 0 a 1. */
  remaining: number
  urgent?: boolean
  className?: string
}) {
  const radius = 15
  const circumference = 2 * Math.PI * radius
  const visible = Math.min(1, Math.max(0.04, remaining))
  return (
    <span className={cn("relative inline-flex size-9 shrink-0 items-center justify-center", className)} aria-hidden>
      <svg viewBox="0 0 36 36" className="absolute inset-0 size-full! -rotate-90">
        <circle cx="18" cy="18" r={radius} fill="none" strokeWidth="3" className="stroke-border" />
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - visible)}
          className={cn("transition-[stroke-dashoffset] duration-700", urgent ? "stroke-amber-500" : "stroke-brand-teal")}
        />
      </svg>
      <span className="relative text-[0.8rem] leading-none font-semibold tabular-nums">{daysLeft}</span>
    </span>
  )
}
