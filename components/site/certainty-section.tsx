import { CircleCheck, Hand, PenLine } from "lucide-react"
import type { CSSProperties } from "react"

import { cn } from "@/lib/utils"

import { Container, Eyebrow, SectionTitle } from "./primitives"
import { Reveal } from "./reveal"

const THRESHOLD = 75

const CASES = [
  {
    question: "Qual a voltagem?",
    product: "Ventilador de mesa 40 cm",
    certainty: 96,
    sent: true,
    outcome: "Respondida sozinha em 4 s",
    text: "Olá! Ele é bivolt: funciona em 110 V e 220 V, sem precisar de adaptador. Boas compras!",
  },
  {
    question: "Faz por R$ 200 no Pix?",
    product: "Ventilador de mesa 40 cm",
    certainty: 38,
    sent: false,
    outcome: "Ficou com você, com sugestão pronta",
    text: "Sugestão: Olá! O valor do anúncio já é o nosso melhor preço, e no Pix você aproveita…",
  },
] as const

function CertaintyCard({ item, index }: { item: (typeof CASES)[number]; index: number }) {
  const style = { "--w": `${item.certainty}%`, transitionDelay: `${300 + index * 250}ms` } as CSSProperties
  return (
    <div
      className={cn(
        "rounded-3xl border bg-white/[0.04] p-5 backdrop-blur sm:p-6",
        item.sent ? "border-brand-teal/30" : "border-amber-400/30"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-white/50">{item.product}</p>
          <p className="mt-1 font-display text-xl font-semibold tracking-tight">“{item.question}”</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 font-mono text-xs font-semibold",
            item.sent ? "bg-brand-teal/15 text-brand-mint" : "bg-amber-400/15 text-amber-300"
          )}
        >
          {item.certainty}%
        </span>
      </div>

      <div className="mt-5">
        <div className="flex justify-between text-[11px] text-white/50">
          <span>Certeza da resposta</span>
          <span>seu rigor: {THRESHOLD}%</span>
        </div>
        <div className="relative mt-2 h-2.5 rounded-full bg-white/10">
          <span
            style={style}
            className={cn(
              "site-motion absolute inset-y-0 left-0 w-0 rounded-full transition-[width] duration-1000 ease-out in-data-[visible=true]:w-(--w)",
              item.sent ? "bg-brand-teal shadow-[0_0_16px] shadow-brand-teal/60" : "bg-amber-400"
            )}
          />
          <span className="absolute -inset-y-1.5 w-0.5 rounded-full bg-white/70" style={{ left: `${THRESHOLD}%` }} />
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2 text-sm font-medium">
        {item.sent ? (
          <CircleCheck className="size-4 text-brand-mint" aria-hidden />
        ) : (
          <Hand className="size-4 text-amber-300" aria-hidden />
        )}
        <span className={item.sent ? "text-brand-mint" : "text-amber-300"}>{item.outcome}</span>
      </div>
      <p className="mt-2 flex gap-2 text-sm leading-relaxed text-white/65">
        {item.sent ? null : <PenLine className="mt-0.5 size-4 shrink-0" aria-hidden />}
        <span className={item.sent ? "" : "italic"}>{item.text}</span>
      </p>
    </div>
  )
}

export function CertaintySection() {
  return (
    <section aria-labelledby="certeza-title" className="px-3 sm:px-4">
      <div className="relative isolate site-clip rounded-[2rem] bg-brand-night py-20 text-white sm:rounded-[2.75rem] sm:py-28">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-40 right-0 h-[30rem] w-[40rem] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--brand-teal)_30%,transparent),transparent)] blur-2xl" />
          <div className="site-grid absolute inset-0 opacity-70" />
        </div>

        <Container className="grid items-center gap-14 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
          <Reveal>
            <Eyebrow tone="dark">Segurança</Eyebrow>
            <SectionTitle id="certeza-title" className="mt-5">
              Na dúvida, <span className="site-gradient-text">ela não inventa.</span>
            </SectionTitle>
            <p className="mt-6 text-lg leading-relaxed text-pretty text-white/70">
              Toda resposta tem um nível de certeza. Se a maanu não tiver segurança, ela não chuta: a pergunta fica com você,
              com uma sugestão de resposta pronta para revisar e enviar.
            </p>
          </Reveal>

          <Reveal delay={120} className="flex flex-col justify-center gap-4">
            {CASES.map((item, index) => (
              <CertaintyCard key={item.question} item={item} index={index} />
            ))}
            <p className="text-center text-xs text-white/45">
              Exemplos ilustrativos. A linha branca é o rigor que você escolhe.
            </p>
          </Reveal>
        </Container>
      </div>
    </section>
  )
}
