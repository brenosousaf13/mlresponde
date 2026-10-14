import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

import { Container } from "./primitives"

/** O tipo de pergunta que chega todo dia (exemplos, não são dados de clientes). */
const ROW_A = [
  "Tem garantia?",
  "Serve no iPhone 15?",
  "É bivolt?",
  "Envia hoje?",
  "Tem na cor preta?",
  "Vem com nota fiscal?",
  "Qual a medida da cintura no 42?",
  "É original?",
  "Tem pronta entrega?",
  "Funciona com a Alexa?",
] as const

const ROW_B = [
  "Qual o material?",
  "Aceita troca se não servir?",
  "Vem com carregador?",
  "Quantos ml tem?",
  "Serve em criança de 8 anos?",
  "Pode lavar na máquina?",
  "Tem o kit com 2 unidades?",
  "Qual o prazo para o Rio?",
  "Cabe numa mochila?",
  "Qual a voltagem?",
] as const

function Row({ items, reverse, seed }: { items: readonly string[]; reverse?: boolean; seed: number }) {
  // A lista aparece duas vezes para a faixa correr sem emenda (a 2ª cópia é só decorativa).
  const loop = [...items, ...items]
  return (
    <div className="site-fade-x flex overflow-hidden">
      <ul
        className={cn(
          "site-motion flex w-max shrink-0 gap-3 pr-3 hover:[animation-play-state:paused]",
          reverse ? "animate-[site-marquee_60s_linear_infinite_reverse]" : "animate-[site-marquee_52s_linear_infinite]"
        )}
      >
        {loop.map((question, i) => (
          <li
            key={`${question}-${i}`}
            aria-hidden={i >= items.length ? true : undefined}
            className="flex shrink-0 items-center gap-2.5 rounded-full border border-border bg-white py-2 pr-2 pl-4 text-[0.95rem] whitespace-nowrap shadow-[0_1px_2px] shadow-slate-900/5"
          >
            {question}
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-sage px-2 py-0.5 font-mono text-[11px] text-brand-teal-ink">
              <Check className="size-3" aria-hidden />
              {((i * 7 + seed) % 5) + 2} s
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Faixa de perguntas correndo logo abaixo do topo. */
export function QuestionTicker() {
  return (
    <section aria-labelledby="ticker-title" className="py-14 sm:py-16">
      <Container>
        <p id="ticker-title" className="text-center text-sm text-muted-foreground">
          O tipo de pergunta que chega todo dia no seu anúncio{" "}
          <span className="text-foreground">e que a maanu responde sozinha</span>
        </p>
      </Container>
      <div className="mt-7 flex flex-col gap-3">
        <Row items={ROW_A} seed={1} />
        <Row items={ROW_B} reverse seed={3} />
      </div>
    </section>
  )
}
