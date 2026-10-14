import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** Rótulo pequeno em fonte mono acima dos títulos ("COMO FUNCIONA"). */
export function Eyebrow({ children, tone = "light", className }: { children: ReactNode; tone?: "light" | "dark"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-mono text-[11px] font-medium tracking-[0.22em] uppercase",
        tone === "dark" ? "text-brand-mint" : "text-brand-teal-ink",
        className
      )}
    >
      <span aria-hidden className={cn("h-px w-6", tone === "dark" ? "bg-brand-mint/60" : "bg-brand-teal/60")} />
      {children}
    </span>
  )
}

/** Título de seção (h2) na fonte de destaque. */
export function SectionTitle({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <h2
      id={id}
      className={cn(
        "font-display text-[2.4rem] leading-[1.02] font-semibold tracking-[-0.035em] text-balance sm:text-5xl lg:text-[3.6rem]",
        className
      )}
    >
      {children}
    </h2>
  )
}

/** Largura padrão das seções. */
export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-5 sm:px-8", className)}>{children}</div>
}
