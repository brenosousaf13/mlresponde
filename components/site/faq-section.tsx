import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { siteConfig } from "@/lib/config/site"
import { FAQ } from "@/lib/site/faq"

import { Headline } from "./headline"
import { Container } from "./primitives"
import { Reveal } from "./reveal"
import { SiteButton } from "./site-button"

export function FaqSection({ signupHref }: { signupHref: string }) {
  return (
    <section id="duvidas" aria-labelledby="duvidas-title" data-nav="light" className="relative scroll-mt-24 bg-brand-offwhite py-24 text-brand-graphite sm:py-36">
      <Container className="grid max-w-7xl gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <Headline id="duvidas-title" as="h2" className="font-display text-[2.4rem] leading-[1] font-semibold tracking-[-0.035em] sm:text-6xl">
            Perguntas frequentes, respondidas por humanos
          </Headline>
          <Reveal delay={100}>
            <p className="mt-6 text-lg leading-relaxed text-pretty text-slate-600">
              Separamos o que mais perguntam antes de começar. Ficou alguma? O teste é grátis: dá para ver tudo funcionando na sua loja.
            </p>
            <SiteButton href={signupHref} className="mt-9">
              Testar grátis por {siteConfig.trialDays} dias
            </SiteButton>
          </Reveal>
        </div>

        <Reveal delay={100}>
          {/* hiddenUntilFound: as respostas fechadas ficam no HTML (buscadores, IAs e o Ctrl+F do navegador as encontram). */}
          <Accordion defaultValue={[FAQ[0].id]} hiddenUntilFound className="gap-3">
            {FAQ.map((item) => (
              <AccordionItem
                key={item.id}
                value={item.id}
                className="rounded-2xl border border-brand-graphite/10 bg-white px-5 transition-colors not-last:border-b data-open:border-brand-teal/40 data-open:bg-brand-sage/25"
              >
                <AccordionTrigger className="py-5 text-base font-medium hover:no-underline sm:text-lg **:data-[slot=accordion-trigger-icon]:mt-1">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="pb-5 text-base leading-relaxed text-slate-600">{item.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </Container>
    </section>
  )
}