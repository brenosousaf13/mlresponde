"use client"

import { useRef, type CSSProperties, type ReactNode } from "react"

import { cn } from "@/lib/utils"

import { useInView } from "./use-in-view"

/** Entra suave (sobe, aparece e desfoca) quando chega na tela. Estilos em app/(site)/site.css. */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  /** Atraso em ms (entrada em cascata). */
  delay?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const visible = useInView(ref, { once: true, rootMargin: "0px 0px -8% 0px", threshold: 0.12 })
  return (
    <div
      ref={ref}
      data-reveal=""
      data-visible={visible ? "true" : undefined}
      style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}
      className={cn(className)}
    >
      {children}
    </div>
  )
}
