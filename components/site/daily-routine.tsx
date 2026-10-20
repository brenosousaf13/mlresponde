"use client"

import { useRef, useState, type ReactNode } from "react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

import { Container, Eyebrow, SectionTitle } from "./primitives"
import { Reveal } from "./reveal"
import {
  AccountsPreview,
  AfterSalePreview,
  ImprovementsPreview,
  InboxPreview,
  PreviewWindow,
  TeachPreview,
} from "./routine-previews"
import { useInView, usePrefersReducedMotion } from "./use-in-view"

type Moment = {
  id: string
  label: string
  plan?: string
  title: string
  text: string
  screen: string
  preview: ReactNode
}

/** O que muda para o vendedor, contado do lado dele (o nome do recurso fica só no rótulo). */
const MOMENTS: readonly Moment[] = [
  {
    id: "caixa",
    label: "Caixa de entrada",
    title: "Você abre e já sabe o que fazer.",
    text: "O que a IA respondeu, o que você respondeu e o que está esperando por você ficam separados e contados. Você responde dali mesmo, com a sugestão da IA pronta.",
    screen: "Perguntas",
    preview: <InboxPreview />,
  },
  {
    id: "ensinar",
    label: "Ensinar a IA",
    title: "Corrigiu uma vez, ela aprende.",
    text: "Não gostou de uma resposta? Ajuste o texto e marque “Ensinar a IA”. Nas próximas perguntas parecidas, ela já responde do seu jeito.",
    screen: "Perguntas",
    preview: <TeachPreview />,
  },
  {
    id: "pos-venda",
    label: "Pós-venda",
    plan: "Pro e Escala",
    title: "Quem já comprou também é atendido.",
    text: "“Cadê meu pedido?”, “vem com nota?”: ela lê a venda e o envio e responde. Reclamação e troca ficam com você, com a ajuda do Escudo de Reputação.",
    screen: "Pós-venda",
    preview: <AfterSalePreview />,
  },
  {
    id: "melhorias",
    label: "Melhorias de anúncio",
    plan: "Pro e Escala",
    title: "As perguntas mostram o que falta no anúncio.",
    text: "Quando muita gente pergunta a mesma coisa, falta informação. A IA lê as perguntas de cada anúncio e entrega o texto pronto para colar.",
    screen: "Melhorias de anúncio",
    preview: <ImprovementsPreview />,
  },
  {
    id: "contas",
    label: "Várias contas",
    title: "Todas as suas lojas num painel só.",
    text: "Até 10 contas do Mercado Livre no plano Escala, cada uma com as próprias regras e o próprio jeito de responder.",
    screen: "Contas",
    preview: <AccountsPreview />,
  },
]

/** Tempo de cada item antes de passar sozinho para o próximo. */
const AUTO_MS = 7000

function Label({ moment, index, className }: { moment: Moment; index: number; className?: string }) {
  return (
    <span className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] tracking-[0.16em] uppercase", className)}>
      <span className="tabular-nums">{String(index + 1).padStart(2, "0")}</span>
      <span>{moment.label}</span>
      {moment.plan ? <span className="tracking-normal normal-case">· no {moment.plan}</span> : null}
    </span>
  )
}

export function DailyRoutine() {
  const [active, setActive] = useState(MOMENTS[0].id)
  const [auto, setAuto] = useState(true)
  const [hovering, setHovering] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { threshold: 0.3 })
  const reduced = usePrefersReducedMotion()
  const running = auto && !reduced
  const paused = hovering || !inView

  const goNext = () => {
    const index = MOMENTS.findIndex((moment) => moment.id === active)
    setActive(MOMENTS[(index + 1) % MOMENTS.length].id)
  }

  return (
    <section id="no-dia-a-dia" aria-labelledby="no-dia-a-dia-title" className="scroll-mt-24 py-20 sm:py-28">
      <Container>
        <Reveal className="max-w-2xl">
          <Eyebrow>No dia a dia</Eyebrow>
          <SectionTitle id="no-dia-a-dia-title" className="mt-5">
            Do seu lado da tela, <span className="text-muted-foreground">tudo fica mais leve.</span>
          </SectionTitle>
        </Reveal>

        {/* Computador: lista à esquerda e a tela correspondente à direita. */}
        <div ref={ref} className="mt-16 hidden lg:block">
          <Tabs
            orientation="vertical"
            value={active}
            onValueChange={(value) => {
              setActive(String(value))
              setAuto(false)
            }}
            className="grid grid-cols-[1fr_1.05fr] items-start gap-16"
          >
            <TabsList
              variant="line"
              aria-label="O que a maanu faz por você"
              className="h-auto w-full flex-col items-stretch gap-0 rounded-none border-b border-border bg-transparent p-0"
              onMouseEnter={() => setHovering(true)}
              onMouseLeave={() => setHovering(false)}
            >
              {MOMENTS.map((moment, index) => {
                const isActive = moment.id === active
                return (
                  <TabsTrigger
                    key={moment.id}
                    value={moment.id}
                    className="group/row relative h-auto w-full flex-none flex-col items-stretch justify-start gap-0 rounded-none border-0 border-t border-border px-0 py-7 text-left text-base font-normal whitespace-normal text-foreground after:hidden hover:text-foreground focus-visible:ring-offset-4 data-active:bg-transparent"
                  >
                    {isActive ? (
                      <span
                        aria-hidden
                        key={running ? `run-${moment.id}` : `still-${moment.id}`}
                        onAnimationEnd={running ? goNext : undefined}
                        style={{
                          animation: running ? `site-grow ${AUTO_MS}ms linear forwards` : undefined,
                          animationPlayState: paused ? "paused" : "running",
                        }}
                        className="absolute inset-x-0 -top-px h-0.5 origin-left bg-brand-teal"
                      />
                    ) : null}
                    <Label
                      moment={moment}
                      index={index}
                      className={cn("transition-colors", isActive ? "text-brand-teal-ink" : "text-muted-foreground")}
                    />
                    <span
                      className={cn(
                        "mt-2.5 block font-display text-[1.7rem] leading-tight font-semibold tracking-tight transition-colors",
                        isActive ? "text-foreground" : "text-foreground/55 group-hover/row:text-foreground/75"
                      )}
                    >
                      {moment.title}
                    </span>
                    <span className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-500 ease-out group-data-active/row:grid-rows-[1fr]">
                      <span className="overflow-hidden">
                        <span className="block max-w-md pt-3 text-base leading-relaxed text-muted-foreground">
                          {moment.text}
                        </span>
                      </span>
                    </span>
                  </TabsTrigger>
                )
              })}
            </TabsList>

            <div className="sticky top-28">
              <div className="relative flex min-h-[31rem] items-center rounded-[2rem] bg-brand-offwhite p-8 ring-1 ring-border/70">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-[2rem] bg-[radial-gradient(color-mix(in_oklch,var(--brand-slate)_35%,transparent)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_80%)]"
                />
                {MOMENTS.map((moment) => (
                  <TabsContent key={moment.id} value={moment.id} className="relative w-full">
                    <div className="site-enter">
                      <PreviewWindow screen={moment.screen}>{moment.preview}</PreviewWindow>
                    </div>
                  </TabsContent>
                ))}
              </div>
              <p className="mt-3 text-center text-xs text-muted-foreground">Telas ilustrativas, com dados de exemplo.</p>
            </div>
          </Tabs>
        </div>

        {/* Celular: um item depois do outro, cada um com a sua tela. */}
        <ol className="mt-12 flex flex-col lg:hidden">
          {MOMENTS.map((moment, index) => (
            <li key={moment.id} className="border-t border-border py-10 last:border-b">
              <Reveal>
                <Label moment={moment} index={index} className="text-brand-teal-ink" />
                <h3 className="mt-2.5 font-display text-2xl leading-tight font-semibold tracking-tight">{moment.title}</h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">{moment.text}</p>
                <PreviewWindow screen={moment.screen} className="mt-6">
                  {moment.preview}
                </PreviewWindow>
              </Reveal>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  )
}
