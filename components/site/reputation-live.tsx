"use client"

import { useEffect, useRef, useState } from "react"

import { formatBRLWhole } from "@/lib/site/calculator"

import { useInView, usePrefersReducedMotion } from "./use-in-view"

const pad = (value: number) => String(value).padStart(2, "0")

/** Contagem regressiva de exemplo (hh:mm:ss) que só corre com o cartão na tela. Recomeça quando chega a zero. */
export function LiveCountdown({ seconds }: { seconds: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { threshold: 0.1 })
  const reduced = usePrefersReducedMotion()
  const [left, setLeft] = useState(seconds)

  useEffect(() => {
    if (!inView || reduced) return
    const id = window.setInterval(() => setLeft((value) => (value > 1 ? value - 1 : seconds)), 1000)
    return () => window.clearInterval(id)
  }, [inView, reduced, seconds])

  const hours = Math.floor(left / 3600)
  const minutes = Math.floor((left % 3600) / 60)
  return (
    <span ref={ref} className="tabular-nums">
      {pad(hours)}:{pad(minutes)}:{pad(left % 60)}
    </span>
  )
}

/** Valor em reais que sobe do zero quando aparece na tela (uma vez). Sem JavaScript ou com "reduzir movimento": o valor final. */
export function CountUpBRL({ value, durationMs = 1400 }: { value: number; durationMs?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, threshold: 0.4 })
  const reduced = usePrefersReducedMotion()
  const [shown, setShown] = useState(value)

  useEffect(() => {
    if (!inView || reduced) return
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs)
      setShown(Math.round(value * (1 - (1 - progress) ** 3)))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [inView, reduced, value, durationMs])

  return (
    <span ref={ref} className="tabular-nums">
      {formatBRLWhole(shown)}
    </span>
  )
}
