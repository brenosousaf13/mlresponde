"use client"

import { useEffect, useRef } from "react"

/** Cores dos quadrados (marca maanu): teal, mint, teal escuro, branco suave e dois azuis-grafite. */
const PALETTE: [string, number][] = [
  ["#1FAF9A", 1],
  ["#7FE3CF", 0.85],
  ["#0E7C6B", 1],
  ["#F8FAFC", 0.4],
  ["#2B4A6B", 0.8],
  ["#243044", 1],
]

/**
 * Fundo do topo (como o do Escutaí): quadrados que só aparecem onde passa uma luz, que segue o mouse ou passeia
 * sozinha. Pausa fora da tela e com "reduzir movimento" fica parado.
 */
export function HeroCanvas({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext("2d")
    const area = canvas?.closest<HTMLElement>("[data-spot-area]") ?? canvas?.parentElement
    if (!canvas || !context || !area) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    let width = 0
    let height = 0
    let cell = 128
    let cells: { x: number; y: number; color: string; k: number; phase: number }[] = []
    let raf = 0
    let visible = true
    let t = 0
    let lx = 0
    let ly = 0
    let intensity = 0.7
    let pointer: { x: number; y: number } | null = null

    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      cell = window.innerWidth < 700 ? 72 : 112
      cells = []
      for (let y = 0; y < height; y += cell) {
        for (let x = 0; x < width; x += cell) {
          if (Math.random() < 0.5) continue
          const [color, alpha] = PALETTE[Math.floor(Math.random() * PALETTE.length)]
          cells.push({ x, y, color, k: alpha * (0.55 + Math.random() * 0.45), phase: Math.random() * 6.28 })
        }
      }
      if (!lx) {
        lx = width * 0.5
        ly = height * 0.35
      }
    }

    const draw = () => {
      raf = 0
      if (!visible) return
      t += reduce ? 0 : 0.0045
      const autoX = width * (0.5 + 0.44 * Math.sin(t * 1.1))
      const autoY = height * (0.4 + 0.3 * Math.sin(t * 1.7 + 1))
      const targetX = pointer ? pointer.x : autoX
      const targetY = pointer ? pointer.y : autoY
      const targetIntensity = pointer ? 1.5 : 0.62
      lx += (targetX - lx) * 0.06
      ly += (targetY - ly) * 0.06
      intensity += (targetIntensity - intensity) * 0.05
      context.clearRect(0, 0, width, height)
      const radius = Math.max(width, height) * (0.2 + 0.03 * intensity)
      for (const square of cells) {
        const dx = square.x + cell / 2 - lx
        const dy = square.y + cell / 2 - ly
        const distance = Math.sqrt(dx * dx + dy * dy) / radius
        let alpha = Math.max(0, 1 - distance)
        alpha = Math.pow(alpha, 1.3) * intensity * square.k * (0.85 + 0.15 * Math.sin(t * 6 + square.phase))
        if (alpha < 0.01) continue
        context.globalAlpha = Math.min(0.7, alpha * 0.8)
        context.fillStyle = square.color
        context.fillRect(square.x + 2, square.y + 2, cell - 4, cell - 4)
      }
      context.globalAlpha = 1
      if (!reduce || pointer) raf = requestAnimationFrame(draw)
    }

    const start = () => {
      if (!raf) raf = requestAnimationFrame(draw)
    }
    const onMove = (event: PointerEvent) => {
      const box = canvas.getBoundingClientRect()
      pointer = { x: event.clientX - box.left, y: event.clientY - box.top }
      start()
    }
    const onLeave = () => {
      pointer = null
    }
    const onResize = () => {
      build()
      start()
    }
    build()
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) start()
    })
    observer.observe(canvas)
    area.addEventListener("pointermove", onMove)
    area.addEventListener("pointerleave", onLeave)
    window.addEventListener("resize", onResize)
    start()
    return () => {
      observer.disconnect()
      area.removeEventListener("pointermove", onMove)
      area.removeEventListener("pointerleave", onLeave)
      window.removeEventListener("resize", onResize)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return <canvas ref={canvasRef} aria-hidden className={className} />
}