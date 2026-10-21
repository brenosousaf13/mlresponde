"use client"

import { useEffect, useRef } from "react"

/** Grade de quadrados que acendem de leve ao acaso (fundo do convite final, como no Escutaí). */
export function TileField({ className }: { className?: string; "aria-hidden"?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = ref.current
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const id = window.setInterval(() => {
      const cells = element.children
      for (let i = 0; i < 6; i++) {
        const cell = cells[Math.floor(Math.random() * cells.length)] as HTMLElement | undefined
        if (cell) cell.style.backgroundColor = `rgba(255,255,255,${(Math.random() * 0.07).toFixed(3)})`
      }
    }, 500)
    return () => window.clearInterval(id)
  }, [])
  return (
    <div ref={ref} aria-hidden className={className} style={{ gridTemplateColumns: "repeat(13, 1fr)", gridAutoRows: "calc(100vw / 13)" }}>
      {Array.from({ length: 13 * 9 }, (_, index) => (
        <i key={index} className="tile-cell border-r border-b border-white/[0.05]" />
      ))}
    </div>
  )
}