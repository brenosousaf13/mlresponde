import { ArrowRight, Check, Timer } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { siteConfig } from "@/lib/config/site"
import { cn } from "@/lib/utils"

import { ImageSlot } from "./image-slot"
import { Container } from "./primitives"
import { Reveal } from "./reveal"
import { TimeOnPage } from "./time-on-page"

export function FinalCta({ signupHref }: { signupHref: string }) {
  return (
    <section id="cta-final" aria-labelledby="cta-final-title" className="px-3 pt-4 sm:px-4">
      <div className="relative isolate overflow-hidden rounded-[2rem] bg-[linear-gradient(180deg,var(--brand-offwhite),var(--brand-sage))] pt-20 sm:rounded-[2.75rem] sm:pt-28">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="site-motion absolute -bottom-1/3 left-1/2 h-[80%] w-[90%] -translate-x-1/2 animate-[site-aurora_24s_ease-in-out_infinite] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--brand-teal)_32%,transparent),transparent)] blur-2xl" />
        </div>

        <Container>
          <Reveal className="mx-auto max-w-4xl text-center">
            <p className="inline-flex items-center gap-2 rounded-full border border-brand-teal/25 bg-white/70 px-3.5 py-1.5 font-mono text-xs text-brand-teal-ink backdrop-blur">
              <Timer className="size-3.5" aria-hidden />
              Você está nesta página há <TimeOnPage />
            </p>
            <h2
              id="cta-final-title"
              className="mt-7 font-display text-[2.6rem] leading-[1.0] font-semibold tracking-[-0.04em] text-balance sm:text-6xl lg:text-7xl"
            >
              Enquanto você lia, alguém pode ter perguntado <span className="text-brand-teal-ink">no seu anúncio.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-pretty text-muted-foreground">
              Crie sua conta em poucos minutos, conecte o Mercado Livre e deixe a próxima pergunta com a {siteConfig.name}.
            </p>
            <div className="mt-9 flex flex-col items-center gap-4">
              <a
                href={signupHref}
                className={cn(
                  buttonVariants(),
                  "group h-14 rounded-full bg-brand-graphite px-8 text-lg font-semibold text-white shadow-[0_20px_50px_-20px] shadow-brand-graphite/60 hover:bg-brand-graphite/90"
                )}
              >
                Quero testar {siteConfig.trialDays} dias grátis
                <ArrowRight data-icon="inline-end" aria-hidden className="text-brand-mint transition-transform group-hover:translate-x-0.5" />
              </a>
              <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {["Sem cartão de crédito", "Sem fidelidade", "Cancele quando quiser"].map((item) => (
                  <span key={item} className="inline-flex items-center gap-1.5">
                    <Check className="size-4 text-brand-teal-ink" aria-hidden />
                    {item}
                  </span>
                ))}
              </p>
            </div>
          </Reveal>

          <Reveal delay={120} className="mx-auto mt-14 max-w-5xl">
            <ImageSlot
              label="Ilustração de encerramento: a maanu de plantão (celular aceso à noite, respondendo um comprador)"
              hint="Recomendado: 2000 × 800 px, com fundo transparente na parte de baixo"
              className="aspect-[5/2] w-full rounded-b-none border-b-0"
            />
          </Reveal>
        </Container>
      </div>
    </section>
  )
}
