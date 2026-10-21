import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** Moldura de celular (capturas do app no celular). A tela corta a imagem no topo. */
export function Phone({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "relative mx-auto w-[15.5rem] rounded-[2.4rem] border-[7px] border-brand-graphite bg-brand-graphite shadow-[0_40px_90px_-30px] shadow-black/70 ring-1 ring-white/20",
        className
      )}
    >
      <span aria-hidden className="absolute top-2 left-1/2 z-10 h-4 w-16 -translate-x-1/2 rounded-full bg-brand-graphite" />
      <div className="relative h-[28rem] overflow-hidden rounded-[1.9rem] bg-white">{children}</div>
    </div>
  )
}