"use client"

import { useEffect, useRef, useState } from "react"

import { useScrollFrame } from "./use-scroll-frame"

/** Cores das transições (as mesmas dos fundos das seções vizinhas). */
export const PIXEL_COLORS = {
  night: "#0b1220",
  light: "#f8fafc",
  deep: "#0c4a43",
  tealDark: "#0c4a43",
} as const

export type PixelColor = keyof typeof PIXEL_COLORS

const ROWS = 4

const NAV_MODE: Record<PixelColor, "dark" | "light"> = { night: "dark", light: "light", deep: "dark", tealDark: "dark" }

/**
 * Transição "em pixels" entre duas seções (como a do Escutaí): quadrados da cor da próxima seção sobem pela borda da
 * anterior conforme a página rola, alguns passando antes por teal, mint ou grafite. Fica por cima das 3 últimas linhas
 * da seção de cima (margem negativa) e a quarta linha ocupa o lugar entre as duas.
 */
export function PixelTransition({ from, to }: { from: PixelColor; to: PixelColor }) {
  const ref = useRef<HTMLDivElement>(null)
  const cellsRef = useRef<{ t: number; accent: string | null }[]>([])
  const lastRef = useRef(-9)
  const [columns, setColumns] = useState(0)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const build = () => {
      const size = element.firstElementChild?.getBoundingClientRect().height || 96
      const cols = Math.max(1, Math.ceil(element.clientWidth / size))
      const accents = to === "light" ? ["#1FAF9A", "#7FE3CF", "#0F172A"] : ["#1FAF9A", "#7FE3CF", "#F8FAFC"]
      cellsRef.current = Array.from({ length: cols * ROWS }, (_, index) => {
        const row = Math.floor(index / cols)
        const base = (ROWS - 1 - row) / (ROWS - 1)
        return { t: base * 0.62 + Math.random() * 0.36, accent: Math.random() < 0.42 ? accents[Math.floor(Math.random() * accents.length)] : null }
      })
      lastRef.current = -9
      setColumns(cols)
    }
    const observer = new ResizeObserver(build)
    observer.observe(element)
    return () => observer.disconnect()
  }, [to])

  useScrollFrame(ref, (element, vh) => {
    const box = element.getBoundingClientRect()
    const progress = (vh - box.top) / (box.height + vh * 0.5)
    const value = Math.round(Math.min(1.2, Math.max(-0.2, progress * 1.25 - 0.1)) * 80) / 80
    // A barra do topo olha este atributo: passada a metade, o fundo já é o da próxima seção.
    element.dataset.nav = value > 0.45 ? NAV_MODE[to] : NAV_MODE[from]
    if (value === lastRef.current) return
    lastRef.current = value
    const toColor = PIXEL_COLORS[to]
    const children = element.children
    const cells = cellsRef.current
    for (let i = 0; i < children.length; i++) {
      const cell = cells[i]
      if (!cell) continue
      const row = Math.floor(i / Math.max(1, columns))
      let color = row === ROWS - 1 ? PIXEL_COLORS[from] : "transparent"
      if (value > cell.t) color = toColor
      else if (value > cell.t - 0.16 && cell.accent) color = cell.accent
      ;(children[i] as HTMLElement).style.backgroundColor = color
    }
  })

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none relative z-10 -mt-[calc(var(--cell)*3)] grid w-full overflow-hidden [--cell:clamp(56px,6.6vw,112px)]"
      style={{ gridTemplateColumns: `repeat(${Math.max(columns, 1)}, var(--cell))`, gridAutoRows: "var(--cell)" }}
    >
      {Array.from({ length: Math.max(columns, 1) * ROWS }, (_, index) => (
        <i key={index} className="block" style={{ backgroundColor: Math.floor(index / Math.max(columns, 1)) === ROWS - 1 ? PIXEL_COLORS[from] : "transparent" }} />
      ))}
    </div>
  )
}