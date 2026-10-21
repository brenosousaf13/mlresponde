import { BotIcon, CheckIcon, PencilIcon, StoreIcon, TrendingUpIcon, UserIcon } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

import { Headline } from "./headline"
import { Container } from "./primitives"
import { Reveal } from "./reveal"
import { SiteButton } from "./site-button"

function Card({ n, title, text, children, className, delay = 0 }: { n: string; title: string; text: string; children: ReactNode; className?: string; delay?: number }) {
  return (
    <Reveal delay={delay} className={cn("h-full", className)}>
      <article className="group/bento flex h-full flex-col overflow-hidden rounded-[1.6rem] border border-brand-graphite/10 bg-white p-7 transition-[box-shadow,transform] duration-300 hover:-translate-y-1 hover:shadow-[0_30px_60px_-34px] hover:shadow-brand-graphite/40">
        <p className="font-mono text-xs text-brand-teal-ink">{n}</p>
        <h3 className="mt-3 font-display text-2xl leading-[1.1] font-semibold tracking-[-0.02em] text-brand-graphite">{title}</h3>
        <p className="mt-2 max-w-md text-[15px] leading-relaxed text-slate-600">{text}</p>
        <div className="mt-6 flex flex-1 items-end">{children}</div>
      </article>
    </Reveal>
  )
}

const INBOX = [
  { q: "Esse tênis tem no 42?", tag: "IA", time: "3 min", tone: "ai" },
  { q: "Cabe notebook de 15,6?", tag: "IA", time: "11 min", tone: "ai" },
  { q: "Emitem nota no CNPJ? São 12 peças.", tag: "Para você", time: "38 min", tone: "open" },
  { q: "Tem outra cor além do preto?", tag: "Você", time: "2 h", tone: "you" },
] as const

export function Bento({ signupHref }: { signupHref: string }) {
  return (
    <section id="recursos" aria-labelledby="recursos-title" data-nav="light" className="pre-pixel relative bg-brand-offwhite text-brand-graphite">
      <Container className="max-w-7xl">
        <div className="max-w-4xl">
          <p className="font-mono text-xs tracking-[0.2em] text-brand-teal-ink uppercase">Recursos</p>
          <Headline id="recursos-title" as="h2" className="mt-5 font-display text-[2.4rem] leading-[1] font-semibold tracking-[-0.04em] sm:text-6xl">
            Tudo para atender, proteger e recuperar
          </Headline>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">
            Responda os compradores, acompanhe a sua loja e corra atrás do que ficou para trás, sem juntar cinco ferramentas.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-4 lg:grid-cols-12">
          <Card n="01" title="Caixa de entrada" text="Tudo o que os compradores perguntaram, quem respondeu e o que ainda espera por você, com busca e filtros." className="lg:col-span-7">
            <div className="w-full overflow-hidden rounded-2xl border border-brand-graphite/10 bg-brand-offwhite">
              {INBOX.map((row, i) => (
                <div key={row.q} className={cn("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-brand-graphite/8", i === 2 && "bg-amber-50")}>
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-full text-white", row.tone === "ai" ? "bg-brand-teal" : row.tone === "open" ? "bg-amber-500" : "bg-brand-graphite")}>
                    {row.tone === "you" ? <UserIcon className="size-4" aria-hidden /> : <BotIcon className="size-4" aria-hidden />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.q}</span>
                  <span className={cn("hidden rounded-full px-2.5 py-0.5 text-xs font-medium sm:inline", row.tone === "open" ? "bg-amber-100 text-amber-800" : "bg-brand-teal/12 text-brand-teal-ink")}>{row.tag}</span>
                  <span className="font-mono text-[11px] text-slate-400">{row.time}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card n="02" title="Ensine a IA uma vez" text="Corrigiu uma resposta? Ela vira exemplo e a IA responde perguntas parecidas do seu jeito." className="lg:col-span-5" delay={80}>
            <div className="w-full space-y-3 text-sm">
              <p className="w-fit rounded-2xl rounded-tl-sm bg-slate-100 px-3.5 py-2.5">Tem garantia?</p>
              <p className="ml-auto flex w-fit max-w-[85%] items-start gap-2 rounded-2xl rounded-tr-sm bg-brand-sage px-3.5 py-2.5">
                <PencilIcon className="mt-0.5 size-3.5 shrink-0 text-brand-teal-ink" aria-hidden />
                Garantia de 12 meses direto com a fábrica.
              </p>
              <p className="inline-flex items-center gap-2 rounded-full bg-brand-graphite px-3.5 py-1.5 text-xs font-medium text-white">
                <CheckIcon className="size-3.5 text-brand-mint" aria-hidden />
                A IA aprendeu: próxima vez responde sozinha
              </p>
            </div>
          </Card>

          <Card n="03" title="Pós-venda com IA" text="Quem já comprou também pergunta. A IA atende o pós-venda e deixa com você o que for delicado." className="lg:col-span-4" delay={40}>
            <div className="w-full space-y-2.5 text-sm">
              <p className="w-fit rounded-2xl rounded-tl-sm bg-slate-100 px-3.5 py-2.5">Meu pedido chegou, mas a caixa estava amassada.</p>
              <p className="ml-auto w-fit max-w-[88%] rounded-2xl rounded-tr-sm bg-brand-sage px-3.5 py-2.5">Sinto muito! Pode me enviar uma foto do produto? Já te ajudo.</p>
              <p className="text-xs text-slate-500">Planos Pro e Escala</p>
            </div>
          </Card>

          <Card n="04" title="Melhorias de anúncio" text="As perguntas mostram o que falta no seu anúncio. A maanu sugere o que ajustar para vender mais." className="lg:col-span-4" delay={120}>
            <div className="w-full rounded-2xl border border-brand-graphite/10 bg-brand-offwhite p-4 text-sm">
              <p className="flex items-center gap-2 font-semibold">
                <TrendingUpIcon className="size-4 text-brand-teal-ink" aria-hidden />
                Adicione a tabela de medidas
              </p>
              <p className="mt-1 text-xs text-slate-500">14 compradores perguntaram sobre tamanho</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full w-[78%] rounded-full bg-brand-teal" />
              </div>
            </div>
          </Card>

          <Card n="05" title="Várias contas, um painel" text="Todas as suas contas do Mercado Livre no mesmo lugar, cada uma com as suas regras." className="lg:col-span-4" delay={200}>
            <div className="flex w-full flex-col gap-2">
              {["CASA.AURORA", "AURORA OUTLET", "CASA PET"].map((name, i) => (
                <div key={name} className="flex items-center gap-3 rounded-xl border border-brand-graphite/10 bg-brand-offwhite px-3.5 py-2.5 text-sm font-medium">
                  <StoreIcon className="size-4 text-slate-500" aria-hidden />
                  {name}
                  <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-normal text-brand-teal-ink">
                    <span className="relative flex size-2">
                      <span className="site-motion absolute inline-flex size-full animate-[site-ping_2.4s_ease-out_infinite] rounded-full bg-brand-teal/60" style={{ animationDelay: `${i * 0.5}s` }} />
                      <span className="relative inline-flex size-2 rounded-full bg-brand-teal" />
                    </span>
                    conectada
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Reveal className="mt-10 flex justify-center">
          <SiteButton href={signupHref} size="lg" variant="graphite">
            Começar o teste grátis
          </SiteButton>
        </Reveal>
      </Container>
    </section>
  )
}