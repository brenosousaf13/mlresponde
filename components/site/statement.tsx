import { siteConfig } from "@/lib/config/site"

import { Headline } from "./headline"
import { Container } from "./primitives"
import { Reveal } from "./reveal"
import { SiteButton } from "./site-button"

const ITEMS = [
  "Responde em segundos, a qualquer hora do dia ou da noite",
  "Enxerga a cor da conta antes que ela caia",
  "Recupera o dinheiro de devoluções que passaria batido",
  "Ensina a IA uma vez e ela lembra para as próximas",
  "Deixa de perder venda por pergunta sem resposta",
] as const

export function Statement({ signupHref }: { signupHref: string }) {
  return (
    <section data-nav="dark" aria-labelledby="statement-title" className="pre-pixel relative isolate overflow-clip bg-brand-night pt-24 text-white sm:pt-36">
      <Container className="grid max-w-7xl grid-cols-1 gap-12 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <Headline id="statement-title" as="h2" dot="mint" className="font-display text-[2.2rem] leading-[1.02] font-semibold tracking-[-0.035em] sm:text-5xl">
            Com a {siteConfig.name}, você
          </Headline>
        </div>
        <div className="lg:col-span-8">
          <ul>
            {ITEMS.map((item, index) => (
              <li key={item} className="group/item border-t border-white/15 first:border-t-0">
                <Reveal delay={index * 60} className="py-5 sm:py-7">
                  <p className="font-display text-[1.45rem] leading-[1.12] font-semibold tracking-[-0.015em] text-balance text-white/90 transition-colors duration-300 group-hover/item:text-brand-mint sm:text-4xl">
                    {item}
                  </p>
                </Reveal>
              </li>
            ))}
          </ul>
          <Reveal className="mt-10 border-t border-white/15 pt-10">
            <p className="font-display text-3xl leading-[1.05] font-semibold tracking-[-0.025em] text-brand-mint sm:text-4xl">
              Mais tempo para vender, menos para ficar no celular.
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