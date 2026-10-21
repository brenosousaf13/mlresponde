import { ArrowRightIcon, ClockIcon, HandCoinsIcon, ShieldAlertIcon } from "lucide-react"

import { Container } from "./primitives"
import { Reveal } from "./reveal"
import { ScrollWords } from "./scroll-words"

const ROWS = [
  {
    n: "01",
    icon: ClockIcon,
    title: "A pergunta chega às 23h47 e fica sem resposta",
    body: (
      <>
        O comprador pergunta em três lojas e compra de quem <b>responde primeiro</b>. Ninguém consegue ficar de olho no celular
        24 horas por dia, sete dias por semana. Pergunta parada é venda indo para o concorrente.
      </>
    ),
  },
  {
    n: "02",
    icon: ShieldAlertIcon,
    title: "Uma reclamação a mais e a cor da conta cai",
    body: (
      <>
        Reclamação, cancelamento e envio atrasado entram no <b>termômetro do Mercado Livre</b>. Quando você percebe, a cor já
        caiu, e o desconto no frete e a visibilidade dos anúncios vão junto.
      </>
    ),
  },
  {
    n: "03",
    icon: HandCoinsIcon,
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
      <div aria-hidden className="light-grid pointer-events-none absolute inset-0 opacity-60 [mask-image:linear-gradient(#000,transparent_55%)]" />
      <Container className="relative max-w-6xl">
        <Reveal>
          <p className="font-mono text-xs tracking-[0.2em] text-brand-teal-ink uppercase">O problema</p>
        </Reveal>
        <ScrollWords
          id="problema-title"
          className="mt-6 max-w-5xl font-display text-[2.3rem] leading-[1.04] font-semibold tracking-[-0.035em] sm:text-6xl lg:text-[4.4rem]"
        >
          Vender no Mercado Livre não deveria ser assim: pergunta{" "}
          <span className="text-brand-teal-ink">sem resposta</span>, reputação{" "}
          <span className="text-brand-teal-ink">por um fio</span> e dinheiro que{" "}
          <span className="text-brand-teal-ink">some sem aviso</span>.
        </ScrollWords>

        <ol className="mt-20 sm:mt-28">
          {ROWS.map((row, i) => (
            <li key={row.n} className="relative border-t border-brand-graphite/12">
              <Reveal delay={60} className="grid grid-cols-1 gap-5 py-10 sm:py-14 lg:grid-cols-12 lg:gap-8">
                <div className="flex items-start gap-4 lg:col-span-5">
                  <span className="pt-1.5 font-mono text-sm text-brand-teal-ink">{row.n}</span>
                  <div>
                    <span className="relative mb-5 grid size-12 place-items-center rounded-2xl bg-brand-graphite text-brand-mint">
                      <row.icon className="size-5" aria-hidden />
                      <span className="site-motion absolute inset-0 animate-[site-ping_2.6s_ease-out_infinite] rounded-2xl border border-brand-teal/50" style={{ animationDelay: `${i * 0.7}s` }} />
                    </span>
                    <h3 className="font-display text-[1.65rem] leading-[1.1] font-semibold tracking-[-0.02em] text-balance sm:text-3xl">{row.title}</h3>
                  </div>
                </div>
                <div className="lg:col-span-6 lg:col-start-7">
                  <p className="max-w-xl text-lg leading-relaxed text-pretty text-slate-600 [&_b]:font-semibold [&_b]:text-brand-graphite">{row.body}</p>
                  {"highlight" in row ? (
                    <a
                      href="#recuperar"
                      className="group mt-6 inline-flex items-center gap-2 rounded-full bg-brand-teal/12 py-2 pr-4 pl-4 text-sm font-semibold text-brand-teal-ink transition-colors hover:bg-brand-teal/20"
                    >
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