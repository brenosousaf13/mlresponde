"use client"

import { useEffect, useRef, useState } from "react"

import { clamp01 } from "./use-scroll-frame"
import { useInView } from "./use-in-view"

/** Número que sobe de 0 até o valor quando aparece na tela (sem "reduzir movimento": já nasce no valor final). */
export function CountUp({
  value,
  format,
  duration = 2200,
  className,
}: {
  value: number
  format: (value: number) => string
  duration?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const seen = useInView(ref, { once: true, threshold: 0.4 })
  const [progress, setProgress] = useState(1)

  useEffect(() => {
    if (!seen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    let raf = 0
    const start = performance.now()
    const step = (now: number) => {
      const t = clamp01((now - start) / duration)
      setProgress(1 - Math.pow(1 - t, 3))
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [seen, duration])

  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {format(value * progress)}
    </span>
  )
}