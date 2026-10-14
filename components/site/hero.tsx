import { ArrowDown, ArrowRight, Check, Moon, ShieldCheck, Timer, Zap } from "lucide-react"
import type { CSSProperties } from "react"

import { buttonVariants } from "@/components/ui/button"
import { siteConfig } from "@/lib/config/site"
import { cn } from "@/lib/utils"

import { HeroDemo } from "./hero-demo"
import { Container } from "./primitives"

const delay = (ms: number) => ({ "--enter-delay": `${ms}ms` }) as CSSProperties

const PROMISES = ["Sem cartão de crédito", "Cancele quando quiser", "Pronto em minutos"] as const

const STATS = [
  { icon: Zap, title: "Segundos", text: "para responder cada pergunta" },
  { icon: Moon, title: "24 horas", text: "inclusive fim de semana e feriado" },
  { icon: ShieldCheck, title: "Só com certeza", text: "na dúvida, a pergunta fica com você" },
  { icon: Timer, title: `${siteConfig.trialDays} dias grátis`, text: "com tudo do plano Pro, sem cartão" },
] as const

export function Hero({ signupHref }: { signupHref: string }) {
  return (
    <section id="topo" aria-labelledby="hero-title" className="relative px-3 pt-3 sm:px-4 sm:pt-4">
      <div className="relative isolate overflow-hidden rounded-[2rem] bg-brand-night text-white sm:rounded-[2.75rem]">
        {/* Atmosfera: auroras teal que se mexem devagar, grade fina e grão. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="site-motion absolute -top-1/3 -left-1/4 h-[80%] w-[70%] animate-[site-aurora_18s_ease-in-out_infinite] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--brand-teal)_55%,transparent),transparent)] blur-2xl" />
          <div className="site-motion absolute -right-1/4 -bottom-1/3 h-[85%] w-[70%] animate-[site-aurora_22s_ease-in-out_infinite_reverse] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--brand-mint)_28%,transparent),transparent)] blur-2xl" />
          <div className="site-grid absolute inset-0" />
          <div className="site-grain absolute inset-0" />
        </div>

        <Container className="grid items-center gap-14 pt-28 pb-16 sm:pt-32 lg:grid-cols-[1.08fr_0.92fr] lg:gap-10 lg:pt-40 lg:pb-24">
          <div className="text-center lg:text-left">
            <span
              style={delay(0)}
              className="site-enter inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] py-1.5 pr-3.5 pl-2.5 text-xs font-medium text-white/80 backdrop-blur"
            >
              <span className="relative flex size-2">
                <span className="site-motion absolute inset-0 animate-[site-ping_1.8s_ease-out_infinite] rounded-full bg-brand-mint" />
                <span className="relative size-2 rounded-full bg-brand-mint" />
              </span>
              IA que responde o Mercado Livre por você
            </span>

            <h1
              id="hero-title"
              className="mt-6 font-display text-[2.6rem] leading-[0.98] font-semibold tracking-[-0.045em] text-balance sm:text-6xl lg:text-[4.6rem]"
            >
              <span style={delay(80)} className="site-enter block">
                Quem responde primeiro,
              </span>
              <span style={delay(180)} className="site-enter block">
                <span className="site-gradient-text">vende primeiro.</span>
              </span>
            </h1>

            <p
              style={delay(300)}
              className="site-enter mx-auto mt-6 max-w-xl text-lg leading-relaxed text-pretty text-white/70 lg:mx-0"
            >
              A {siteConfig.name} lê o seu anúncio, entende a pergunta do comprador e responde em segundos, do jeito da sua
              loja. De dia, de madrugada, no domingo. E quando ela não tem certeza, a pergunta fica com você.
            </p>

            <div
              style={delay(420)}
              className="site-enter mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start"
            >
              <a
                href={signupHref}
                className={cn(
                  buttonVariants(),
                  "group h-13 w-full rounded-full bg-brand-teal px-7 text-base font-semibold text-brand-graphite shadow-[0_0_50px_-10px] shadow-brand-teal/70 hover:bg-brand-mint sm:w-auto"
                )}
              >
                Testar grátis por {siteConfig.trialDays} dias
                <ArrowRight data-icon="inline-end" aria-hidden className="transition-transform group-hover:translate-x-0.5" />
              </a>
              <a
                href="#como-funciona"
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "h-13 w-full rounded-full border-white/15 bg-white/[0.03] px-6 text-base text-white hover:bg-white/10 hover:text-white sm:w-auto"
                )}
              >
                Ver como funciona
                <ArrowDown data-icon="inline-end" aria-hidden />
              </a>
            </div>

            <ul
              style={delay(520)}
              className="site-enter mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-white/60 lg:justify-start"
            >
              {PROMISES.map((item) => (
                <li key={item} className="inline-flex items-center gap-1.5">
                  <Check className="size-4 text-brand-mint" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div style={delay(350)} className="site-enter">
            <HeroDemo />
          </div>
        </Container>

        <div className="border-t border-white/10 bg-white/[0.02]">
          <Container>
            <ul className="grid grid-cols-2 divide-white/10 lg:grid-cols-4 lg:divide-x">
              {STATS.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex items-start gap-3 px-1 py-6 lg:px-6 lg:first:pl-0">
                  <Icon className="mt-0.5 size-5 shrink-0 text-brand-mint" aria-hidden />
                  <span>
                    <span className="block font-display text-lg font-semibold tracking-tight">{title}</span>
                    <span className="block text-sm leading-snug text-white/55">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Container>
        </div>
      </div>
    </section>
  )
}
