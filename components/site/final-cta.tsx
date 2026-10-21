import { MessageCircleIcon, Timer } from "lucide-react"

import { companyInfo, siteConfig } from "@/lib/config/site"

import { Headline } from "./headline"
import { Container } from "./primitives"
import { Reveal } from "./reveal"
import { SiteButton } from "./site-button"
import { TileField } from "./tile-field"
import { TimeOnPage } from "./time-on-page"

export function FinalCta({ signupHref }: { signupHref: string }) {
  const whatsapp = companyInfo.whatsapp ? `https://wa.me/${companyInfo.whatsapp.replace(/\D/g, "")}` : null
  return (
    <section id="cta-final" aria-labelledby="cta-final-title" data-nav="dark" className="relative isolate overflow-clip bg-[#0c4a43] text-white">
      <TileField aria-hidden className="pointer-events-none absolute inset-0 -z-10 grid" />
      <Container className="max-w-7xl pt-24 pb-20 sm:pt-36 sm:pb-28">
        <Reveal>
          <p className="inline-flex items-center gap-2 text-sm text-white/80">
            <Timer className="size-3.5" aria-hidden />
            Você está nesta página há <TimeOnPage />
          </p>
        </Reveal>
        <Headline
          id="cta-final-title"
          as="h2"
          dot="mint"
          className="mt-8 max-w-6xl font-display text-[2.7rem] leading-[0.98] font-semibold tracking-[-0.035em] sm:text-7xl lg:text-[6rem]"
        >
          Enquanto você lia, alguém pode ter perguntado <span className="text-brand-mint">no seu anúncio</span>
        </Headline>
        <Reveal delay={150}>
          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-pretty text-white/80 sm:text-xl">
            E talvez algum dinheiro tenha passado batido numa devolução. Crie sua conta em poucos minutos, conecte o Mercado
            Livre e deixe a próxima pergunta, e a próxima devolução, com a {siteConfig.name}.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <SiteButton href={signupHref} variant="teal" size="lg">
              Quero testar {siteConfig.trialDays} dias grátis
            </SiteButton>
            {whatsapp ? (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-14 w-fit items-center gap-2.5 rounded-full border border-white/25 px-8 text-lg font-semibold text-white transition-colors hover:bg-white/10"
              >
                <MessageCircleIcon className="size-5" aria-hidden />
                Falar no WhatsApp
              </a>
            ) : null}
          </div>
        </Reveal>
      </Container>
    </section>
  )
}