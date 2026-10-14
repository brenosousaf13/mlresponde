"use client"

import { useEffect, useState, useSyncExternalStore, type RefObject } from "react"

type InViewOptions = {
  /** Depois de aparecer uma vez, continua "visível" (animações de entrada). */
  once?: boolean
  rootMargin?: string
  threshold?: number
}

/** O elemento está na tela? (IntersectionObserver; sem suporte, considera visível.) */
export function useInView<T extends Element>(
  ref: RefObject<T | null>,
  { once = false, rootMargin = "0px", threshold = 0.2 }: InViewOptions = {}
): boolean {
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (typeof IntersectionObserver === "undefined") {
      const id = window.setTimeout(() => setInView(true), 0)
      return () => window.clearTimeout(id)
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true)
          if (once) observer.disconnect()
        } else if (!once) {
          setInView(false)
        }
      },
      { rootMargin, threshold }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, once, rootMargin, threshold])

  return inView
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

function subscribeReducedMotion(callback: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY)
  query.addEventListener("change", callback)
  return () => query.removeEventListener("change", callback)
}

/** "Reduzir movimento" ligado no sistema: as animações viram estados finais. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false
  )
}
