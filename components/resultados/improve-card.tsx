import { ArrowRightIcon, CircleCheckIcon, CirclePauseIcon, FileQuestionIcon, ScaleIcon, type LucideIcon } from "lucide-react"
import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { formatNumber } from "@/lib/results/format"
import { share, type Causes } from "@/lib/results/metrics"
import { cn } from "@/lib/utils"

const CAUSES: { key: keyof Causes; icon: LucideIcon; label: string; hint: string; action: string; href: string }[] = [
  {
    key: "noInfo",
    icon: FileQuestionIcon,
    label: "A IA não tinha a informação",
    hint: "A resposta não estava no anúncio nem no que você contou sobre a loja.",
    action: "Completar Sobre a loja",
    href: "/assistente?aba=conhecimento",
  },
  {
    key: "unsure",
    icon: ScaleIcon,
    label: "A IA ficou em dúvida",
    hint: "Ela tinha um rascunho, mas a certeza ficou abaixo do nível que você escolheu.",
    action: "Ensinar respostas",
    href: "/assistente?aba=ensinadas",
  },
  {
    key: "aiOff",
    icon: CirclePauseIcon,
    label: "A IA não chegou a analisar",
    hint: "Estava pausada, o anúncio está bloqueado ou a pergunta foi respondida antes no Mercado Livre.",
    action: "Ver o Assistente",
    href: "/assistente",
  },
]

/** Quanto a IA já resolve sozinha e o que fazer para ela resolver mais. */
export function ImproveCard({ causes, aiAnswers, total }: { causes: Causes; aiAnswers: number; total: number }) {
  const rate = share(aiAnswers, total)
  const handled = causes.noInfo + causes.unsure + causes.aiOff

  return (
    <Card>
      <CardHeader>
        <CardTitle>Onde a IA pode ajudar mais</CardTitle>
        <CardDescription>Por que algumas perguntas ficaram com você, e o que fazer para a IA resolver sozinha.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2 rounded-lg bg-muted/60 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium">Automação no período</span>
            <span className="text-2xl font-semibold tabular-nums">{rate}%</span>
          </div>
          <Progress value={rate} aria-label={`${rate}% das perguntas respondidas pela IA`} />
          <p className="text-xs text-muted-foreground">
            {formatNumber(aiAnswers)} de {formatNumber(total)} perguntas respondidas pela IA sem você.
          </p>
        </div>
        {handled === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CircleCheckIcon className="size-4 text-primary" />
            {total > 0 ? "Nenhuma pergunta precisou de você no período." : "Ainda não há perguntas no período."}
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {CAUSES.map((cause) => {
              const count = causes[cause.key]
              return (
                <li key={cause.key} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <cause.icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-medium">{cause.label}</p>
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {formatNumber(count)} · {share(count, handled)}%
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{cause.hint}</p>
                    {count > 0 ? (
                      <Link
                        href={cause.href}
                        className={cn(buttonVariants({ variant: "link", size: "sm" }), "h-auto px-0 pt-1")}
                      >
                        {cause.action}
                        <ArrowRightIcon data-icon="inline-end" />
                      </Link>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}