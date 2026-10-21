"use client"

import { useEffect, useId, useRef, type CSSProperties } from "react"

import { MARK, WORDMARK } from "@/components/brand/logo-paths"
import { cn } from "@/lib/utils"

import { useInView } from "./use-in-view"

/**
 * As letras da maanu como peças separadas. O arquivo da logo (components/brand/logo-paths.ts, gerado) traz um caminho
 * só; aqui ele é cortado nos sete pedaços e cada letra recebe o seu furo: m, a, a, n, u e o ponto.
 */
const PARTS = WORDMARK.path
  .split(/(?=M)/)
  .map((part) => part.trim())
  .filter(Boolean)

/** Ordem no arquivo: a (2º), a (1º), u, m, n, furo do 1º a, furo do 2º a. */
const LETTERS = [
  { key: "m", d: PARTS[3] },
  { key: "a1", d: `${PARTS[1]} ${PARTS[5]}` },
  { key: "a2", d: `${PARTS[0]} ${PARTS[6]}` },
  { key: "n", d: PARTS[4] },
  { key: "u", d: PARTS[2] },
] as const

const VIEWBOX = `0 0 ${WORDMARK.width} ${WORDMARK.height}`

type WordmarkProps = {
  className?: string
  /** Letras sobem uma a uma quando a logo aparece na tela. */
  intro?: boolean
  /** Atraso da entrada, em ms. */
  delay?: number
  /** O ponto dá um pulinho de tempos em tempos. */
  liveDot?: boolean
  /** Rótulo para leitores de tela (vazio = decorativo). */
  label?: string
}

/** "maanu." com cada letra animável (sobe ao entrar, pula ao passar o mouse). Cor das letras = cor do texto. */
export function AnimatedWordmark({ className, intro = false, delay = 0, liveDot = false, label = "" }: WordmarkProps) {
  const ref = useRef<HTMLDivElement>(null)
  const seen = useInView(ref, { once: true, threshold: 0.35 })
  const state = !intro ? undefined : seen ? "true" : "pending"
  return (
    <div ref={ref} className={cn("wm-clip", className)}>
      <svg
        viewBox={VIEWBOX}
        className="wm wm-logo"
        data-intro={state}
        role={label ? "img" : undefined}
        aria-label={label || undefined}
        aria-hidden={label ? undefined : true}
        focusable="false"
        style={{ "--wm-delay": `${delay}ms` } as CSSProperties}
      >
        {LETTERS.map((letter, index) => (
          <path key={letter.key} d={letter.d} fill="currentColor" className="wm-letter" style={{ "--i": index } as CSSProperties} />
        ))}
        <circle
          cx={WORDMARK.dot.cx}
          cy={WORDMARK.dot.cy}
          r={WORDMARK.dot.r}
          className={cn("wm-dot fill-brand-teal", liveDot && "wm-dot-live")}
          style={{ "--i": LETTERS.length } as CSSProperties}
        />
      </svg>
    </div>
  )
}

/**
 * Letras gigantes: só o contorno, e uma luz que segue o mouse (ou passeia sozinha) preenche as letras de teal.
 * A luz anda pela área marcada com `data-spot-area` mais próxima.
 */
export function SpotlightWordmark({ className }: { className?: string }) {
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, "")
  const gradientId = `spot-${rawId}`
  const svgRef = useRef<SVGSVGElement>(null)
  const gradientRef = useRef<SVGRadialGradientElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const seen = useInView(wrapRef, { once: true, threshold: 0.2 })

  useEffect(() => {
    const svg = svgRef.current
    const gradient = gradientRef.current
    if (!svg || !gradient) return
    const area = svg.closest<HTMLElement>("[data-spot-area]") ?? svg.parentElement
    if (!area) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    let raf = 0
    let visible = true
    let t = 0
    let lx = WORDMARK.width * 0.3
    let ly = WORDMARK.height * 0.5
    let pointer: { x: number; y: number } | null = null

    const toSvg = (clientX: number, clientY: number) => {
      const box = svg.getBoundingClientRect()
      return { x: ((clientX - box.left) / box.width) * WORDMARK.width, y: ((clientY - box.top) / box.height) * WORDMARK.height }
    }
    const onMove = (event: PointerEvent) => {
      pointer = toSvg(event.clientX, event.clientY)
    }
    const onLeave = () => {
      pointer = null
    }
    const frame = () => {
      raf = 0
      if (!visible) return
      t += reduce ? 0 : 0.012
      const autoX = WORDMARK.width * (0.5 + 0.46 * Math.sin(t * 0.9))
      const autoY = WORDMARK.height * (0.5 + 0.3 * Math.sin(t * 1.7 + 1))
      const tx = pointer ? pointer.x : autoX
      const ty = pointer ? pointer.y : autoY
      lx += (tx - lx) * 0.09
      ly += (ty - ly) * 0.09
      gradient.setAttribute("cx", lx.toFixed(1))
      gradient.setAttribute("cy", ly.toFixed(1))
      gradient.setAttribute("fx", lx.toFixed(1))
      gradient.setAttribute("fy", ly.toFixed(1))
      raf = requestAnimationFrame(frame)
    }
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible && !raf) raf = requestAnimationFrame(frame)
    })
    observer.observe(svg)
    area.addEventListener("pointermove", onMove)
    area.addEventListener("pointerleave", onLeave)
    raf = requestAnimationFrame(frame)
    return () => {
      observer.disconnect()
      area.removeEventListener("pointermove", onMove)
      area.removeEventListener("pointerleave", onLeave)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div ref={wrapRef} className={cn("wm-clip", className)}>
      <svg
        ref={svgRef}
        viewBox={VIEWBOX}
        className="wm"
        data-intro={seen ? "true" : "pending"}
        aria-hidden
        focusable="false"
      >
        <defs>
          <radialGradient id={gradientId} ref={gradientRef} gradientUnits="userSpaceOnUse" cx="190" cy="50" r="190" fx="190" fy="50">
            <stop offset="0" stopColor="var(--brand-mint)" />
            <stop offset="0.45" stopColor="var(--brand-teal)" stopOpacity="0.9" />
            <stop offset="1" stopColor="var(--brand-teal)" stopOpacity="0.05" />
          </radialGradient>
        </defs>
        {LETTERS.map((letter, index) => (
          <path
            key={letter.key}
            d={letter.d}
            fill={`url(#${gradientId})`}
            stroke="rgb(255 255 255 / 0.22)"
            strokeWidth="1.2"
            vectorEffect="non-scaling-stroke"
            className="wm-letter"
            style={{ "--i": index } as CSSProperties}
          />
        ))}
        <circle
          cx={WORDMARK.dot.cx}
          cy={WORDMARK.dot.cy}
          r={WORDMARK.dot.r}
          className="wm-dot wm-dot-live fill-brand-teal"
          style={{ "--i": LETTERS.length } as CSSProperties}
        />
      </svg>
    </div>
  )
}

/**
 * Letras gigantes preenchidas por um gradiente teal que corre (rodapé e convite final). Cada letra pula ao passar o
 * mouse e entra subindo.
 */
export function AuroraWordmark({ className }: { className?: string }) {
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, "")
  const gradientId = `aurora-${rawId}`
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const seen = useInView(wrapRef, { once: true, threshold: 0.25 })

  useEffect(() => {
    const svg = svgRef.current
    if (svg && window.matchMedia("(prefers-reduced-motion: reduce)").matches) svg.pauseAnimations?.()
  }, [])

  const width = WORDMARK.width
  return (
    <div ref={wrapRef} className={cn("wm-clip", className)}>
      <svg ref={svgRef} viewBox={VIEWBOX} className="wm" data-intro={seen ? "true" : "pending"} aria-hidden focusable="false">
        <defs>
          <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={width * 0.7} y2="60" spreadMethod="reflect">
            <stop offset="0" stopColor="var(--brand-mint)" />
            <stop offset="0.5" stopColor="var(--brand-teal)" />
            <stop offset="1" stopColor="#0e7c6b" />
            <animateTransform attributeName="gradientTransform" type="translate" from="0 0" to={`${width * 1.4} 0`} dur="14s" repeatCount="indefinite" />
          </linearGradient>
        </defs>
        {LETTERS.map((letter, index) => (
          <path key={letter.key} d={letter.d} fill={`url(#${gradientId})`} className="wm-letter" style={{ "--i": index } as CSSProperties} />
        ))}
        <circle
          cx={WORDMARK.dot.cx}
          cy={WORDMARK.dot.cy}
          r={WORDMARK.dot.r}
          className="wm-dot wm-dot-live"
          fill="var(--brand-mint)"
          style={{ "--i": LETTERS.length } as CSSProperties}
        />
      </svg>
    </div>
  )
}

/** Só o "m." (símbolo) com o ponto pulando, para espaços pequenos. */
export function MarkBounce({ className }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${MARK.width} ${MARK.height}`} aria-hidden focusable="false" className={cn("h-5 w-auto", className)}>
      <path d={MARK.path} fill="currentColor" />
      <circle cx={MARK.dot.cx} cy={MARK.dot.cy} r={MARK.dot.r} className="fill-brand-teal" />
    </svg>
  )
}

export { LETTERS, VIEWBOX as WORDMARK_VIEWBOX }