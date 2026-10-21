import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** Título de seção (h2) na fonte de destaque. */
export function SectionTitle({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <h2
      id={id}
      className={cn(
        "font-display text-[2.4rem] leading-[1.02] font-semibold tracking-[-0.03em] text-balance sm:text-5xl lg:text-[3.6rem]",
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