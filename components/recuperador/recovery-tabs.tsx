import { GaugeIcon, PackageOpenIcon, ScanSearchIcon } from "lucide-react"
import Link from "next/link"

import type { RecoveryTab } from "@/lib/dal/recovery"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

/** Abas do Recuperador (por link, para manter a conta e o filtro na URL). Mesmo visual das abas do shadcn. */
export function RecoveryTabs({
  active,
  waiting,
  hrefFor,
}: {
  active: RecoveryTab
  waiting: number
  hrefFor: (tab: RecoveryTab) => string
}) {
  const tabs = [
    { key: "visao" as const, label: "Visão geral", icon: GaugeIcon, count: null },
    { key: "devolucoes" as const, label: "Devoluções", icon: PackageOpenIcon, count: waiting },
    { key: "raio-x" as const, label: "Raio-X", icon: ScanSearchIcon, count: null },
  ]
  return (
    <nav
      aria-label="Seções do Recuperador"
      className="flex h-9 w-full items-center rounded-lg bg-muted p-[3px] text-muted-foreground sm:inline-flex sm:w-fit"
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active
        return (
          <Link
            key={tab.key}
            href={hrefFor(tab.key)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex h-full flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm sm:flex-none sm:px-3 font-medium whitespace-nowrap transition-all focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
              isActive ? "bg-background text-foreground shadow-sm dark:bg-input/30" : "text-foreground/60 hover:text-foreground"
            )}
          >
            <tab.icon className="hidden size-4 sm:block" />
            {tab.label}
            {tab.count ? (
              <span className="min-w-5 rounded-full bg-red-500/10 px-1.5 text-center text-xs leading-5 text-red-700 tabular-nums dark:text-red-300">
                {formatNumber(tab.count)}
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
