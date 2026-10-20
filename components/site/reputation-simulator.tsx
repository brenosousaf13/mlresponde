"use client"

import { Check, Gauge, Minus, MoveHorizontal, ShieldAlert, ShieldCheck, X } from "lucide-react"
import { useState, type CSSProperties } from "react"

import { Slider } from "@/components/ui/slider"
import type { Band } from "@/lib/reputation/thresholds"
import {
  DEMO_CLAIMS,
  DEMO_PERIOD_DAYS,
  DEMO_SALES,
  DEMO_SCALE_MAX,
  demoSentence,
  demoZones,
  formatPercent,
  perksFor,
  simulateClaims,
  type PerkStatus,
} from "@/lib/site/reputation-demo"
import { cn } from "@/lib/utils"

/** Cores do termômetro do ML (não são da marca), em versão para fundo escuro. */
const BAND_STYLE: Record<Band, { name: string; text: string; zone: string; glow: string; thumb: string }> = {
  green: {
    name: "Verde",
    text: "text-emerald-400",
    zone: "bg-emerald-500",
    glow: "bg-emerald-500/25",
    thumb: "[&_[data-slot=slider-thumb]]:shadow-emerald-400/45",
  },
  yellow: {
    name: "Amarelo",
    text: "text-yellow-300",
    zone: "bg-yellow-400",
    glow: "bg-yellow-400/20",
    thumb: "[&_[data-slot=slider-thumb]]:shadow-yellow-300/45",
  },
  orange: {
    name: "Laranja",
    text: "text-orange-400",
    zone: "bg-orange-500",
    glow: "bg-orange-500/25",
    thumb: "[&_[data-slot=slider-thumb]]:shadow-orange-400/45",
  },
  red: {
    name: "Vermelho",
    text: "text-red-400",
    zone: "bg-red-500",
    glow: "bg-red-500/25",
    thumb: "[&_[data-slot=slider-thumb]]:shadow-red-400/45",
  },
}

const BANDS: readonly Band[] = ["green", "yellow", "orange", "red"]

/** Metade do botão do controle: a régua colorida fica alinhada com o centro dele nos dois extremos. */
const THUMB_HALF = 11

/** Posição (CSS) de uma fração das vendas na régua. */
const at = (fraction: number) => `calc(${THUMB_HALF}px + (100% - ${THUMB_HALF * 2}px) * ${Math.min(1, fraction / DEMO_SCALE_MAX)})`

const PERK_ICON: Record<PerkStatus, typeof Check> = { on: Check, partial: Minus, off: X }

const PERK_TONE: Record<PerkStatus, string> = {
  on: "border-emerald-400/25 bg-emerald-400/[0.07] [&_svg]:text-emerald-300",
  partial: "border-yellow-300/25 bg-yellow-300/[0.07] [&_svg]:text-yellow-200",
  off: "border-white/10 bg-white/[0.02] text-white/45 [&_svg]:text-red-400",
}

/** Simulador do termômetro: arraste as reclamações e veja a cor, a folga e o que a cor libera mudarem. */
export function ReputationSimulator() {
  const [claims, setClaims] = useState<number>(DEMO_CLAIMS.initial)
  const state = simulateClaims(claims)
  const style = BAND_STYLE[state.band]
  const zones = demoZones()
  const nextLimit = state.fallsTo ? zones.find((zone) => zone.band === state.band)?.to ?? null : null
  const slackWide = nextLimit !== null && (nextLimit - state.rate) / DEMO_SCALE_MAX > 0.09
  const safe = state.band === "green" && (state.slack ?? 0) > 1
  const Shield = safe ? ShieldCheck : ShieldAlert

  return (
    <article
      aria-labelledby="simulador-title"
      className="relative isolate flex h-full flex-col justify-between site-clip rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur sm:p-8"
    >
      {/* Aura que muda de cor junto com o termômetro. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {BANDS.map((band) => (
          <div
            key={band}
            className={cn(
              "site-motion absolute -top-24 -right-16 size-80 rounded-full blur-3xl transition-opacity duration-700",
              BAND_STYLE[band].glow,
              band === state.band ? "opacity-100" : "opacity-0"
            )}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="simulador-title" className="flex items-center gap-2 text-sm font-medium text-white/80">
          <Gauge className="size-4 text-brand-mint" aria-hidden />
          Quanto falta para cair de cor
        </h3>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 font-mono text-[11px] text-white/60">
          <MoveHorizontal className="size-3.5" aria-hidden />
          Simulador: arraste
        </span>
      </div>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <p className="text-sm text-white/55">Cor da conta</p>
          <p
            className={cn(
              "font-display text-5xl leading-none font-semibold tracking-[-0.04em] transition-colors duration-300 sm:text-6xl",
              style.text
            )}
          >
            {style.name}
          </p>
        </div>
        <p className="text-sm text-white/60 sm:text-right">
          <span className="font-mono text-base font-semibold text-white tabular-nums">{state.claims}</span>{" "}
          {state.claims === 1 ? "reclamação" : "reclamações"} em {DEMO_SALES} vendas
          <span className="block font-mono text-xs text-white/45 tabular-nums">
            {formatPercent(state.rate)} · últimos {DEMO_PERIOD_DAYS} dias
          </span>
        </p>
      </div>

      {/* Régua do termômetro com o controle por cima. */}
      <div className="relative mt-8 pt-7">
        {nextLimit !== null ? (
          <div
            aria-hidden
            style={{ left: at(state.rate), width: `calc(${at(nextLimit)} - ${at(state.rate)})` } as CSSProperties}
            className="absolute top-0 h-[1.15rem] transition-[left,width] duration-300 ease-out"
          >
            <span className="absolute inset-x-0 bottom-0 h-2 rounded-t-md border-x border-t border-dashed border-white/50" />
            {slackWide ? (
              <span className="absolute -top-1 left-1/2 -translate-x-1/2 font-mono text-[11px] whitespace-nowrap text-white/75">
                folga: {state.slack}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="relative">
          <div
            aria-hidden
            className="absolute top-1/2 flex h-3 -translate-y-1/2 overflow-hidden rounded-full"
            style={{ left: THUMB_HALF, right: THUMB_HALF }}
          >
            {zones.map((zone) => (
              <span
                key={zone.band}
                style={{ width: `${((zone.to - zone.from) / DEMO_SCALE_MAX) * 100}%` }}
                className={cn(
                  "h-full shrink-0 transition-opacity duration-300 not-first:border-l-2 not-first:border-brand-night",
                  BAND_STYLE[zone.band].zone,
                  zone.band === state.band ? "opacity-100" : "opacity-35"
                )}
              />
            ))}
          </div>
          <Slider
            aria-labelledby="simulador-reclamacoes"
            min={DEMO_CLAIMS.min}
            max={DEMO_CLAIMS.max}
            step={1}
            value={[claims]}
            onValueChange={(value) => {
              const next = Array.isArray(value) ? value[0] : value
              if (typeof next === "number") setClaims(next)
            }}
            className={cn(
              "relative py-2 [&_[data-slot=slider-range]]:bg-transparent [&_[data-slot=slider-thumb]]:size-[22px] [&_[data-slot=slider-thumb]]:border-2 [&_[data-slot=slider-thumb]]:border-white [&_[data-slot=slider-thumb]]:bg-brand-night [&_[data-slot=slider-thumb]]:shadow-[0_0_0_6px] [&_[data-slot=slider-thumb]]:ring-0 [&_[data-slot=slider-track]]:h-3 [&_[data-slot=slider-track]]:bg-transparent",
              style.thumb
            )}
          />
        </div>

        <div aria-hidden className="relative mt-2 h-4 font-mono text-[11px] text-white/45">
          <span className="absolute left-0">0%</span>
          {zones.slice(0, 3).map((zone) => (
            <span key={zone.band} className="absolute -translate-x-1/2" style={{ left: at(zone.to) }}>
              {formatPercent(zone.to)}
            </span>
          ))}
          <span className="absolute right-0">{formatPercent(DEMO_SCALE_MAX)}</span>
        </div>
        <p id="simulador-reclamacoes" className="mt-3 text-xs text-white/50">
          Reclamações nos últimos {DEMO_PERIOD_DAYS} dias, numa loja de exemplo com {DEMO_SALES} vendas.
        </p>
      </div>

      <p
        aria-live="polite"
        className={cn(
          "mt-6 flex items-start gap-3 rounded-2xl border p-4 text-base leading-snug font-medium transition-colors duration-300 sm:text-lg",
          safe ? "border-emerald-400/25 bg-emerald-400/[0.07]" : "border-white/15 bg-white/[0.06]"
        )}
      >
        <Shield className={cn("mt-0.5 size-5 shrink-0 transition-colors", style.text)} aria-hidden />
        <span>{demoSentence(state)}</span>
      </p>

      <div className="mt-6">
        <p className="text-xs font-medium text-white/55">O que essa cor libera no Mercado Livre</p>
        <ul className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {perksFor(state.band).map((perk) => {
            const Icon = PERK_ICON[perk.status]
            return (
              <li
                key={perk.id}
                className={cn("rounded-xl border px-3 py-2.5 transition-colors duration-300", PERK_TONE[perk.status])}
              >
                <span className="flex items-center gap-1.5 text-[13px] leading-tight font-medium">
                  <Icon className="size-3.5 shrink-0" aria-hidden />
                  {perk.label}
                </span>
                <span className="mt-0.5 block pl-5 text-xs opacity-70">{perk.detail}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </article>
  )
}
