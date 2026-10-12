import { BotIcon, InboxIcon, LayersIcon, UserCheckIcon, type LucideIcon } from "lucide-react"
import Link from "next/link"

import { formatNumber } from "@/lib/format"
import { INBOX_TABS, type InboxTab } from "@/lib/questions/presentation"
import { cn } from "@/lib/utils"

const TAB_STYLE: Record<InboxTab, { icon: LucideIcon; icon_bg: string; ring: string }> = {
  responder: { icon: InboxIcon, icon_bg: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400", ring: "ring-amber-500" },
  ia: { icon: BotIcon, icon_bg: "bg-primary/10 text-primary", ring: "ring-primary" },
  voce: { icon: UserCheckIcon, icon_bg: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", ring: "ring-slate-500" },
  todas: { icon: LayersIcon, icon_bg: "bg-muted text-muted-foreground", ring: "ring-foreground/40" },
}

export function InboxTabs({
  active,
  counts,
  hrefFor,
}: {
  active: InboxTab
  counts: Record<InboxTab, number>
  hrefFor: (tab: InboxTab) => string
}) {
  return (
    <nav aria-label="Filtrar perguntas" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {(Object.keys(INBOX_TABS) as InboxTab[]).map((tab) => {
        const style = TAB_STYLE[tab]
        const isActive = tab === active
        const urgent = tab === "responder" && counts.responder > 0
        return (
          <Link
            key={tab}
            href={hrefFor(tab)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-xl bg-card p-3 transition-all sm:gap-3 sm:p-3.5",
              isActive ? cn("shadow-sm ring-2", style.ring) : "ring-1 ring-foreground/10 hover:ring-foreground/25"
            )}
          >
            <span className={cn("relative flex size-9 shrink-0 items-center justify-center rounded-lg sm:size-10", style.icon_bg)}>
              <style.icon className="size-5" />
              {urgent ? <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-amber-500 ring-2 ring-card" /> : null}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-xl leading-none font-semibold tabular-nums sm:text-2xl">{formatNumber(counts[tab])}</span>
              <span className="mt-1 text-xs leading-tight text-muted-foreground sm:truncate sm:text-sm">{INBOX_TABS[tab].label}</span>
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
