"use client"

import { useState } from "react"

import { BUSINESS_HOURS, WEEKDAYS, isBusinessHour } from "@/lib/results/metrics"
import { cn } from "@/lib/utils"

const HOUR_LABELS = [0, 6, 12, 18]

function describe(dow: number, hour: number, total: number, ai: number) {
  const when = `${WEEKDAYS[dow]}, ${String(hour).padStart(2, "0")}h–${String((hour + 1) % 24).padStart(2, "0")}h`
  if (!total) return `${when}: nenhuma pergunta`
  const aiPart = ai ? ` · ${ai} pela IA` : ""
  return `${when}: ${total} pergunta${total === 1 ? "" : "s"}${aiPart}${isBusinessHour(dow + 1, hour) ? "" : " · fora do horário comercial"}`
}

/** Mapa de calor: dia da semana × hora em que os compradores perguntam. */
export function HoursHeatmap({ matrix, aiMatrix, max }: { matrix: number[][]; aiMatrix: number[][]; max: number }) {
  const [hovered, setHovered] = useState<{ dow: number; hour: number } | null>(null)
  const caption = hovered
    ? describe(hovered.dow, hovered.hour, matrix[hovered.dow][hovered.hour], aiMatrix[hovered.dow][hovered.hour])
    : "Passe o mouse (ou toque) num quadrado para ver os detalhes."

  return (
    <div className="flex flex-col gap-3">
      <div
        className="grid grid-cols-[2.25rem_repeat(24,minmax(0,1fr))] gap-[3px]"
        role="img"
        aria-label="Perguntas por dia da semana e hora"
        onMouseLeave={() => setHovered(null)}
      >
        {matrix.map((row, dow) => (
          <div key={WEEKDAYS[dow]} className="contents">
            <span className={cn("self-center pr-1 text-xs", dow >= 5 ? "text-muted-foreground" : "text-foreground")}>
              {WEEKDAYS[dow]}
            </span>
            {row.map((value, hour) => {
              const intensity = max > 0 && value > 0 ? 18 + Math.round((value / max) * 82) : 0
              const active = hovered?.dow === dow && hovered.hour === hour
              return (
                <button
                  key={hour}
                  type="button"
                  aria-label={describe(dow, hour, value, aiMatrix[dow][hour])}
                  onMouseEnter={() => setHovered({ dow, hour })}
                  onFocus={() => setHovered({ dow, hour })}
                  onClick={() => setHovered({ dow, hour })}
                  className={cn(
                    "aspect-square min-h-2.5 rounded-[3px] outline-none transition-transform",
                    "focus-visible:ring-2 focus-visible:ring-ring",
                    active && "scale-125 ring-2 ring-foreground/70"
                  )}
                  style={{
                    backgroundColor: intensity
                      ? `color-mix(in oklch, var(--chart-1) ${intensity}%, var(--muted))`
                      : "var(--muted)",
                  }}
                />
              )
            })}
          </div>
        ))}
        <span />
        {Array.from({ length: 24 }, (_, hour) => (
          <span key={hour} className="relative h-4">
            {hour >= BUSINESS_HOURS.open && hour < BUSINESS_HOURS.close ? (
              <span className="absolute inset-x-[-1.5px] top-0.5 h-1 bg-brand-slate" />
            ) : null}
            {HOUR_LABELS.includes(hour) ? (
              <span className="absolute top-1.5 left-0 text-[10px] text-muted-foreground tabular-nums">{hour}h</span>
            ) : null}
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p aria-live="polite" className="min-h-4 text-foreground">
          {caption}
        </p>
        <p className="flex shrink-0 items-center gap-1.5">
          <span className="inline-block h-1 w-4 rounded-full bg-brand-slate" />
          horário comercial
          <span className="ml-2 inline-flex items-center gap-0.5">
            menos
            <span className="inline-block size-2.5 rounded-[3px] bg-muted" />
            <span className="inline-block size-2.5 rounded-[3px] bg-chart-1/50" />
            <span className="inline-block size-2.5 rounded-[3px] bg-chart-1" />
            mais
          </span>
        </p>
      </div>
    </div>
  )
}