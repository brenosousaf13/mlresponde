import { GaugeIcon, MessageSquareWarningIcon } from "lucide-react"
import Link from "next/link"

import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

export type ReputationTab = "visao" | "reclamacoes"

export function parseReputationTab(value: unknown): ReputationTab {
  return value === "reclamacoes" ? "reclamacoes" : "visao"
}

/** Abas do Escudo (por link, para manter a conta e o filtro na URL). Mesmo visual das abas do shadcn. */
export function ReputationTabs({
  active,
  openClaims,
  needsYou,
  hrefFor,
}: {
  active: ReputationTab
  openClaims: number
  needsYou: boolean
  hrefFor: (tab: ReputationTab) => string
}) {
  const tabs = [
    { key: "visao" as const, label: "Visão geral", icon: GaugeIcon, count: null },
    { key: "reclamacoes" as const, label: "Reclamações", icon: MessageSquareWarningIcon, count: openClaims },
  ]
  return (
    <nav aria-label="Seções do Escudo de Reputação" className="inline-flex h-9 w-fit items-center rounded-lg bg-muted p-[3px] text-muted-foreground">
      {tabs.map((tab) => {
        const isActive = tab.key === active
        return (
          <Link
            key={tab.key}
            href={hrefFor(tab.key)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex h-full items-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-all focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
              isActive ? "bg-background text-foreground shadow-sm dark:bg-input/30" : "text-foreground/60 hover:text-foreground"
            )}
          >
            <tab.icon className="size-4" />
            {tab.label}
            {tab.count ? (
              <span
                className={cn(
                  "min-w-5 rounded-full px-1.5 text-center text-xs leading-5 tabular-nums",
                  needsYou ? "bg-red-500/10 text-red-700 dark:text-red-300" : "bg-foreground/10 text-foreground/70"
                )}
              >
                {formatNumber(tab.count)}
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
