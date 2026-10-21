"use client"

import { ArrowRightIcon, HandCoinsIcon, ShieldCheckIcon, SparklesIcon, ZapIcon } from "lucide-react"
import { useRef } from "react"

import { formatBRL } from "@/lib/site/calculator"
import { siteConfig } from "@/lib/config/site"

import { CountUp } from "./count-up"
import { Headline } from "./headline"
import { HeroCanvas } from "./hero-canvas"
import { HeroChat } from "./hero-chat"
import { SpotlightWordmark } from "./letters"
import { Marquee } from "./marquee"
import { Phone } from "./phone"
import { Container } from "./primitives"
import { Shot } from "./shot"
import { SiteButton } from "./site-button"
import { clamp01, useScrollFrame } from "./use-scroll-frame"

const TICKER = [
  { icon: ZapIcon, text: "“Esse tênis tem no 42?” respondida em 6 s" },
  { icon: HandCoinsIcon, text: "R$ 289,90 na mira: dá para contestar até amanhã" },
  { icon: ShieldCheckIcon, text: "Cor verde mantida: folga de 5 reclamações" },
  { icon: SparklesIcon, text: "Pergunta das 02:13 respondida enquanto você dormia" },
  { icon: HandCoinsIcon, text: "Devolução chegou: revise em 1 toque" },
  { icon: ZapIcon, text: "Na dúvida, a IA não inventa: a pergunta fica com você" },
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
        <div className="hero-grid absolute inset-0" />
        <div className="absolute inset-x-0 top-0 h-72 bg-linear-to-b from-brand-night via-brand-night/60 to-transparent" />
        <div className="site-grain absolute inset-0" />
      </div>

      <Container className="relative max-w-6xl pt-32 text-center sm:pt-40">
        <a href="#recuperar" className="site-enter group mx-auto block w-fit" style={{ "--enter-delay": "100ms" } as React.CSSProperties}>
          <span className="scan-border block">
            <span className="flex items-center gap-2.5 rounded-full bg-brand-night py-1.5 pr-4 pl-1.5 text-sm text-white/85 transition-colors group-hover:bg-brand-graphite">
              <span className="rounded-full bg-brand-teal px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-brand-graphite uppercase">Novo</span>
              <span className="text-left">
                Recuperador: ache o dinheiro que passou batido no ML
              </span>
              <ArrowRightIcon className="size-4 shrink-0 text-brand-mint transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
          </span>
        </a>

        <Headline
          as="h1"
          immediate
          delay={150}
          className="mx-auto mt-7 max-w-5xl font-display text-[2.85rem] leading-[0.98] font-semibold tracking-[-0.045em] sm:text-7xl lg:text-[5.5rem]"
        >
          Quem responde primeiro,<br className="hidden sm:block" /> <span className="text-brand-mint">vende primeiro</span>
        </Headline>

        <p
          className="site-rise mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-pretty text-white/70 sm:text-xl"
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

      {/* Tela real do app (dados fictícios) com a conversa ao vivo e o contador do Recuperador. */}
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

          <Phone className="site-motion [animation:site-float_8s_ease-in-out_infinite] sm:hidden">
            <Shot name="mobileRecuperador" priority sizes="248px" className="h-full w-full object-cover object-top" />
          </Phone>

          <div className="mt-8 flex flex-col items-center gap-4 sm:mt-5 lg:mt-0 lg:block">
            <div className="lg:absolute lg:-bottom-6 lg:-left-3 xl:-left-10">
              <HeroChat className="[animation:site-float_7s_ease-in-out_infinite] site-motion" />
            </div>
            <div className="site-motion w-full max-w-[19.5rem] rounded-[1.4rem] border border-white/15 bg-brand-graphite/85 p-4 text-left shadow-[0_30px_80px_-20px] shadow-black/70 backdrop-blur-xl [animation:site-float_8s_ease-in-out_-3s_infinite] lg:absolute lg:top-10 lg:-right-3 xl:-right-10">
              <p className="inline-flex items-center gap-2 text-[11px] font-medium tracking-wide text-brand-mint uppercase">
                <span className="relative flex size-2" aria-hidden>
                  <span className="site-motion absolute inline-flex size-full animate-[site-ping_1.8s_ease-out_infinite] rounded-full bg-brand-mint/70" />
                  <span className="relative inline-flex size-2 rounded-full bg-brand-mint" />
                </span>
                Recuperado pela maanu
              </p>
              <p className="mt-2 font-display text-[2.1rem] leading-none font-semibold tracking-[-0.03em] text-white">
                <CountUp value={1247.3} format={formatBRL} duration={2600} />
              </p>
              <p className="mt-2 text-xs leading-snug text-white/60">
                5 revisões enviadas em que o Mercado Livre deu razão ao vendedor.{" "}
                <span className="text-white/40">Dados de demonstração.</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <Marquee className="mt-16 sm:mt-24" speed={52}>
        {TICKER.map((item) => (
          <span key={item.text} className="mx-2 inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] py-2 pr-5 pl-3 text-sm whitespace-nowrap text-white/80 backdrop-blur">
            <item.icon className="size-4 text-brand-mint" aria-hidden />
            {item.text}
          </span>
        ))}
      </Marquee>

      <div aria-hidden className="mt-14 px-3 pre-pixel sm:mt-20 sm:px-6">
        <SpotlightWordmark className="mx-auto max-w-[96rem]" />
      </div>
    </section>
  )
}