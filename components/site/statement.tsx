import { siteConfig } from "@/lib/config/site"

import { Headline } from "./headline"
import { Container } from "./primitives"
import { Reveal } from "./reveal"
import { SiteButton } from "./site-button"

const ITEMS = [
  "Responde em segundos, a qualquer hora do dia ou da noite",
  "Enxerga a cor da conta antes que ela caia",
  "Recupera o dinheiro de devoluções que passaria batido",
  "Ensina a IA uma vez e ela lembra para sempre",
  "Dorme sem medo de deixar uma venda no vácuo",
] as const

export function Statement({ signupHref }: { signupHref: string }) {
  return (
    <section data-nav="dark" aria-labelledby="statement-title" className="pre-pixel relative isolate overflow-clip bg-brand-night pt-24 text-white sm:pt-36">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="hero-grid absolute inset-0 opacity-60" />
        <div className="absolute -bottom-40 left-1/3 size-[40rem] rounded-full bg-brand-teal/15 blur-[120px]" />
      </div>
      <Container className="grid max-w-7xl grid-cols-1 gap-12 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <p className="font-mono text-xs tracking-[0.2em] text-brand-mint uppercase">Na prática</p>
          <Headline id="statement-title" as="h2" dot="mint" className="mt-5 font-display text-[2.2rem] leading-[1.02] font-semibold tracking-[-0.04em] sm:text-5xl">
            Com a {siteConfig.name}, você
          </Headline>
        </div>
        <div className="lg:col-span-8">
          <ol>
            {ITEMS.map((item, index) => (
              <li key={item} className="group/item border-t border-white/12 first:border-t-0">
                <Reveal delay={index * 60} className="flex items-baseline gap-5 py-5 sm:gap-8 sm:py-7">
                  <span className="font-mono text-sm text-brand-mint">0{index + 1}</span>
                  <p className="font-display text-[1.45rem] leading-[1.12] font-semibold tracking-[-0.02em] text-balance text-white/90 transition-colors duration-300 group-hover/item:text-brand-mint sm:text-4xl">
                    {item}
                  </p>
                </Reveal>
              </li>
            ))}
          </ol>
          <Reveal className="mt-10 border-t border-white/12 pt-10">
            <p className="font-display text-3xl leading-[1.05] font-semibold tracking-[-0.03em] text-brand-mint sm:text-4xl">
              Sua loja rodando sozinha, não correndo atrás.
            </p>
            <SiteButton href={signupHref} variant="teal" size="lg" className="mt-8">
              Testar grátis por {siteConfig.trialDays} dias
            </SiteButton>
          </Reveal>
        </div>
      </Container>
    </section>
  )
}