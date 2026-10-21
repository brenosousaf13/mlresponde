"use client"

import { ArrowRightIcon, CheckIcon } from "lucide-react"
import { useRef } from "react"

import { cn } from "@/lib/utils"

import { Container } from "./primitives"
import { Reveal } from "./reveal"
import { Shot, type ShotKey } from "./shot"
import { clamp01, useScrollFrame } from "./use-scroll-frame"

const PILLARS: {
  word: string
  title: string
  text: string
  bullets: string[]
  shot: ShotKey
  href?: string
  cta?: string
}[] = [
  {
    word: "Responde",
    title: "Perguntas respondidas em segundos",
    text: "De dia, de madrugada, no domingo. A IA lê o anúncio inteiro e as regras da sua loja antes de responder.",
    bullets: ["Só responde sozinha quando tem certeza", "Na dúvida, a pergunta fica com você, com um rascunho pronto", "Você assume a conversa quando quiser"],
    shot: "perguntas",
  },
  {
    word: "Protege",
    title: "A cor da sua conta sob controle",
    text: "O Escudo de Reputação mostra quanto falta para a sua cor cair no termômetro do Mercado Livre.",
    bullets: ["Folga de cada métrica, em número de problemas", "Aviso de despacho perto do prazo", "Quando cada reclamação deixa de contar"],
    shot: "reputacao",
  },
  {
    word: "Recupera",
    title: "O dinheiro que passou batido",
    text: "O Recuperador lê as devoluções, avisa quando dá para agir e ajuda você a contestar o que o armazém do ML reprovou.",
    bullets: ["Aviso na hora, com o prazo para agir", "Você resolve pelo celular, em 1 minuto", "Raio-X das devoluções dos últimos 90 dias"],
    shot: "recuperadorVisao",
    href: "#recuperar",
    cta: "Ver o Recuperador",
  },
]

/**
 * "Responde. Protege. Recupera." (a estrutura do "Como funciona" do Escutaí): no computador a seção fica fixa enquanto a
 * página rola; cada palavra se preenche de teal na sua vez e o painel da direita troca de assunto. No celular vira uma
 * lista normal.
 */
export function Pillars() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const pinRef = useRef<HTMLDivElement>(null)
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([])

  useScrollFrame(wrapRef, (wrap, vh) => {
    if (window.innerWidth < 1024) return
    const box = wrap.getBoundingClientRect()
    const progress = clamp01(-box.top / Math.max(1, box.height - vh))
    const t = progress * PILLARS.length * 0.98
    const active = Math.min(PILLARS.length - 1, Math.floor(t))
    if (pinRef.current) pinRef.current.dataset.active = String(active)
    wordRefs.current.forEach((word, index) => {
      if (!word) return
      const fill = clamp01(t - index)
      word.style.setProperty("--p", `${(fill * 100).toFixed(1)}%`)
      word.style.opacity = index === active ? "1" : index < active ? "0.9" : "0.5"
      word.style.transform = `translate3d(${index === active ? 14 : 0}px, 0, 0)`
    })
  })

  return (
    <section id="como-funciona" aria-labelledby="como-funciona-title" data-nav="dark" className="relative bg-brand-night text-white lg:pb-[calc(clamp(56px,6.6vw,112px)*3)]">
      <h2 id="como-funciona-title" className="sr-only">
        Como a maanu funciona: responde, protege e recupera
      </h2>

      {/* Computador: seção fixa com rolagem guiada. */}
      <div ref={wrapRef} className="relative hidden lg:block" style={{ height: "340vh" }}>
        <div ref={pinRef} data-active="0" className="group/pin sticky top-0 h-svh overflow-hidden">
          <Container className="relative grid h-full max-w-7xl grid-cols-12 items-center gap-10 pt-16">
            <div className="col-span-7">
              <div className="flex flex-col">
                {PILLARS.map((pillar, index) => (
                  <span
                    key={pillar.word}
                    aria-hidden
                    className="pillar-word border-b border-white/10 pt-1.5 pb-3 font-display text-[clamp(4.5rem,9.4vw,8.4rem)] leading-[0.96] font-semibold tracking-[-0.04em] transition-[opacity,transform] duration-500 last:border-b-0"
                    style={{ opacity: index === 0 ? 1 : 0.5 }}
                    ref={(node) => {
                      wordRefs.current[index] = node
                    }}
                  >
                    {pillar.word}
                    <span className="text-brand-teal">.</span>
                    <span className="pillar-fill pt-1.5 pb-3">
                      {pillar.word}
                      <span className="text-brand-teal">.</span>
                    </span>
                  </span>
                ))}
              </div>
            </div>

            <div className="relative col-span-5 h-[34rem]">
              {PILLARS.map((pillar, index) => (
                <article
                  key={pillar.word}
                  className={cn(
                    "absolute inset-0 flex flex-col justify-between rounded-2xl bg-white/[0.06] p-7 opacity-0 transition-[opacity,transform] duration-500",
                    "translate-y-6",
                    index === 0 && "group-data-[active='0']/pin:translate-y-0 group-data-[active='0']/pin:opacity-100",
                    index === 1 && "group-data-[active='1']/pin:translate-y-0 group-data-[active='1']/pin:opacity-100",
                    index === 2 && "group-data-[active='2']/pin:translate-y-0 group-data-[active='2']/pin:opacity-100"
                  )}
                >
                  <div>
                    <h3 className="font-display text-3xl leading-[1.05] font-semibold tracking-[-0.02em] text-balance">{pillar.title}</h3>
                    <p className="mt-3 text-[15px] leading-relaxed text-white/70">{pillar.text}</p>
                    <ul className="mt-5 flex flex-col gap-2.5 text-sm text-white/85">
                      {pillar.bullets.map((bullet) => (
                        <li key={bullet} className="flex items-start gap-2.5">
                          <CheckIcon className="mt-0.5 size-4 shrink-0 text-brand-mint" aria-hidden />
                          {bullet}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="relative mt-5 h-40 overflow-hidden rounded-xl">
                    <Shot name={pillar.shot} sizes="520px" className="h-full w-full object-cover object-left-top" />
                    {pillar.href ? (
                      <a
                        href={pillar.href}
                        className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-full bg-brand-teal px-4 py-2 text-sm font-semibold text-brand-graphite shadow-lg transition-colors hover:bg-brand-mint"
                      >
                        {pillar.cta}
                        <ArrowRightIcon className="size-4" aria-hidden />
                      </a>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </Container>
        </div>
      </div>

      {/* Celular e tablet: lista normal. */}
      <Container className="max-w-3xl py-20 lg:hidden">
        <div className="flex flex-col gap-14">
          {PILLARS.map((pillar) => (
            <Reveal key={pillar.word}>
              <p className="font-display text-[3.6rem] leading-none font-semibold tracking-[-0.035em] text-brand-mint sm:text-7xl">
                {pillar.word}
                <span className="text-brand-teal">.</span>
              </p>
              <h3 className="mt-4 font-display text-2xl leading-tight font-semibold tracking-tight">
                {pillar.title}
              </h3>
              <p className="mt-2 leading-relaxed text-white/70">{pillar.text}</p>
              <ul className="mt-4 flex flex-col gap-2 text-sm text-white/85">
                {pillar.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-2.5">
                    <CheckIcon className="mt-0.5 size-4 shrink-0 text-brand-mint" aria-hidden />
                    {bullet}
                  </li>
                ))}
              </ul>
              <div className="mt-5 h-44 overflow-hidden rounded-xl">
                <Shot name={pillar.shot} sizes="(min-width: 640px) 640px, 100vw" className="h-full w-full object-cover object-left-top" />
              </div>
              {pillar.href ? (
                <a href={pillar.href} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-mint">
                  {pillar.cta}
                  <ArrowRightIcon className="size-4" aria-hidden />
                </a>
              ) : null}
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  )
}