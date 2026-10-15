import { ChartColumn, Clock3, PiggyBank, Timer } from "lucide-react"

import { ImageSlot } from "./image-slot"
import { Container, Eyebrow, SectionTitle } from "./primitives"
import { Reveal } from "./reveal"
import { SiteButton } from "./site-button"

const ITEMS = [
  { icon: PiggyBank, text: "Economia do mês em reais e em horas" },
  { icon: Timer, text: "Tempo de resposta da IA comparado ao seu" },
  { icon: Clock3, text: "Os horários em que as perguntas chegam" },
  { icon: ChartColumn, text: "Os anúncios que mais geram dúvidas" },
] as const

export function ResultsSection({ signupHref }: { signupHref: string }) {
  return (
    <section aria-labelledby="resultados-title" className="overflow-hidden py-20 sm:py-28">
      <Container className="grid items-center gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <Reveal>
          <Eyebrow>Resultados</Eyebrow>
          <SectionTitle id="resultados-title" className="mt-5">
            Você vê, em reais, <span className="text-brand-teal-ink">o que ela fez por você.</span>
          </SectionTitle>
          <p className="mt-6 text-lg leading-relaxed text-pretty text-muted-foreground">
            Nada de planilha. A tela Resultados mostra quanto tempo e dinheiro a maanu economizou no mês e onde ela ainda
            pode melhorar. Abriu, entendeu.
          </p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {ITEMS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 rounded-2xl border border-border p-4">
                <Icon className="mt-0.5 size-5 shrink-0 text-brand-teal-ink" aria-hidden />
                <span className="text-sm leading-snug">{text}</span>
              </li>
            ))}
          </ul>
          <SiteButton href={signupHref} className="mt-9">
            Quero ver os meus números
          </SiteButton>
        </Reveal>

        <Reveal delay={120} className="relative lg:-mr-24">
          <div className="absolute -inset-8 -z-10 rounded-[3rem] bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--brand-teal)_20%,transparent),transparent)] blur-2xl" />
          <div className="overflow-hidden rounded-[1.5rem] border border-border bg-white shadow-[0_40px_100px_-50px] shadow-slate-900/40">
            <div className="flex items-center gap-2 border-b border-border bg-slate-50 px-4 py-3" aria-hidden>
              <span className="size-2.5 rounded-full bg-slate-300" />
              <span className="size-2.5 rounded-full bg-slate-300" />
              <span className="size-2.5 rounded-full bg-slate-300" />
              <span className="ml-3 truncate rounded-md bg-white px-3 py-1 font-mono text-[11px] text-muted-foreground">
                maanu · Resultados
              </span>
            </div>
            <ImageSlot
              label="Print da tela Resultados (economia, tempo de resposta e gráficos)"
              hint="Recomendado: 1600 × 1000 px"
              className="aspect-[16/10] w-full rounded-none border-0"
            />
          </div>

          <div
            aria-hidden
            className="site-motion absolute -bottom-6 -left-4 animate-[site-float_7s_ease-in-out_infinite] rounded-2xl border border-border bg-white px-4 py-3 shadow-xl sm:-left-10"
          >
            <p className="text-xs text-muted-foreground">Tempo de resposta</p>
            <p className="font-display text-lg font-semibold tracking-tight">
              <span className="text-brand-teal-ink">IA: segundos</span> <span className="text-muted-foreground">· você: quando dá</span>
            </p>
          </div>
        </Reveal>
      </Container>
    </section>
  )
}
