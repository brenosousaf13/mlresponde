"use client"

import { CircleCheck, CircleX, RotateCcw, UserRound } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { LogoMark } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { useInView, usePrefersReducedMotion } from "./use-in-view"

/**
 * "Ele pergunta em três lojas e compra de quem responde primeiro", encenado: a mesma pergunta chega em três lojas e
 * cada uma responde no seu tempo. Exemplo ilustrativo.
 */

const QUESTION = "Esse tênis tem no 42? Preciso pra sábado."

/** Passos da cena (o último fica parado na tela). */
const STEP_AT_MS = [300, 1500, 2700, 4000, 5700, 7300] as const
const LAST_STEP = STEP_AT_MS.length

/** O relógio do topo em cada passo. */
const CLOCK: Record<number, { time: string; day: string }> = {
  0: { time: "22:14:00", day: "terça" },
  1: { time: "22:14:00", day: "terça" },
  2: { time: "22:14:03", day: "terça" },
  3: { time: "22:14:06", day: "terça" },
  4: { time: "22:16:40", day: "terça" },
  5: { time: "22:58:00", day: "terça" },
  6: { time: "07:30:00", day: "quarta" },
}

type Store = {
  id: string
  name: string
  note: string
  /** Passo em que a resposta aparece. */
  answerAt: number
  time: string
  wait: string
  answer: string
  winner?: boolean
}

const STORES: readonly Store[] = [
  {
    id: "maanu",
    name: "Sua loja",
    note: "com a maanu",
    answerAt: 3,
    time: "22:14",
    wait: "6 segundos depois",
    answer: "Olá! Temos sim o 42 em estoque. Comprando hoje, ele chega até sexta. Boas compras!",
    winner: true,
  },
  {
    id: "loja-1",
    name: "Loja concorrente",
    note: "responde quando vê o celular",
    answerAt: 5,
    time: "22:58",
    wait: "44 minutos depois",
    answer: "Boa noite, temos sim.",
  },
  {
    id: "loja-2",
    name: "Outra loja",
    note: "responde no horário comercial",
    answerAt: 6,
    time: "07:30",
    wait: "no dia seguinte",
    answer: "Bom dia! Temos o 42, pode comprar.",
  },
]

/** Passo em que o comprador fecha a compra na loja que respondeu primeiro. */
const SOLD_AT = 4

function TypingDots() {
  return (
    <span className="inline-flex gap-1" aria-hidden>
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          style={{ animationDelay: `${delay}ms` }}
          className="site-motion size-1.5 animate-bounce rounded-full bg-current opacity-70"
        />
      ))}
    </span>
  )
}

function StoreColumn({ store, step }: { store: Store; step: number }) {
  const winner = Boolean(store.winner)
  const asked = step >= 1
  const typing = winner && step === 2
  const answered = step >= store.answerAt
  const sold = step >= SOLD_AT

  return (
    <div
      className={cn(
        "flex flex-col rounded-3xl p-5 transition-[box-shadow,opacity] duration-500 sm:p-6",
        winner
          ? "bg-brand-night text-white shadow-[0_30px_70px_-35px] shadow-brand-teal/70 ring-1 ring-brand-teal/40"
          : "border border-border bg-white",
        !winner && answered && "opacity-70"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl font-semibold tracking-tight">{store.name}</p>
          <p className={cn("text-sm", winner ? "text-brand-mint" : "text-muted-foreground")}>{store.note}</p>
        </div>
        {winner ? (
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10">
            <LogoMark label="" className="h-3 text-white" />
          </span>
        ) : null}
      </div>

      {/* Pergunta do comprador (a mesma nas três) */}
      <div
        className={cn(
          "mt-6 flex items-start gap-2.5 transition-[opacity,transform] duration-500",
          asked ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
        )}
      >
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-full",
            winner ? "bg-white/10 text-white/70" : "bg-slate-100 text-slate-500"
          )}
        >
          <UserRound className="size-4" aria-hidden />
        </span>
        <div>
          <p
            className={cn(
              "rounded-2xl rounded-tl-md px-3.5 py-2 text-[0.95rem] leading-snug",
              winner ? "bg-white/10" : "bg-slate-100"
            )}
          >
            {QUESTION}
          </p>
          <p className={cn("mt-1 pl-1 font-mono text-[11px]", winner ? "text-white/45" : "text-muted-foreground")}>
            22:14
          </p>
        </div>
      </div>

      {/* Resposta da loja */}
      <div className="mt-4 min-h-[7.5rem]">
        {answered ? (
          <div className="site-enter flex flex-col items-end">
            <p
              className={cn(
                "max-w-[92%] rounded-2xl rounded-tr-md px-3.5 py-2.5 text-[0.95rem] leading-snug",
                winner ? "bg-brand-teal text-brand-graphite" : "bg-brand-graphite text-white"
              )}
            >
              {store.answer}
            </p>
            <p className={cn("mt-1 pr-1 font-mono text-[11px]", winner ? "text-brand-mint" : "text-muted-foreground")}>
              {store.time} · {store.wait}
            </p>
          </div>
        ) : typing ? (
          <div className="flex justify-end">
            <span className="inline-flex items-center rounded-2xl rounded-tr-md bg-brand-teal px-4 py-3 text-brand-graphite">
              <TypingDots />
            </span>
          </div>
        ) : asked ? (
          <p
            className={cn(
              "inline-flex items-center gap-2 text-sm",
              winner ? "text-white/50" : "text-muted-foreground"
            )}
          >
            <span className="relative flex size-2">
              <span className="site-motion absolute inset-0 animate-[site-ping_1.6s_ease-out_infinite] rounded-full bg-amber-400" />
              <span className="relative size-2 rounded-full bg-amber-400" />
            </span>
            Sem resposta ainda
          </p>
        ) : null}
      </div>

      {/* Resultado */}
      <div
        className={cn(
          "mt-auto border-t pt-4 text-sm font-medium",
          winner ? "border-white/10" : "border-border"
        )}
      >
        {winner ? (
          sold ? (
            <p className="site-enter inline-flex items-center gap-2 text-brand-mint">
              <CircleCheck className="size-5" aria-hidden />
              Vendeu. Ele comprou às 22:16.
            </p>
          ) : (
            <p className="text-white/40">Esperando a resposta…</p>
          )
        ) : answered ? (
          <p className="site-enter inline-flex items-center gap-2 text-slate-500">
            <CircleX className="size-5" aria-hidden />
            Tarde: ele já tinha comprado.
          </p>
        ) : (
          <p className="text-muted-foreground/60">{sold ? "Ele já está comprando em outra loja…" : "Esperando a resposta…"}</p>
        )}
      </div>
    </div>
  )
}

/** A cena começa quando aparece na tela; no fim, "Ver de novo" recomeça. */
export function BuyerRace() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, threshold: 0.35 })
  const reduced = usePrefersReducedMotion()
  const [step, setStep] = useState(0)
  const [run, setRun] = useState(0)

  useEffect(() => {
    if (!inView || reduced) return
    const timers = STEP_AT_MS.map((at, index) => window.setTimeout(() => setStep(index + 1), at))
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [inView, reduced, run])

  const shown = reduced ? LAST_STEP : step
  const clock = CLOCK[shown] ?? CLOCK[0]
  const finished = shown >= LAST_STEP

  const replay = () => {
    setStep(0)
    setRun((current) => current + 1)
  }

  return (
    <div ref={ref} className="rounded-[2rem] border border-border bg-brand-offwhite p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 px-1 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
            A mesma pergunta, em três lojas.
          </p>
          <p className="text-sm text-muted-foreground">Quem responde primeiro leva a venda. Exemplo ilustrativo.</p>
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          {finished && !reduced ? (
            <Button variant="ghost" size="sm" onClick={replay} className="text-muted-foreground">
              <RotateCcw data-icon="inline-start" aria-hidden />
              Ver de novo
            </Button>
          ) : null}
          <p
            aria-hidden
            className="rounded-full bg-brand-graphite px-4 py-2 font-mono text-sm whitespace-nowrap text-white tabular-nums"
          >
            {clock.time} <span className="text-white/50">· {clock.day}</span>
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {STORES.map((store) => (
          <StoreColumn key={store.id} store={store} step={shown} />
        ))}
      </div>

      <p className="sr-only">
        Às 22:14 de uma terça, o comprador manda a mesma pergunta para três lojas. A sua loja, com a maanu, responde 6
        segundos depois e ele compra às 22:16. A loja concorrente responde 44 minutos depois e a outra loja só no dia
        seguinte, às 7:30: tarde demais, ele já tinha comprado.
      </p>
    </div>
  )
}
