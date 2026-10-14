"use client"

import { useEffect, useState } from "react"

function format(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

/** Há quanto tempo a pessoa está na página (conta desde que a página abriu). */
export function TimeOnPage() {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const start = performance.now()
    const id = window.setInterval(() => setSeconds(Math.floor((performance.now() - start) / 1000)), 1000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <time dateTime={`PT${seconds}S`} className="tabular-nums">
      {format(seconds)}
    </time>
  )
}
