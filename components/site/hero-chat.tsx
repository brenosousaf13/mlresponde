"use client"

import { BotIcon, CheckCheckIcon, UserIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

import { useInView } from "./use-in-view"

const SCRIPT = [
  {
    time: "23:47",
    question: "Esse tênis tem no 42? Chega antes de sábado?",
    answer: "Temos sim o 42, em estoque e pronto para envio. Pedindo hoje, chega antes de sábado na maior parte do país.",
    seconds: 6,
    certainty: 96,
  },
  {
    time: "02:13",
    question: "A cafeteira é 110 ou 220V?",
    answer: "Ela é bivolt (110V/220V) e troca de voltagem sozinha, então serve em qualquer tomada.",
    seconds: 5,
    certainty: 98,
  },
  {
    time: "06:58",
    question: "Vocês emitem nota fiscal no CNPJ?",
    answer: "Emitimos nota fiscal em todas as vendas, no CPF ou no CNPJ informado na compra.",
    seconds: 7,
    certainty: 94,
  },
] as const

type Phase = "ask" | "read" | "type" | "sent"

/** Mini demonstração: o comprador pergunta de madrugada, a IA lê o anúncio, escreve e envia. Repete em ciclo. */
export function HeroChat({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { threshold: 0.3 })
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>("sent")
  const [typed, setTyped] = useState<number>(SCRIPT[0].answer.length)

  useEffect(() => {
    if (!inView || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    let cancelled = false
    const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))
    async function run() {
      let next = 0
      await wait(250)
      while (!cancelled) {
        const item = SCRIPT[next % SCRIPT.length]
        setIndex(next % SCRIPT.length)
        setPhase("ask")
        setTyped(0)
        await wait(1300)
        if (cancelled) return
        setPhase("read")
        await wait(1500)
        if (cancelled) return
        setPhase("type")
        for (let i = 1; i <= item.answer.length; i++) {
          if (cancelled) return
          setTyped(i)
          await wait(22)
        }
        setPhase("sent")
        await wait(3200)
        next += 1
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [inView])

  const item = SCRIPT[index]
  return (
    <div ref={ref} className={cn("w-full max-w-[19.5rem] rounded-[1.4rem] bg-white p-4 text-brand-graphite shadow-[0_30px_70px_-20px] shadow-black/60", className)}>
      <div className="flex items-center justify-between text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5 font-mono tracking-wide">
          <span className="size-1.5 rounded-full bg-amber-500" aria-hidden />
          {item.time} · pergunta nova
        </span>
        <span className="font-mono">Mercado Livre</span>
      </div>

      <div className="mt-3 flex items-start gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500">
          <UserIcon className="size-3.5" aria-hidden />
        </span>
        <p className="rounded-2xl rounded-tl-sm bg-slate-100 px-3 py-2 text-[13px] leading-snug">{item.question}</p>
      </div>

      <div className="mt-2.5 flex min-h-[5.6rem] flex-row-reverse items-start gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-teal text-white">
          <BotIcon className="size-3.5" aria-hidden />
        </span>
        <p className="max-w-[85%] rounded-2xl rounded-tr-sm bg-brand-sage px-3 py-2 text-[13px] leading-snug text-brand-graphite">
          {phase === "ask" || phase === "read" ? (
            <span className="inline-flex items-center gap-1.5 text-brand-teal-ink">
              <span className="text-xs">{phase === "ask" ? "Chegou" : "Lendo o anúncio"}</span>
              <span className="inline-flex gap-0.5" aria-hidden>
                {[0, 1, 2].map((dot) => (
                  <span key={dot} className="size-1 animate-bounce rounded-full bg-brand-teal" style={{ animationDelay: `${dot * 120}ms` }} />
                ))}
              </span>
            </span>
          ) : (
            <>
              {item.answer.slice(0, typed)}
              {phase === "type" ? <i className="caret" /> : null}
            </>
          )}
        </p>
      </div>

      <div
        className={cn(
          "mt-2 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[11px] transition-opacity duration-300",
          phase === "sent" ? "opacity-100" : "opacity-30"
        )}
      >
        <span className="inline-flex items-center gap-1.5 font-medium text-brand-teal-ink">
          <CheckCheckIcon className="size-3.5" aria-hidden />
          Enviada ao Mercado Livre
        </span>
        <span className="font-mono text-slate-500">
          {item.seconds} s · certeza {item.certainty}%
        </span>
      </div>
    </div>
  )
}