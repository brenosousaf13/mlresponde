"use client"

import { CheckCheck, CookingPot, Headphones, Moon, Shirt, Sparkles, Timer, UserRound, type LucideIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { LogoMark } from "@/components/brand/logo"
import { cn } from "@/lib/utils"

import { useInView, usePrefersReducedMotion } from "./use-in-view"

type Scenario = {
  time: string
  day: string
  caption: string
  product: string
  price: string
  icon: LucideIcon
  question: string
  reads: readonly string[]
  answer: string
  certainty: number
}

/** Exemplos ilustrativos (não são dados de clientes). Sempre fora do horário comercial: é o ponto da demonstração. */
const SCENARIOS: readonly Scenario[] = [
  {
    time: "23:47",
    day: "sábado",
    caption: "Você já tinha desligado o computador.",
    product: "Kit 3 calças jeans femininas",
    price: "R$ 159,90",
    icon: Shirt,
    question: "Tem na cor azul escuro? Uso 40.",
    reads: ["Variações", "Estoque", "Tabela de medidas"],
    answer:
      "Olá! Temos sim o azul escuro, e o 40 está disponível. Pela tabela de medidas, ele veste cintura de 78 a 82 cm. É só escolher a cor e o tamanho no anúncio. Boas compras!",
    certainty: 97,
  },
  {
    time: "02:13",
    day: "terça",
    caption: "Você estava dormindo. A maanu, não.",
    product: "Fone Bluetooth com cancelamento de ruído",
    price: "R$ 249,00",
    icon: Headphones,
    question: "Funciona no iPhone? Tem garantia?",
    reads: ["Ficha técnica", "Descrição", "Garantia"],
    answer:
      "Olá! Funciona sim: a conexão é por Bluetooth 5.3, compatível com iPhone e Android. A garantia é de 12 meses, direto com a nossa loja. Qualquer dúvida, é só chamar!",
    certainty: 95,
  },
  {
    time: "06:58",
    day: "domingo",
    caption: "Domingo de manhã. Você, de folga.",
    product: "Air fryer 5 litros",
    price: "R$ 389,90",
    icon: CookingPot,
    question: "É 110 ou 220? Moro em Recife.",
    reads: ["Ficha técnica", "Variações", "Estoque"],
    answer:
      "Bom dia! Temos as duas versões, 110 V e 220 V. Em Recife a tensão é 220 V, então é só escolher essa opção no anúncio. As duas estão com estoque. Boas compras!",
    certainty: 93,
  },
]

/** Linha do tempo de cada exemplo, em ms. */
const T = {
  questionStart: 450,
  questionEnd: 1650,
  readStart: 1900,
  readStep: 520,
  answerStart: 3650,
  answerEnd: 5750,
  exit: 9100,
  cycle: 9500,
} as const

const TICK_MS = 40

function progress(t: number, start: number, end: number) {
  return Math.min(1, Math.max(0, (t - start) / (end - start)))
}

function seconds(ms: number) {
  return `${(ms / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`
}

/** Texto que "digita" sem mexer no layout: o texto completo invisível reserva o espaço. */
function TypedText({ text, chars, caret }: { text: string; chars: number; caret: boolean }) {
  return (
    <span className="relative block">
      <span aria-hidden className="invisible">
        {text}
      </span>
      <span className="absolute inset-0">
        {text.slice(0, chars)}
        {caret ? (
          <span className="ml-px inline-block h-[1.05em] w-[2px] translate-y-[0.18em] animate-[site-caret_1s_steps(1)_infinite] bg-current align-baseline" />
        ) : null}
      </span>
    </span>
  )
}

/** Demonstração no topo: a pergunta chega, a maanu lê o anúncio e responde. Pausa fora da tela. */
export function HeroDemo() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { threshold: 0.1 })
  const reduced = usePrefersReducedMotion()
  const [index, setIndex] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const elapsedRef = useRef(0)

  useEffect(() => {
    if (reduced) {
      const id = window.setInterval(() => setIndex((current) => (current + 1) % SCENARIOS.length), 7000)
      return () => window.clearInterval(id)
    }
    if (!inView) return
    let last = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      let next = elapsedRef.current + (now - last)
      last = now
      if (next >= T.cycle) {
        next = 0
        setIndex((current) => (current + 1) % SCENARIOS.length)
      }
      elapsedRef.current = next
      setElapsed(next)
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [inView, reduced])

  const t = reduced ? T.exit - 1 : elapsed
  const scenario = SCENARIOS[index]
  const Icon = scenario.icon

  const questionChars = Math.round(progress(t, T.questionStart, T.questionEnd) * scenario.question.length)
  const typingQuestion = t >= T.questionStart && t < T.questionEnd
  const reading = t >= T.questionEnd
  const litReads = scenario.reads.filter((_, i) => t >= T.readStart + i * T.readStep).length
  const answering = t >= T.answerStart
  const answerChars = Math.round(progress(t, T.answerStart, T.answerEnd) * scenario.answer.length)
  const sent = t >= T.answerEnd
  const stopwatch = Math.min(Math.max(t - T.questionEnd, 0), T.answerEnd - T.questionEnd)
  const leaving = t >= T.exit

  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[29rem] lg:mr-0">
      <p className="sr-only">
        Exemplo: às {scenario.time} de {scenario.day}, um comprador pergunta “{scenario.question}” e a maanu lê o anúncio e
        responde em segundos: “{scenario.answer}”
      </p>

      <div aria-hidden className="relative">
        {/* Brilho e cartões ao fundo (pilha de perguntas). */}
        <div className="absolute -inset-10 rounded-full bg-brand-teal/25 blur-3xl" />
        <div className="absolute inset-x-6 -bottom-4 h-full rotate-[-3deg] rounded-[1.75rem] border border-white/10 bg-white/[0.06]" />
        <div className="absolute inset-x-3 -bottom-2 h-full rotate-[1.5deg] rounded-[1.75rem] border border-white/10 bg-white/[0.08]" />

        <div
          className={cn(
            "site-motion relative rounded-[1.75rem] bg-white p-5 text-brand-graphite shadow-[0_40px_120px_-30px] shadow-black/70 ring-1 ring-black/5 transition-[opacity,transform] duration-500 sm:p-6",
            leaving ? "translate-y-2 opacity-0" : "translate-y-0 opacity-100"
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-xs text-muted-foreground">
              {scenario.time} · {scenario.day}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors duration-300",
                sent ? "bg-brand-sage text-brand-teal-ink" : "bg-amber-100 text-amber-800"
              )}
            >
              <span className="relative flex size-1.5">
                <span
                  className={cn(
                    "absolute inset-0 rounded-full",
                    sent ? "bg-brand-teal" : "animate-[site-ping_1.4s_ease-out_infinite] bg-amber-500"
                  )}
                />
                <span className={cn("relative size-1.5 rounded-full", sent ? "bg-brand-teal" : "bg-amber-500")} />
              </span>
              {sent ? "Respondida" : "Pergunta nova"}
            </span>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-sage text-brand-teal-ink">
              <Icon className="size-6" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{scenario.product}</p>
              <p className="text-sm text-muted-foreground">{scenario.price}</p>
            </div>
          </div>

          <div className="mt-4 h-px bg-border" />

          {/* Pergunta do comprador */}
          <div className="mt-4 flex items-start gap-2.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500">
              <UserRound className="size-4" />
            </span>
            <div className="rounded-2xl rounded-tl-md bg-slate-100 px-3.5 py-2.5 text-[0.95rem] leading-snug">
              <TypedText text={scenario.question} chars={questionChars} caret={typingQuestion} />
            </div>
          </div>

          {/* Leitura do anúncio */}
          <div
            className={cn(
              "mt-3 flex flex-wrap items-center gap-1.5 pl-9 transition-opacity duration-300",
              reading ? "opacity-100" : "opacity-0"
            )}
          >
            <span className="mr-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Sparkles className={cn("size-3.5 text-brand-teal", answering ? "" : "animate-pulse")} />
              {answering ? "Leu o anúncio" : "Lendo o anúncio"}
            </span>
            {scenario.reads.map((read, i) => (
              <span
                key={read}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-all duration-300",
                  i < litReads
                    ? "border-brand-teal/40 bg-brand-sage text-brand-teal-ink"
                    : "border-border text-muted-foreground"
                )}
              >
                {read}
              </span>
            ))}
          </div>

          {/* Resposta da maanu */}
          <div
            className={cn(
              "mt-3 flex items-start justify-end gap-2.5 transition-[opacity,transform] duration-400",
              answering ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
            )}
          >
            <div className="rounded-2xl rounded-tr-md bg-brand-graphite px-3.5 py-3 text-[0.95rem] leading-relaxed text-white">
              <TypedText text={scenario.answer} chars={answerChars} caret={answering && !sent} />
            </div>
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-graphite">
              <LogoMark label="" className="h-2.5 text-white" />
            </span>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3.5 text-xs">
            <span
              className={cn(
                "inline-flex min-w-0 items-center gap-1.5 font-medium whitespace-nowrap transition-colors",
                sent ? "text-brand-teal-ink" : "text-muted-foreground"
              )}
            >
              <CheckCheck className="size-4" />
              {sent ? "Enviada ao Mercado Livre" : answering ? "Escrevendo a resposta…" : "Entendendo a pergunta…"}
            </span>
            <span className="inline-flex shrink-0 items-center gap-3 font-mono whitespace-nowrap text-muted-foreground tabular-nums">
              <span
                title="Certeza da resposta"
                className={cn("inline-flex items-center gap-1 transition-opacity duration-500", answering ? "opacity-100" : "opacity-0")}
              >
                <svg viewBox="0 0 20 20" className="size-3.5 -rotate-90">
                  <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-border" />
                  <circle
                    cx="10"
                    cy="10"
                    r="8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    className="text-brand-teal transition-[stroke-dashoffset] duration-700"
                    strokeDasharray={50.27}
                    strokeDashoffset={answering ? 50.27 * (1 - scenario.certainty / 100) : 50.27}
                  />
                </svg>
                {scenario.certainty}%
              </span>
              <span className="inline-flex items-center gap-1" title="Tempo até a resposta">
                <Timer className="size-3.5" />
                {seconds(stopwatch)}
              </span>
            </span>
          </div>
        </div>

        {/* Selos flutuantes */}
        <div
          key={`pop-${index}`}
          className={cn(
            "absolute -top-3 -right-2 rounded-full bg-brand-teal px-3 py-1.5 text-xs font-semibold text-brand-graphite shadow-lg shadow-brand-teal/30 sm:-right-5",
            sent ? "animate-[site-pop_0.5s_ease-out_both]" : "opacity-0"
          )}
        >
          Comprador atendido ✓
        </div>
      </div>

      <p className="mt-9 flex items-center justify-center gap-2 text-sm text-white/60 lg:justify-start">
        <Moon className="size-4 text-brand-mint" aria-hidden />
        <span key={index} className="site-enter">
          {scenario.caption}
        </span>
      </p>
    </div>
  )
}
