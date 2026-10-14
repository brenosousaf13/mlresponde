"use client"

import { Moon, Sun } from "lucide-react"
import { useRef } from "react"

import { cn } from "@/lib/utils"

import { useInView } from "./use-in-view"

/** Perguntas por hora num dia de exemplo (mais à noite, como é comum no varejo online). */
const PER_HOUR: readonly number[] = [1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 1, 2, 1, 0, 1, 0, 1, 1, 2, 3, 3, 2, 1]
const OPEN_HOUR = 8
const CLOSE_HOUR = 18
const SWEEP_MS = 4200

const isOffline = (hour: number) => hour < OPEN_HOUR || hour >= CLOSE_HOUR
const TOTAL = PER_HOUR.reduce((sum, count) => sum + count, 0)
const OFFLINE = PER_HOUR.reduce((sum, count, hour) => sum + (isOffline(hour) ? count : 0), 0)

/** "Um dia de perguntas": a linha da maanu passa e cada pergunta esperando (âmbar) vira respondida (teal). */
export function DayTimeline() {
  const ref = useRef<HTMLDivElement>(null)
  const run = useInView(ref, { once: true, threshold: 0.35 })

  return (
    <div
      ref={ref}
      data-run={run ? "true" : "false"}
      className="group/timeline rounded-[1.75rem] border border-border bg-white p-5 shadow-[0_30px_80px_-40px] shadow-slate-900/20 sm:p-8"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-display text-xl font-semibold tracking-tight">Um dia de perguntas no seu anúncio</p>
          <p className="text-sm text-muted-foreground">Exemplo ilustrativo de uma loja com atendimento das 8h às 18h.</p>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <li className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-amber-400" aria-hidden /> Esperando você
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-brand-teal" aria-hidden /> Respondida pela maanu
          </li>
        </ul>
      </div>

      <div className="mt-8">
        <div className="relative">
          <div aria-hidden className="relative grid h-40 grid-cols-24 items-end">
            {PER_HOUR.map((count, hour) => (
              <div
                key={hour}
                className={cn(
                  "flex h-full flex-col-reverse items-center gap-1 pb-2 sm:gap-1.5",
                  isOffline(hour) ? "bg-slate-100/80" : "bg-transparent",
                  hour === 0 && "rounded-l-xl",
                  hour === 23 && "rounded-r-xl"
                )}
              >
                {Array.from({ length: count }, (_, i) => (
                  <span
                    key={i}
                    style={{ transitionDelay: `${((hour + 0.5) / 24) * SWEEP_MS}ms` }}
                    className="site-motion size-2 rounded-full bg-amber-400 ring-2 sm:size-3 sm:ring-4 ring-amber-400/15 transition-[background-color,box-shadow] duration-300 group-data-[run=true]/timeline:bg-brand-teal group-data-[run=true]/timeline:ring-brand-teal/20"
                  />
                ))}
              </div>
            ))}

            <span className="pointer-events-none absolute top-3 left-3 inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
              <Moon className="size-3.5" /> <span className="hidden sm:inline">você offline</span>
            </span>
            <span
              className="pointer-events-none absolute top-3 inline-flex items-center gap-1 text-[11px] font-medium text-slate-500"
              style={{ left: `calc(${(OPEN_HOUR / 24) * 100}% + 0.75rem)` }}
            >
              <Sun className="size-3.5" /> <span className="hidden sm:inline">seu horário</span>
            </span>
            <span
              className="pointer-events-none absolute top-3 inline-flex items-center gap-1 text-[11px] font-medium text-slate-500"
              style={{ left: `calc(${(CLOSE_HOUR / 24) * 100}% + 0.75rem)` }}
            >
              <Moon className="size-3.5" /> <span className="hidden sm:inline">você offline</span>
            </span>

            {/* Linha da maanu varrendo o dia */}
            <span className="site-motion pointer-events-none absolute inset-y-0 left-0 w-0.5 rounded-full bg-brand-teal opacity-0 shadow-[0_0_18px_2px] shadow-brand-teal/60 group-data-[run=true]/timeline:animate-[site-sweep_4.2s_linear_forwards] group-data-[run=true]/timeline:opacity-100">
              <span className="absolute -top-1 left-1/2 size-2.5 -translate-x-1/2 rounded-full bg-brand-teal" />
            </span>
          </div>

          <div aria-hidden className="mt-2 grid grid-cols-24 font-mono text-[10px] text-muted-foreground">
            {PER_HOUR.map((_, hour) => (
              <span key={hour} className="text-center">
                {hour % 6 === 0 ? `${hour}h` : hour % 3 === 0 ? <span className="hidden sm:inline">{hour}h</span> : ""}
              </span>
            ))}
          </div>
        </div>
      </div>

      <dl className="mt-8 grid gap-4 border-t border-border pt-6 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-muted-foreground">Perguntas no dia</dt>
          <dd className="font-display text-3xl font-semibold tracking-tight">{TOTAL}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Chegaram com você offline</dt>
          <dd className="font-display text-3xl font-semibold tracking-tight text-amber-600">{OFFLINE}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Esperaram você voltar</dt>
          <dd className="font-display text-3xl font-semibold tracking-tight text-brand-teal-ink">
            0 <span className="text-base font-medium text-muted-foreground">(a maanu respondeu na hora)</span>
          </dd>
        </div>
      </dl>
      <p className="sr-only">
        No exemplo, {TOTAL} perguntas chegam ao longo do dia, {OFFLINE} delas fora do horário de atendimento, e a maanu responde
        todas.
      </p>
    </div>
  )
}
