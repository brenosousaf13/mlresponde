import { Plug, Power, SlidersHorizontal } from "lucide-react"

import { ImageSlot } from "./image-slot"
import { Container, Eyebrow, SectionTitle } from "./primitives"
import { Reveal } from "./reveal"

const STEPS = [
  {
    icon: Plug,
    title: "Conecte sua conta",
    text: "Clique em conectar e autorize no próprio Mercado Livre. A maanu nunca pede a sua senha, e você desconecta quando quiser.",
    image: "Print da tela de conexão com o Mercado Livre",
  },
  {
    icon: SlidersHorizontal,
    title: "Conte como sua loja funciona",
    text: "Uma configuração guiada pergunta o que importa: garantia, prazo de envio, trocas, nota fiscal e o seu jeito de falar com o cliente. Dá para mudar tudo depois.",
    image: "Print da configuração guiada do Assistente de IA",
  },
  {
    icon: Power,
    title: "Ligue e acompanhe",
    text: "As perguntas passam a ser respondidas em segundos. Você acompanha tudo numa caixa de entrada e assume a conversa quando quiser.",
    image: "Print da caixa de entrada de Perguntas",
  },
] as const

export function HowItWorks() {
  return (
    <section id="como-funciona" aria-labelledby="como-funciona-title" className="scroll-mt-24 pt-20 pb-10 sm:pt-28 sm:pb-14">
      <Container>
        <Reveal className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <Eyebrow>Como funciona</Eyebrow>
            <SectionTitle id="como-funciona-title" className="mt-5">
              Três passos. <span className="text-muted-foreground">Nada para instalar.</span>
            </SectionTitle>
          </div>
          <p className="max-w-sm text-lg leading-relaxed text-pretty text-muted-foreground">
            Do cadastro à primeira resposta automática em poucos minutos, direto do navegador.
          </p>
        </Reveal>

        <ol className="relative mt-14 grid gap-6 lg:grid-cols-3 lg:gap-5">
          {/* Linha que liga os passos, com um ponto de luz correndo (só no computador). */}
          <li aria-hidden className="pointer-events-none absolute top-[2.15rem] right-[calc(33.333%-2.98rem)] left-[2.15rem] hidden h-px bg-border lg:block">
            <span className="site-motion absolute -top-[3px] size-[7px] animate-[site-travel_3.6s_ease-in-out_infinite] rounded-full bg-brand-teal shadow-[0_0_12px_2px] shadow-brand-teal/60" />
          </li>

          {STEPS.map((step, i) => (
            <li key={step.title}>
              <Reveal delay={i * 110} className="flex h-full flex-col">
                <div className="flex items-center gap-3">
                  <span className="relative z-10 grid size-[4.3rem] shrink-0 place-items-center rounded-2xl border border-border bg-white shadow-[0_10px_30px_-18px] shadow-slate-900/40">
                    <step.icon className="size-6 text-brand-teal-ink" aria-hidden />
                    <span className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-brand-graphite font-mono text-[11px] font-semibold text-white">
                      {i + 1}
                    </span>
                  </span>
                </div>
                <h3 className="mt-6 font-display text-2xl font-semibold tracking-tight">{step.title}</h3>
                <p className="mt-2 leading-relaxed text-pretty text-muted-foreground">{step.text}</p>
                <ImageSlot label={step.image} hint="Recomendado: 1200 × 900 px" className="mt-6 aspect-[4/3] w-full" />
              </Reveal>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  )
}
