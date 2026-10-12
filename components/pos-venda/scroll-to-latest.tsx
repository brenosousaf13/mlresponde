"use client"

import { useEffect, useRef } from "react"

/** Leva a conversa até a última mensagem ao abrir (só no computador, onde a conversa rola dentro do cartão). */
export function ScrollToLatest() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) ref.current?.scrollIntoView({ block: "end" })
  }, [])
  return <div ref={ref} aria-hidden />
}
