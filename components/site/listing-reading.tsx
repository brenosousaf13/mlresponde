import { ArrowDown, Ban, BookOpen, Boxes, Check, FileText, ListChecks, MessagesSquare, Package, PhoneOff, Ruler, Sparkles, Store } from "lucide-react"
import type { CSSProperties } from "react"

import { Container, Eyebrow, SectionTitle } from "./primitives"
import { Reveal } from "./reveal"

const LAYERS = [
  { icon: FileText, label: "Título, preço e condições", detail: "frete, garantia, prazo de fabricação" },
  { icon: ListChecks, label: "Ficha técnica", detail: "todos os atributos do anúncio" },
  { icon: Boxes, label: "Variações e estoque", detail: "cor, tamanho e o que tem disponível" },
  { icon: Ruler, label: "Tabela de medidas", detail: "quando o anúncio tem uma" },
  { icon: BookOpen, label: "Descrição completa", detail: "do começo ao fim" },
  { icon: MessagesSquare, label: "Perguntas já respondidas", detail: "para manter a mesma informação" },
  { icon: Store, label: "Regras da sua loja", detail: "o que você ensinou na configuração" },
] as const

const CYCLE_S = 7

const POINTS = [
  { icon: Ban, title: "Variação esgotada? Ela não oferece.", text: "Ela confere o estoque de cada cor e tamanho antes de responder." },
  {
    icon: MessagesSquare,
    title: "Mesmo comprador, mesma conversa.",
    text: "Ela vê o que já foi respondido no anúncio e não se contradiz.",
  },
  {
    icon: PhoneOff,
    title: "Nada de telefone, e-mail ou link de fora.",
    text: "Ela segue as regras do Mercado Livre, sempre.",
  },
] as const

function ListingScan() {
  return (
    <div aria-hidden className="relative">
      <div className="absolute -inset-6 rounded-[2.5rem] bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--brand-teal)_22%,transparent),transparent)] blur-2xl" />
      <div className="relative overflow-hidden rounded-[1.75rem] border border-border bg-white p-5 shadow-[0_30px_80px_-40px] shadow-slate-900/30 sm:p-6">
        <div className="flex items-center gap-4">
          <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-400">
            <Package className="size-7" />
          </span>
          <div className="min-w-0">
            <p className="font-medium leading-snug">Tênis de corrida masculino com amortecimento</p>
            <p className="mt-0.5 text-sm text-muted-foreground">R$ 299,90 · 6 cores · tamanhos 37 a 44</p>
          </div>
        </div>

        <div className="relative mt-5">
          {/* Linha de leitura */}
          <span className="site-motion pointer-events-none absolute inset-x-0 z-10 h-10 -translate-y-1/2 animate-[site-scan_3.5s_ease-in-out_infinite] bg-[linear-gradient(to_bottom,transparent,color-mix(in_oklch,var(--brand-teal)_16%,transparent)_45%,var(--brand-teal)_50%,color-mix(in_oklch,var(--brand-teal)_16%,transparent)_55%,transparent)]" />
          <ul className="flex flex-col gap-1.5">
            {LAYERS.map(({ icon: Icon, label, detail }, i) => {
              const style = { animationDelay: `${(i * CYCLE_S * 0.09).toFixed(2)}s` } as CSSProperties
              return (
                <li
                  key={label}
                  style={style}
                  className="site-motion-static flex animate-[site-light_7s_ease-in-out_infinite] items-center gap-3 rounded-xl border border-border/70 bg-slate-50/70 px-3 py-2.5"
                >
                  <Icon className="size-4 shrink-0 text-brand-teal-ink" />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-medium">{label}</span>
                    <span className="hidden text-muted-foreground sm:inline"> · {detail}</span>
                  </span>
                  <span
                    style={style}
                    className="site-motion-static grid size-5 animate-[site-check_7s_ease-in-out_infinite] place-items-center rounded-full bg-brand-teal text-white"
                  >
                    <Check className="size-3" />
                  </span>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="mt-4 flex flex-col items-center gap-2">
          <ArrowDown className="size-4 text-muted-foreground" />
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-graphite px-4 py-2 text-sm font-medium text-white">
            <Sparkles className="size-4 text-brand-mint" />
            Resposta sobre este anúncio, em segundos
          </span>
        </div>
      </div>
    </div>
  )
}

export function ListingReading() {
  return (
    <section id="recursos" aria-labelledby="leitura-title" className="scroll-mt-24 py-20 sm:py-28">
      <Container className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
        <Reveal className="order-2 lg:order-1">
          <ListingScan />
        </Reveal>

        <Reveal delay={100} className="order-1 lg:order-2">
          <Eyebrow>Ela lê tudo antes de responder</Eyebrow>
          <SectionTitle id="leitura-title" className="mt-5">
            Não é resposta pronta. <span className="text-brand-teal-ink">É resposta sobre o seu anúncio.</span>
          </SectionTitle>
          <p className="mt-6 text-lg leading-relaxed text-pretty text-muted-foreground">
            Antes de cada resposta, a maanu lê o anúncio inteiro e junta com as regras da sua loja. Por isso ela responde a
            pergunta que o comprador fez, e não uma frase genérica que serve para qualquer produto.
          </p>
          <ul className="mt-8 flex flex-col gap-5">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-sage text-brand-teal-ink">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="block font-medium">{title}</span>
                  <span className="block text-muted-foreground">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </Reveal>
      </Container>
    </section>
  )
}
