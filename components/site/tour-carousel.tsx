"use client"

import { useRef, useState } from "react"

import { cn } from "@/lib/utils"

import { Phone } from "./phone"
import { Shot, type ShotKey } from "./shot"

const SLIDES: { id: string; title: string; text: string; shot: ShotKey }[] = [
  {
    id: "responder",
    title: "Perguntas respondidas, sem você fazer nada",
    text: "Veja o que a IA respondeu, o que você respondeu e o que espera por você, com a certeza de cada resposta.",
    shot: "mobilePerguntas",
  },
  {
    id: "reputacao",
    title: "A cor da reputação, com folga em números",
    text: "Quantas reclamações, cancelamentos e atrasos cabem antes de a cor cair, e quanto ela vale em frete.",
    shot: "mobileReputacao",
  },
  {
    id: "resultados",
    title: "Resultados que você enxerga",
    text: "Quanto tempo e dinheiro a IA economizou, perguntas por dia e o que foi respondido fora do horário.",
    shot: "mobileResultados",
  },
  {
    id: "devolucoes",
    title: "Devoluções com prazo e valor",
    text: "O que dá para revisar ou contestar, quanto dinheiro está em jogo e até quando. Resolva pelo celular.",
    shot: "mobileDevolucoes",
  },
]

/**
 * "Por dentro" no celular (só abaixo de 640 px): em vez de quatro cartões longos um embaixo do outro, um carrossel que se
 * desliza com o dedo. Cada cartão mostra o texto curto e a tela do app em moldura de celular, saindo pela base do cartão;
 * o cartão seguinte aparece de canto, para quem chega saber que dá para deslizar.
 */
export function TourCarousel() {
  const listRef = useRef<HTMLUListElement>(null)
  const [active, setActive] = useState(0)

  function onScroll() {
    const list = listRef.current
    const first = list?.firstElementChild as HTMLElement | null
    if (!list || !first) return
    const gap = parseFloat(getComputedStyle(list).columnGap) || 0
    setActive(Math.min(SLIDES.length - 1, Math.max(0, Math.round(list.scrollLeft / (first.offsetWidth + gap)))))
  }

  function goTo(index: number) {
    const list = listRef.current
    const target = list?.children[index] as HTMLElement | undefined
    if (!list || !target) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    list.scrollTo({ left: target.offsetLeft - parseFloat(getComputedStyle(list).paddingLeft), behavior: reduce ? "auto" : "smooth" })
  }

  return (
    <div className="sm:hidden">
      <ul
        ref={listRef}
        onScroll={onScroll}
        aria-label="Telas da maanu"
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {SLIDES.map((slide) => (
          <li key={slide.id} className="w-[84%] shrink-0 snap-start">
            <article className="relative flex h-[34rem] flex-col overflow-hidden rounded-2xl bg-brand-night px-5 pt-6 text-white">
              <h3 className="font-display text-[1.6rem] leading-[1.08] font-semibold tracking-[-0.02em] text-balance">{slide.title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-white/70">{slide.text}</p>
              <Phone className="mt-auto -mb-[10.5rem] w-[14.5rem] shrink-0">
                <Shot name={slide.shot} sizes="232px" className="h-full w-full object-cover object-top" />
              </Phone>
            </article>
          </li>
        ))}
        <li aria-hidden className="w-2 shrink-0" />
      </ul>

      <div className="mt-5 flex justify-center gap-2" role="group" aria-label="Escolher tela">
        {SLIDES.map((slide, index) => (
          <button
            key={slide.id}
            type="button"
            aria-label={`Ver: ${slide.title}`}
            aria-current={index === active}
            onClick={() => goTo(index)}
            className={cn(
              "h-2 rounded-full transition-[width,background-color] duration-300",
              index === active ? "w-6 bg-brand-graphite" : "w-2 bg-brand-graphite/25"
            )}
          />
        ))}
      </div>
    </div>
  )
}