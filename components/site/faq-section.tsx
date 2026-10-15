import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { siteConfig } from "@/lib/config/site"
import { FAQ } from "@/lib/site/faq"

import { Container, Eyebrow, SectionTitle } from "./primitives"
import { Reveal } from "./reveal"
import { SiteButton } from "./site-button"


export function FaqSection({ signupHref }: { signupHref: string }) {
  return (
    <section id="duvidas" aria-labelledby="duvidas-title" className="scroll-mt-24 py-20 sm:py-28">
      <Container className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
        <Reveal className="lg:sticky lg:top-28 lg:self-start">
          <Eyebrow>Dúvidas</Eyebrow>
          <SectionTitle id="duvidas-title" className="mt-5 lg:text-5xl">
            Perguntas frequentes. <span className="text-muted-foreground">Respondidas por humanos, desta vez.</span>
          </SectionTitle>
          <p className="mt-6 text-lg leading-relaxed text-pretty text-muted-foreground">
            Separamos o que mais perguntam antes de começar. Ficou alguma? O teste é grátis: dá para ver tudo funcionando na
            sua loja.
          </p>
          <SiteButton href={signupHref} className="mt-9">
            Testar grátis por {siteConfig.trialDays} dias
          </SiteButton>
        </Reveal>

        <Reveal delay={100}>
          {/* hiddenUntilFound: as respostas fechadas ficam no HTML (buscadores, IAs e o Ctrl+F do navegador as encontram). */}
          <Accordion defaultValue={[FAQ[0].id]} hiddenUntilFound className="gap-3">
            {FAQ.map((item) => (
              <AccordionItem
                key={item.id}
                value={item.id}
                className="rounded-2xl border border-border bg-white px-5 transition-colors not-last:border-b data-open:border-brand-teal/40 data-open:bg-brand-sage/25"
              >
                <AccordionTrigger className="py-5 text-base font-medium hover:no-underline sm:text-lg **:data-[slot=accordion-trigger-icon]:mt-1">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="pb-5 text-base leading-relaxed text-muted-foreground">{item.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </Container>
    </section>
  )
}
