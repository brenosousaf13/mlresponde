import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** Faixa que corre sem parar (pausa ao passar o mouse). O conteúdo é repetido para o laço não ter emenda. */
export function Marquee({
  children,
  className,
  speed = 46,
  reverse = false,
}: {
  children: ReactNode
  className?: string
  /** Segundos para uma volta. */
  speed?: number
  reverse?: boolean
}) {
  return (
    <div className={cn("marquee site-fade-x overflow-hidden", className)} style={{ "--marquee-speed": `${speed}s` } as React.CSSProperties}>
      <div className={cn("marquee-track", reverse && "rev")}>
        <div className="flex shrink-0 items-center">{children}</div>
        <div className="flex shrink-0 items-center" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  )
}