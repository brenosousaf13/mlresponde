import { ArrowRightIcon } from "lucide-react"

import { Container } from "./primitives"
import { Reveal } from "./reveal"
import { ScrollWords } from "./scroll-words"

const ROWS = [
  {
    title: "A pergunta chega às 23h47 e fica sem resposta",
    body: (
      <>
        O comprador pergunta em três lojas e compra de quem <b>responde primeiro</b>. Ninguém consegue ficar de olho no celular
        24 horas por dia, sete dias por semana. Pergunta parada é venda indo para o concorrente.
      </>
    ),
  },
  {
    title: "Uma reclamação a mais e a cor da conta cai",
    body: (
      <>
        Reclamação, cancelamento e envio atrasado entram no <b>termômetro do Mercado Livre</b>. Quando você percebe, a cor já
        caiu, e o desconto no frete e a visibilidade dos anúncios vão junto.
      </>
    ),
  },
  {
    title: "O dinheiro da devolução vai para o comprador, sem aviso",
    body: (
      <>
        Quando o produto volta e o armazém do ML o marca como <b>sem condição de venda</b>, o dinheiro pode ir para o comprador.
        Dá para contestar, mas o prazo é curto e o aviso <b>costuma passar batido</b>.
      </>
    ),
    highlight: true,
  },
] as const

export function ProblemSection() {
  return (
    <section id="problema" aria-labelledby="problema-title" data-nav="light" className="pre-pixel relative bg-brand-offwhite pt-24 text-brand-graphite sm:pt-36">
      <Container className="relative max-w-6xl">
        <ScrollWords
          id="problema-title"
          className="max-w-5xl font-display text-[2.3rem] leading-[1.04] font-semibold tracking-[-0.03em] sm:text-6xl lg:text-[4.4rem]"
        >
          Vender no Mercado Livre não deveria ser assim: pergunta{" "}
          <span className="text-brand-teal-ink">sem resposta</span>, reputação{" "}
          <span className="text-brand-teal-ink">por um fio</span> e dinheiro que{" "}
          <span className="text-brand-teal-ink">some sem aviso</span>.
        </ScrollWords>

        <ol className="mt-20 sm:mt-28">
          {ROWS.map((row) => (
            <li key={row.title} className="border-t border-brand-graphite/15">
              <Reveal className="grid grid-cols-1 gap-5 py-10 sm:py-14 lg:grid-cols-12 lg:gap-8">
                <h3 className="font-display text-[1.65rem] leading-[1.1] font-semibold tracking-[-0.02em] text-balance sm:text-3xl lg:col-span-5">
                  {row.title}
                </h3>
                <div className="lg:col-span-6 lg:col-start-7">
                  <p className="max-w-xl text-lg leading-relaxed text-pretty text-slate-600 [&_b]:font-semibold [&_b]:text-brand-graphite">{row.body}</p>
                  {"highlight" in row ? (
                    <a href="#recuperar" className="group mt-6 inline-flex items-center gap-2 text-base font-semibold text-brand-teal-ink underline decoration-brand-teal/50 underline-offset-4 hover:decoration-brand-teal">
                      É aqui que entra o Recuperador
                      <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </a>
                  ) : null}
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  )
}