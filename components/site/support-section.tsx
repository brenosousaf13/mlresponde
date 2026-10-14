import { ArrowRight, Headset, Mail, MessageCircle, Rocket } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { companyInfo } from "@/lib/config/site"
import { cn } from "@/lib/utils"

import { ImageSlot } from "./image-slot"
import { Pending, whatsappUrl } from "./pending"
import { Container, Eyebrow, SectionTitle } from "./primitives"
import { Reveal } from "./reveal"

const CHANNELS = [
  { icon: Mail, title: "E-mail", text: "Em todos os planos." },
  { icon: MessageCircle, title: "WhatsApp", text: "No Pro e no Escala." },
  { icon: Rocket, title: "Configuração com a gente", text: "No Escala, a gente deixa tudo pronto junto com você." },
] as const

export function SupportSection() {
  const whatsapp = companyInfo.whatsapp
  return (
    <section aria-labelledby="suporte-title" className="overflow-hidden bg-brand-offwhite py-20 sm:py-28">
      <Container className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
        <Reveal>
          <Eyebrow>Suporte</Eyebrow>
          <SectionTitle id="suporte-title" className="mt-5">
            A IA responde seus clientes. <span className="text-brand-teal-ink">Gente de verdade responde você.</span>
          </SectionTitle>
          <p className="mt-6 text-lg leading-relaxed text-pretty text-muted-foreground">
            Travou na configuração ou quer deixar a maanu com a cara da sua loja? Fala com a gente. Quem atende entende de
            Mercado Livre e de IA.
          </p>
          <ul className="mt-8 flex flex-col gap-4">
            {CHANNELS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-center gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-brand-teal-ink shadow-sm">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="font-medium">{title}</span>
                  <span className="text-muted-foreground"> · {text}</span>
                </span>
              </li>
            ))}
          </ul>
          {whatsapp ? (
            <a
              href={whatsappUrl(whatsapp, "Oi! Quero saber mais sobre a maanu.")}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "group mt-9 h-12 rounded-full border-brand-graphite/15 bg-white px-6 text-base font-semibold"
              )}
            >
              <Headset data-icon="inline-start" aria-hidden />
              Falar com a gente
              <ArrowRight data-icon="inline-end" aria-hidden className="transition-transform group-hover:translate-x-0.5" />
            </a>
          ) : (
            <p className="mt-9 text-sm text-muted-foreground">
              Botão “Falar com a gente” aparece aqui com o <Pending>WhatsApp de atendimento</Pending>
            </p>
          )}
        </Reveal>

        <Reveal delay={120} className="relative">
          <div aria-hidden className="absolute -top-10 -right-10 size-56 rounded-full border-[18px] border-brand-teal/20" />
          <div aria-hidden className="absolute -bottom-6 -left-6 h-24 w-40 rounded-[2rem] bg-brand-teal/15" />
          <ImageSlot
            label="Foto do time da maanu atendendo (pessoas reais, ambiente de trabalho)"
            hint="Recomendado: 1200 × 1200 px"
            className="relative aspect-square w-full rounded-[2rem] bg-[color-mix(in_oklch,var(--brand-sage)_75%,white)]"
          />
        </Reveal>
      </Container>
    </section>
  )
}
