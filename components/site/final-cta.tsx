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
    <section id="cta-final" aria-labelledby="cta-final-title" data-nav="dark" className="relative isolate overflow-clip bg-[#0a2a28] text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="site-motion absolute inset-0 animate-[cta-shift_16s_ease-in-out_infinite_alternate] bg-[radial-gradient(55%_65%_at_78%_92%,#9af0dc_0%,#1FAF9A_22%,transparent_60%),radial-gradient(48%_45%_at_14%_100%,#1FAF9A_0%,rgba(31,175,154,0.55)_45%,transparent_80%),radial-gradient(60%_70%_at_40%_70%,#12957f_0%,rgba(14,124,107,0.6)_35%,transparent_70%),linear-gradient(150deg,#0a1412_0%,#0b2a26_30%,#0E7C6B_62%,#2fb196_100%)] [background-size:120%_120%]" />
        <TileField className="absolute inset-0 grid" />
        <div className="site-grain absolute inset-0 opacity-25" />
      </div>

      <Container className="max-w-7xl pt-24 pb-20 sm:pt-36 sm:pb-28">
        <Reveal>
          <p className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 font-mono text-xs text-white backdrop-blur">
            <Timer className="size-3.5" aria-hidden />
            Você está nesta página há <TimeOnPage />
          </p>
        </Reveal>
        <Headline
          id="cta-final-title"
          as="h2"
          dot="mint"
          className="mt-8 max-w-6xl font-display text-[2.7rem] leading-[0.98] font-semibold tracking-[-0.045em] sm:text-7xl lg:text-[6.6rem]"
        >
          Enquanto você lia, alguém pode ter perguntado <span className="text-brand-graphite">no seu anúncio</span>
        </Headline>
        <Reveal delay={150}>
          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-pretty text-white/85 sm:text-xl">
            E talvez algum dinheiro tenha passado batido numa devolução. Crie sua conta em poucos minutos, conecte o Mercado
            Livre e deixe a próxima pergunta, e a próxima devolução, com a {siteConfig.name}.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <SiteButton href={signupHref} variant="graphite" size="lg">
              Quero testar {siteConfig.trialDays} dias grátis
            </SiteButton>
            {whatsapp ? (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-14 w-fit items-center gap-2.5 rounded-full border border-white/30 bg-white/10 px-8 text-lg font-semibold text-white backdrop-blur transition-colors hover:bg-white/20"
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