"use client"

import { useEffect, useRef, type RefObject } from "react"

/**
 * Roda `frame` a cada rolagem ou redimensionamento (no máximo 1 vez por quadro) enquanto `ref` está perto da tela.
 * O callback mexe direto no DOM (variáveis CSS), sem re-renderizar o React: a rolagem fica fluida.
 */
export function useScrollFrame<T extends HTMLElement>(ref: RefObject<T | null>, frame: (element: T, viewportHeight: number) => void) {
  const latest = useRef(frame)
  useEffect(() => {
    latest.current = frame
  })

  useEffect(() => {
    const element = ref.current
    if (!element) return
    let raf = 0
    let near = true
    const run = () => {
      raf = 0
      latest.current(element, window.innerHeight)
    }
    const schedule = () => {
      if (!raf && near) raf = requestAnimationFrame(run)
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        near = entry.isIntersecting
        if (near) schedule()
      },
      { rootMargin: "120% 0px 120% 0px" }
    )
    observer.observe(element)
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
    schedule()
    return () => {
      observer.disconnect()
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [ref])
}

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value))