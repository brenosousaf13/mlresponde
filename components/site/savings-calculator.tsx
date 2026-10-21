"use client"

import { Calculator } from "lucide-react"
import { useState } from "react"

import { Slider } from "@/components/ui/slider"
import {
  CALCULATOR_DEFAULTS,
  CALCULATOR_LIMITS,
  estimateSavings,
  formatBRLWhole,
  formatInteger,
  type SavingsInput,
} from "@/lib/site/calculator"

import { Container, Eyebrow, SectionTitle } from "./primitives"
import { Reveal } from "./reveal"
import { SiteButton } from "./site-button"

type Field = keyof SavingsInput

const FIELDS: { key: Field; label: string; format: (value: number) => string }[] = [
  { key: "questionsPerDay", label: "Perguntas por dia nos seus anúncios", format: (v) => `${v} por dia` },
  { key: "minutesPerAnswer", label: "Minutos para ler, conferir e responder cada uma", format: (v) => `${v} min` },
  { key: "hourlyCost", label: "Quanto vale uma hora do seu tempo", format: (v) => `${formatBRLWhole(v)}/h` },
]

/** Semanas num mês de 30 dias. */
const WEEKS_PER_MONTH = 30 / 7

function formatHours(hours: number) {
  return hours < 10 ? hours.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : formatInteger(hours)
}

export function SavingsCalculator({ signupHref }: { signupHref: string }) {
  const [input, setInput] = useState<SavingsInput>({ ...CALCULATOR_DEFAULTS })
  const estimate = estimateSavings(input)
  const workDays = estimate.hoursPerMonth / 8

  const update = (key: Field) => (value: number | readonly number[]) => {
    const next = Array.isArray(value) ? value[0] : value
    if (typeof next === "number") setInput((current) => ({ ...current, [key]: next }))
  }

  return (
    <section id="calculadora" aria-labelledby="calculadora-title" className="scroll-mt-24 bg-brand-offwhite px-3 sm:px-4">
      <div data-nav="dark" className="relative isolate site-clip rounded-[2rem] bg-brand-night py-20 text-white sm:rounded-[2.75rem] sm:py-28">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="site-motion absolute -bottom-1/2 left-1/2 h-[90%] w-[80%] -translate-x-1/2 animate-[site-aurora_20s_ease-in-out_infinite] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--brand-teal)_35%,transparent),transparent)] blur-2xl" />
          <div className="site-grid absolute inset-0" />
          <div className="site-grain absolute inset-0" />
        </div>

        <Container>
          <Reveal className="mx-auto max-w-3xl text-center">
            <Eyebrow tone="dark">Calculadora</Eyebrow>
            <SectionTitle id="calculadora-title" className="mt-5">
              Quanto tempo a maanu <span className="site-gradient-text">te devolve?</span>
            </SectionTitle>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-pretty text-white/70">
              Arraste e veja. É a mesma conta da tela Resultados da maanu: perguntas respondidas, vezes os minutos que cada uma
              levaria, vezes quanto vale a sua hora.
            </p>
          </Reveal>

          <Reveal delay={120} className="mx-auto mt-14 grid max-w-5xl gap-4 lg:grid-cols-2">
            <div className="flex flex-col rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur sm:p-8">
              <div className="flex items-center gap-2 text-sm font-medium text-white/80">
                <Calculator className="size-4 text-brand-mint" aria-hidden /> A sua loja
              </div>
              <div className="mt-8 mb-10 flex flex-col gap-9">
                {FIELDS.map((field) => {
                  const limits = CALCULATOR_LIMITS[field.key]
                  const id = `calc-${field.key}`
                  return (
                    <div key={field.key}>
                      <div className="flex items-baseline justify-between gap-4">
                        <label id={`${id}-label`} className="text-sm text-white/70">
                          {field.label}
                        </label>
                        <output htmlFor={id} className="shrink-0 font-mono text-sm font-semibold text-white tabular-nums">
                          {field.format(input[field.key])}
                        </output>
                      </div>
                      <Slider
                        id={id}
                        aria-labelledby={`${id}-label`}
                        min={limits.min}
                        max={limits.max}
                        step={limits.step}
                        value={[input[field.key]]}
                        onValueChange={update(field.key)}
                        className="mt-4 [&_[data-slot=slider-range]]:bg-brand-teal [&_[data-slot=slider-thumb]]:size-5 [&_[data-slot=slider-thumb]]:border-brand-teal [&_[data-slot=slider-thumb]]:shadow-[0_0_0_6px] [&_[data-slot=slider-thumb]]:shadow-brand-teal/25 [&_[data-slot=slider-track]]:h-1.5 [&_[data-slot=slider-track]]:bg-white/10"
                      />
                    </div>
                  )
                })}
              </div>
              <p className="mt-auto rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-relaxed text-white/60">
                Na sua conta, a tela Resultados faz essa mesma conta com as perguntas que a maanu respondeu de verdade, e você
                ajusta os minutos e o valor da hora quando quiser.
              </p>
            </div>

            <div className="flex flex-col rounded-[1.75rem] bg-white p-6 text-brand-graphite sm:p-8" aria-live="polite">
              <p className="text-sm text-muted-foreground">Por mês, você ganha de volta</p>
              <p className="mt-2 font-display text-6xl leading-none font-semibold tracking-[-0.04em] tabular-nums sm:text-7xl">
                {formatHours(estimate.hoursPerMonth)}
                <span className="ml-2 text-2xl tracking-tight text-muted-foreground sm:text-3xl">horas</span>
              </p>
              <p className="mt-3 text-muted-foreground">
                Quase {Math.max(1, Math.round(workDays))} {Math.round(workDays) === 1 ? "dia" : "dias"} de trabalho de 8 horas,
                que valem <span className="font-semibold text-brand-teal-ink">{formatBRLWhole(estimate.moneyPerMonth)}</span>.
              </p>

              <div className="my-7 h-px bg-border" />

              <dl className="mb-7 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-brand-offwhite p-4">
                  <dt className="text-sm text-muted-foreground">Perguntas que saem da sua mão</dt>
                  <dd className="mt-1 font-display text-3xl font-semibold tracking-tight tabular-nums">
                    {formatInteger(estimate.questionsPerMonth)}
                    <span className="block text-sm font-medium text-muted-foreground sm:ml-1 sm:inline sm:text-base">por mês</span>
                  </dd>
                </div>
                <div className="rounded-2xl bg-brand-offwhite p-4">
                  <dt className="text-sm text-muted-foreground">Tempo que volta para você</dt>
                  <dd className="mt-1 font-display text-3xl font-semibold tracking-tight tabular-nums">
                    {formatHours(estimate.hoursPerMonth / WEEKS_PER_MONTH)} h
                    <span className="block text-sm font-medium text-muted-foreground sm:ml-1 sm:inline sm:text-base">por semana</span>
                  </dd>
                </div>
              </dl>

              <SiteButton href={signupHref} block className="mt-auto">
                Começar meu teste grátis
              </SiteButton>
            </div>
          </Reveal>
        </Container>
      </div>
    </section>
  )
}
