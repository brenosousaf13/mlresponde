"use client"

import { CheckIcon } from "lucide-react"
import { useRef, type CSSProperties } from "react"

import { cn } from "@/lib/utils"

import { Headline } from "./headline"
import { Container } from "./primitives"
import { Reveal } from "./reveal"
import { TourCarousel } from "./tour-carousel"
import { Shot, type ShotKey } from "./shot"
import { clamp01, useScrollFrame } from "./use-scroll-frame"

const CARDS: {
  id: string
  title: string
  text: string
  bullets: string[]
  shot: ShotKey
  /** Largura da captura dentro da janela (corta o canto direito, como no Escutaí). */
  zoom: string
}[] = [
  {
    id: "responder",
    title: "Perguntas respondidas, sem você fazer nada",
    text: "A caixa de entrada mostra o que a IA respondeu, o que você respondeu e o que espera por você. Cada resposta traz a certeza da IA, e dá para assumir a conversa a qualquer momento.",
    bullets: ["Filtros: respondidas pela IA, por você e para responder", "Rascunho pronto quando a IA fica na dúvida", "Ensinar a IA direto da resposta"],
    shot: "perguntas",
    zoom: "w-[128%]",
  },
  {
    id: "reputacao",
    title: "A cor da sua reputação, com folga em números",
    text: "Veja quantas reclamações, cancelamentos e atrasos cabem antes de a cor cair, os despachos perto do prazo e quanto a sua cor vale em desconto de frete.",
    bullets: ["Termômetro com a folga de cada métrica", "Despachos perto do prazo, com aviso", "Quando cada reclamação sai da conta"],
    shot: "reputacao",
    zoom: "w-[128%]",
  },
  {
    id: "resultados",
    title: "Resultados que você enxerga",
    text: "Quanto tempo e dinheiro a IA já economizou, perguntas por dia, o tempo de resposta e o que foi respondido fora do horário comercial.",
    bullets: ["Economia em R$ e em horas, com cálculo transparente", "Perguntas por dia e quem respondeu", "Mapa de horários e espera evitada"],
    shot: "resultados",
    zoom: "w-[128%]",
  },
  {
    id: "devolucoes",
    title: "Devoluções com prazo e valor na sua frente",
    text: "A lista do Recuperador mostra o que dá para revisar ou contestar, quanto dinheiro está em jogo e até quando. Um toque abre a devolução.",
    bullets: ["Prazo de cada devolução, do mais curto ao mais longo", "Revise ou conteste pelo celular", "Alerta por e-mail com o link direto"],
    shot: "recuperadorDevolucoes",
    zoom: "w-[128%]",
  },
]

export function TourStack() {
  const listRef = useRef<HTMLDivElement>(null)

  // Cada cartão encolhe e escurece um pouco quando o próximo sobe por cima dele.
  useScrollFrame(listRef, (list, vh) => {
    if (window.innerWidth < 1024) return
    const cards = Array.from(list.children) as HTMLElement[]
    cards.forEach((card, index) => {
      const next = cards[index + 1]
      if (!next) return
      const stickyTop = 96 + (index + 1) * 18
      const p = clamp01((vh - next.getBoundingClientRect().top) / Math.max(1, vh - stickyTop))
      card.style.setProperty("--s", (1 - 0.055 * p).toFixed(4))
      card.style.setProperty("--shade", (0.6 * p).toFixed(3))
    })
  })

  return (
    <section id="por-dentro" aria-labelledby="por-dentro-title" data-nav="light" className="relative bg-brand-offwhite pt-4 pb-20 text-brand-graphite sm:pb-32">
      <Container className="relative max-w-7xl">
        <div className="flex flex-col justify-between gap-6 border-t border-brand-graphite/15 pt-10 pb-12 sm:flex-row sm:items-end sm:pb-20">
          <div>
            <Headline id="por-dentro-title" as="h2" className="max-w-3xl font-display text-[2.6rem] leading-[0.98] font-semibold tracking-[-0.035em] sm:text-7xl">
              Por dentro da maanu
            </Headline>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-slate-500">
            Telas reais do app, com dados fictícios de uma loja de demonstração.
          </p>
        </div>

        <div ref={listRef} className="flex flex-col gap-6 max-sm:hidden lg:gap-7">
          {CARDS.map((card, index) => (
            <article
              id={card.id}
              key={card.id}
              aria-labelledby={`${card.id}-title`}
              className="stack-card relative scroll-mt-28 overflow-hidden rounded-2xl bg-brand-night text-white lg:sticky lg:grid lg:h-[min(34rem,74vh)] lg:grid-cols-[4.5rem_minmax(0,0.9fr)_minmax(0,1.5fr)]"
              style={{ top: `calc(6rem + ${index * 18}px)` } as CSSProperties}
            >
              <span aria-hidden className="hidden lg:block" />
              <div className="flex flex-col justify-between gap-6 px-6 pt-6 pb-2 lg:px-0 lg:py-8 lg:pr-8">
                <div>
                  <h3 id={`${card.id}-title`} className="font-display text-[1.75rem] leading-[1.08] font-semibold tracking-[-0.02em] text-balance sm:text-3xl">
                    {card.title}
                  </h3>
                  <p className="mt-4 text-[15px] leading-relaxed text-white/65">{card.text}</p>
                </div>
                <ul className="mt-5 flex flex-col gap-2 text-sm text-white/85 lg:mt-0">
                  {card.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-2.5">
                      <CheckIcon className="mt-0.5 size-4 shrink-0 text-brand-mint" aria-hidden />
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="relative mt-6 min-h-[16rem] overflow-hidden pt-2 pl-6 lg:mt-0 lg:pt-14 lg:pl-0">
                <div className="shot-frame shot-frame-dark h-full rounded-tr-none rounded-br-none rounded-bl-none lg:rounded-tl-2xl">
                  <Reveal className="h-full">
                    <div className="h-full overflow-hidden">
                      <Shot name={card.shot} sizes="(min-width: 1024px) 760px, 100vw" className={cn("max-w-none", card.zoom)} />
                    </div>
                  </Reveal>
                </div>
              </div>
              <div aria-hidden className="stack-shade pointer-events-none absolute inset-0 z-20 bg-brand-offwhite" />
            </article>
          ))}
        </div>
      </Container>
      <TourCarousel />
    </section>
  )
}