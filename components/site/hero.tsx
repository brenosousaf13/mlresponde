"use client"

import { CheckIcon } from "lucide-react"
import { useRef } from "react"

import { siteConfig } from "@/lib/config/site"

import { Headline } from "./headline"
import { HeroCanvas } from "./hero-canvas"
import { HeroChat } from "./hero-chat"
import { SpotlightWordmark } from "./letters"
import { Marquee } from "./marquee"
import { Container } from "./primitives"
import { Phone } from "./phone"
import { Shot } from "./shot"
import { SiteButton } from "./site-button"
import { clamp01, useScrollFrame } from "./use-scroll-frame"

const TICKER = [
  "“Esse tênis tem no 42?” respondida em 6 segundos",
  "Devolução chegou: revise em um toque",
  "Cor verde mantida, com folga de 5 reclamações",
  "Pergunta das 02:13 respondida enquanto você dormia",
  "R$ 289,90 dá para contestar até amanhã",
  "Na dúvida, a IA não inventa: a pergunta fica com você",
] as const

export function Hero({ signupHref }: { signupHref: string }) {
  const sectionRef = useRef<HTMLElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)

  // A tela do app sobe um pouco mais devagar que a página (paralaxe) e se endireita ao rolar.
  useScrollFrame(sectionRef, (section) => {
    const frame = frameRef.current
    if (!frame) return
    const p = clamp01(-section.getBoundingClientRect().top / (window.innerHeight * 0.9))
    frame.style.setProperty("--py", `${(p * 70).toFixed(1)}px`)
    frame.style.setProperty("--rx", `${((1 - Math.min(1, p * 2.2)) * 6).toFixed(2)}deg`)
  })

  return (
    <section id="topo" ref={sectionRef} data-spot-area data-nav="dark" className="relative isolate overflow-clip bg-brand-night text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <HeroCanvas className="absolute -inset-10 size-[calc(100%+5rem)] blur-[5px] saturate-[1.15]" />
      </div>

      <Container className="relative max-w-6xl pt-32 text-center sm:pt-40">
        <Headline
          as="h1"
          immediate
          delay={150}
          className="mx-auto max-w-5xl font-display text-[2.85rem] leading-[0.98] font-semibold tracking-[-0.035em] sm:text-7xl lg:text-[5.5rem]"
        >
          Quem responde primeiro,<br className="hidden sm:block" /> <span className="text-brand-mint">vende primeiro</span>
        </Headline>

        <p
          className="site-rise mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-pretty text-white/75 sm:text-xl"
          style={{ "--enter-delay": "650ms" } as React.CSSProperties}
        >
          A {siteConfig.name} responde as perguntas dos seus anúncios com IA, em segundos e do jeito da sua loja, protege a cor
          da sua reputação e{" "}
          <span className="font-medium text-white">recupera o dinheiro das devoluções que o Mercado Livre deixou passar.</span>
        </p>

        <div className="site-rise mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row" style={{ "--enter-delay": "800ms" } as React.CSSProperties}>
          <SiteButton href={signupHref} variant="teal" size="lg">
            Testar grátis por {siteConfig.trialDays} dias
          </SiteButton>
          <SiteButton href="#recuperar" variant="outline-dark" size="lg" icon="down">
            Ver o Recuperador
          </SiteButton>
        </div>
      </Container>

      {/* Tela real do app (dados fictícios) com a conversa ao vivo e o aviso do Recuperador. */}
      <div className="relative mx-auto mt-14 w-full max-w-6xl px-4 sm:mt-20 sm:px-8">
        <div
          ref={frameRef}
          className="site-enter relative [perspective:1800px]"
          style={{ "--enter-delay": "900ms", transform: "translate3d(0, calc(var(--py, 0px) * -1), 0)" } as React.CSSProperties}
        >
          <div
            className="shot-frame shot-frame-dark mx-auto hidden max-h-[31rem] max-w-[68rem] origin-bottom sm:block lg:max-h-[36rem] [mask-image:linear-gradient(#000_78%,transparent)]"
            style={{ transform: "rotateX(var(--rx, 6deg))" }}
          >
            <div className="shot-bar">
              <i />
              <i />
              <i />
              <span>app.maanu.com.br/recuperador</span>
            </div>
            <Shot name="recuperadorVisao" priority sizes="(min-width: 1100px) 1088px, 100vw" />
          </div>

          <Phone className="sm:hidden">
            <Shot name="mobileRecuperador" priority sizes="248px" className="h-full w-full object-cover object-top" />
          </Phone>

          <div className="mt-8 flex flex-col items-center gap-4 sm:mt-5 lg:mt-0 lg:block">
            <div className="lg:absolute lg:-bottom-6 lg:-left-3 xl:-left-10">
              <HeroChat />
            </div>
            {/* Aviso do Recuperador, como chega para o vendedor (e não um número solto). */}
            <div className="w-full max-w-[19.5rem] rounded-2xl bg-brand-graphite p-4 text-left shadow-[0_30px_60px_-20px] shadow-black/70 lg:absolute lg:top-10 lg:-right-3 xl:-right-10">
              <p className="flex items-center gap-2 text-xs font-medium text-brand-mint">
                <span className="grid size-5 place-items-center rounded-full bg-brand-teal text-brand-graphite">
                  <CheckIcon className="size-3" aria-hidden />
                </span>
                O Mercado Livre deu razão a você
              </p>
              <p className="mt-2.5 text-sm leading-snug font-medium text-white">Jaqueta Jeans Feminina Oversized, contestação aceita</p>
              <p className="mt-1.5 text-sm text-white/70">
                <span className="font-semibold text-white tabular-nums">R$ 219,90</span> voltaram para a sua conta.
              </p>
              <p className="mt-2 text-[11px] text-white/45">Exemplo com dados de demonstração.</p>
            </div>
          </div>
        </div>
      </div>

      <Marquee className="mt-16 sm:mt-24" speed={60}>
        {TICKER.map((text) => (
          <span key={text} className="flex items-center gap-5 pr-5 text-lg font-medium whitespace-nowrap text-white/80 sm:gap-7 sm:pr-7 sm:text-2xl">
            {text}
            <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-brand-teal" />
          </span>
        ))}
      </Marquee>

      <div aria-hidden className="pre-pixel mt-14 px-3 sm:mt-20 sm:px-6">
        <SpotlightWordmark className="mx-auto max-w-[96rem]" />
      </div>
    </section>
  )
}