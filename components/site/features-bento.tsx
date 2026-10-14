import { GraduationCap, Inbox, Lightbulb, Truck, UsersRound } from "lucide-react"
import type { CSSProperties, ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

import { ImageSlot } from "./image-slot"
import { Container, Eyebrow, SectionTitle } from "./primitives"
import { Reveal } from "./reveal"

function Card({
  icon: Icon,
  title,
  text,
  plan,
  className,
  children,
  delay = 0,
}: {
  icon: typeof Inbox
  title: string
  text: string
  plan?: string
  className?: string
  children?: ReactNode
  delay?: number
}) {
  return (
    <Reveal delay={delay} className={cn("h-full", className)}>
      <article className="group flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-border bg-white p-6 transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-[0_30px_70px_-40px] hover:shadow-slate-900/30 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-brand-sage text-brand-teal-ink transition-colors group-hover:bg-brand-teal group-hover:text-white">
            <Icon className="size-5" aria-hidden />
          </span>
          {plan ? (
            <Badge variant="outline" className="border-brand-teal/30 text-brand-teal-ink">
              {plan}
            </Badge>
          ) : null}
        </div>
        <h3 className="mt-5 font-display text-2xl font-semibold tracking-tight">{title}</h3>
        <p className="mt-2 leading-relaxed text-pretty text-muted-foreground">{text}</p>
        {children ? <div className="mt-6 flex flex-1 flex-col justify-end">{children}</div> : null}
      </article>
    </Reveal>
  )
}

const INBOX_TABS = [
  { label: "Respondidas pela IA", tone: "bg-brand-sage text-brand-teal-ink" },
  { label: "Respondidas por você", tone: "bg-slate-100 text-slate-700" },
  { label: "Para responder", tone: "bg-amber-100 text-amber-800" },
] as const

const WEEKS = [
  { before: 92, after: 54 },
  { before: 80, after: 41 },
  { before: 100, after: 36 },
  { before: 86, after: 30 },
] as const

export function FeaturesBento() {
  return (
    <section id="mais-recursos" aria-labelledby="mais-recursos-title" className="scroll-mt-24 bg-brand-offwhite py-20 sm:py-28">
      <Container>
        <Reveal className="mx-auto max-w-3xl text-center">
          <Eyebrow>Recursos</Eyebrow>
          <SectionTitle id="mais-recursos-title" className="mt-5">
            Tudo para atender bem, <span className="text-muted-foreground">num lugar só.</span>
          </SectionTitle>
        </Reveal>

        <div className="mt-14 grid gap-4 lg:grid-cols-6">
          <Card
            icon={Inbox}
            title="Caixa de entrada que se organiza sozinha"
            text="O que a IA respondeu, o que você respondeu e o que está esperando por você, separados e com contador. Responda dali mesmo, com a sugestão da IA pronta."
            className="lg:col-span-4 lg:row-span-2"
          >
            <div className="flex flex-wrap gap-2">
              {INBOX_TABS.map((tab) => (
                <span key={tab.label} className={cn("rounded-full px-3 py-1 text-xs font-medium", tab.tone)}>
                  {tab.label}
                </span>
              ))}
            </div>
            <ImageSlot
              label="Print da caixa de entrada de Perguntas (lista + conversa)"
              hint="Recomendado: 1600 × 1000 px"
              className="mt-4 aspect-[16/10] w-full"
            />
          </Card>

          <Card
            icon={GraduationCap}
            title="Ensine uma vez"
            text="Corrigiu uma resposta? Clique em “Ensinar a IA” e ela usa o exemplo nas próximas perguntas parecidas."
            className="lg:col-span-2"
            delay={80}
          >
            <div aria-hidden className="space-y-2 text-sm">
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-muted-foreground line-through decoration-slate-400">
                Prazo de entrega de 15 dias.
              </p>
              <p className="flex items-center justify-between gap-2 rounded-xl bg-brand-sage px-3 py-2 text-brand-teal-ink">
                <span>Fabricamos em até 3 dias úteis.</span>
                <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold">Ensinado</span>
              </p>
            </div>
          </Card>

          <Card
            icon={Truck}
            title="Pós-venda no automático"
            text="Rastreio, prazo, nota fiscal: ela lê a venda e o envio e responde quem já comprou. Reclamação fica com você."
            plan="Pro e Escala"
            className="lg:col-span-2"
            delay={140}
          >
            <div aria-hidden className="space-y-2 text-sm">
              <p className="w-fit rounded-2xl rounded-tl-md bg-slate-100 px-3 py-2">Cadê meu pedido?</p>
              <p className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-tr-md bg-brand-graphite px-3 py-2 text-white">
                Saiu ontem e a previsão é quinta-feira. 😊
              </p>
            </div>
          </Card>

          <Card
            icon={Lightbulb}
            title="Melhorias de anúncio"
            text="A IA lê as perguntas de cada anúncio e mostra o que está faltando nele, com o texto pronto para colar. Menos pergunta repetida, mais venda."
            plan="Pro e Escala"
            className="lg:col-span-3"
            delay={60}
          >
            <div aria-hidden>
              <div className="flex h-24 items-end gap-3">
                {WEEKS.map((week, i) => (
                  <div key={i} className="flex h-full flex-1 items-end gap-1">
                    <span
                      style={{ "--h": `${week.before}%`, transitionDelay: `${i * 90}ms` } as CSSProperties}
                      className="site-motion h-0 flex-1 rounded-t-md bg-slate-200 transition-[height] duration-700 in-data-[visible=true]:h-(--h)"
                    />
                    <span
                      style={{ "--h": `${week.after}%`, transitionDelay: `${200 + i * 90}ms` } as CSSProperties}
                      className="site-motion h-0 flex-1 rounded-t-md bg-brand-teal transition-[height] duration-700 in-data-[visible=true]:h-(--h)"
                    />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-slate-300" /> Perguntas por semana, antes
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-brand-teal" /> depois da melhoria
                </span>
              </div>
            </div>
          </Card>

          <Card
            icon={UsersRound}
            title="Várias contas, um painel só"
            text="Até 10 contas do Mercado Livre no plano Escala, cada uma com as próprias regras e o próprio jeito de responder."
            className="lg:col-span-3"
            delay={120}
          >
            <ul aria-hidden className="space-y-2 text-sm">
              {["LOJA_CENTRO", "LOJA_OUTLET", "LOJA_KIDS"].map((account, i) => (
                <li key={account} className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                  <span className="font-mono text-xs">{account}</span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-brand-teal-ink">
                    <span className={cn("size-1.5 rounded-full bg-brand-teal", i === 0 && "animate-pulse")} />
                    IA respondendo
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </Container>
    </section>
  )
}
