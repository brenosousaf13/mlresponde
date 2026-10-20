import { ArrowRight } from "lucide-react"
import type { CSSProperties } from "react"

import { siteConfig } from "@/lib/config/site"

import { HeroDemo } from "./hero-demo"
import { Container } from "./primitives"
import { SiteButton } from "./site-button"

const delay = (ms: number) => ({ "--enter-delay": `${ms}ms` }) as CSSProperties

const STATS = [
  { title: "Segundos", text: "para responder cada pergunta" },
  { title: "24 horas", text: "inclusive fim de semana e feriado" },
  { title: "Só com certeza", text: "na dúvida, a pergunta fica com você" },
  { title: `${siteConfig.trialDays} dias grátis`, text: "com tudo do plano Pro, sem cartão" },
] as const

export function Hero({ signupHref }: { signupHref: string }) {
  return (
    <section id="topo" aria-labelledby="hero-title" className="relative px-3 pt-3 sm:px-4 sm:pt-4">
      <div className="relative isolate site-clip rounded-[2rem] bg-brand-night text-white sm:rounded-[2.75rem]">
        {/* Atmosfera: auroras teal que se mexem devagar, grade fina e grão. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="site-motion absolute -top-1/3 -left-1/4 h-[80%] w-[70%] animate-[site-aurora_18s_ease-in-out_infinite] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--brand-teal)_55%,transparent),transparent)] blur-2xl" />
          <div className="site-motion absolute -right-1/4 -bottom-1/3 h-[85%] w-[70%] animate-[site-aurora_22s_ease-in-out_infinite_reverse] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--brand-mint)_28%,transparent),transparent)] blur-2xl" />
          <div className="site-grid absolute inset-0" />
          <div className="site-grain absolute inset-0" />
        </div>

        <Container className="grid items-center gap-14 pt-28 pb-16 sm:pt-32 lg:grid-cols-[1.08fr_0.92fr] lg:gap-10 lg:pt-40 lg:pb-24">
          <div className="text-center lg:text-left">
            {/* Novidade: leva para a seção do Escudo de Reputação. Fora do título para não atrasar o LCP. */}
            <a
              href="#reputacao"
              style={delay(0)}
              className="site-enter group mb-7 inline-flex max-w-full items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.06] py-1 pr-3.5 pl-1 text-sm text-white/80 backdrop-blur transition-colors outline-none hover:border-brand-teal/50 hover:bg-white/10 hover:text-white focus-visible:ring-3 focus-visible:ring-brand-teal/60"
            >
              <span className="rounded-full bg-brand-teal px-2.5 py-0.5 text-xs font-semibold text-brand-graphite">Novo</span>
              <span className="truncate">
                Escudo de Reputação<span className="hidden sm:inline">: proteja a cor da sua conta</span>
              </span>
              <ArrowRight className="size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </a>
            <h1
              id="hero-title"
              className="font-display text-[2.6rem] leading-[0.98] font-semibold tracking-[-0.045em] text-balance sm:text-6xl lg:text-[3.7rem] xl:text-[4.6rem]"
            >
              <span style={delay(0)} className="site-rise block">
                Quem responde primeiro,
              </span>
              <span style={delay(60)} className="site-rise block">
                <span className="site-gradient-text">vende primeiro.</span>
              </span>
            </h1>

            <p
              style={delay(120)}
              className="site-rise mx-auto mt-6 max-w-xl text-lg leading-relaxed text-pretty text-white/70 lg:mx-0"
            >
              A {siteConfig.name} responde com IA as perguntas dos seus anúncios no Mercado Livre, em segundos e do jeito da
              sua loja. De dia, de madrugada, no domingo. E quando ela não tem certeza, a pergunta fica com você.
            </p>

            <div
              style={delay(340)}
              className="site-enter mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center lg:justify-start"
            >
              <SiteButton href={signupHref} variant="teal" className="max-sm:w-full">
                Testar grátis por {siteConfig.trialDays} dias
              </SiteButton>
              <SiteButton href="#como-funciona" variant="outline-dark" icon="down" className="max-sm:w-full">
                Ver como funciona
              </SiteButton>
            </div>
          </div>

          <div style={delay(280)} className="site-enter">
            <HeroDemo />
          </div>
        </Container>

        <div className="border-t border-white/10 bg-white/[0.02]">
          <Container>
            <ul className="grid grid-cols-2 divide-white/10 lg:grid-cols-4 lg:divide-x">
              {STATS.map(({ title, text }) => (
                <li key={title} className="px-1 py-6 lg:px-6 lg:first:pl-0">
                  <span className="block font-display text-lg font-semibold tracking-tight">{title}</span>
                  <span className="block text-sm leading-snug text-white/55">{text}</span>
                </li>
              ))}
            </ul>
          </Container>
        </div>
      </div>
    </section>
  )
}
