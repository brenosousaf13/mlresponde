import { ArrowUpRightIcon, BadgeCheckIcon, CircleDollarSignIcon, HandCoinsIcon, HistoryIcon, PackageCheckIcon } from "lucide-react"
import Link from "next/link"

import { ReturnRowItem } from "@/components/recuperador/returns-list"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import type { RecoveryOverview } from "@/lib/dal/recovery"
import type { RecoveryScreenData } from "@/lib/recovery/contract"
import { formatMoney } from "@/lib/customers/presentation"
import { formatNumber, pluralize } from "@/lib/format"

function deadlineLabel(value: string | null, estimated: boolean) {
  if (!value) return "Sem prazo informado"
  const date = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value))
  return `próximo prazo ${date}${estimated ? " · estimado" : ""}`
}

/** Os dois únicos cards de resumo da visão simplificada do Recuperador. */
type SummaryCardsProps =
  | { data: RecoveryScreenData; hrefReturns: string }
  | { overview: RecoveryOverview; hrefReturns: string; hrefXray?: string; now?: Date }

export function SummaryCards(props: SummaryCardsProps) {
  const recover = "data" in props ? props.data.groups.recover : props.overview.groups.recover
  const recovered = "data" in props ? props.data.recovered : props.overview.recovered

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
      <Card className="overflow-hidden border-brand-teal/35 bg-[linear-gradient(135deg,color-mix(in_oklch,var(--brand-sage),white_45%),var(--card)_66%)] shadow-sm">
        <CardHeader className="gap-3 pb-3">
          <CardDescription className="flex items-center gap-2 font-medium text-brand-teal-ink">
            <HandCoinsIcon className="size-4" />
            Dá pra recuperar dinheiro
          </CardDescription>
          <CardTitle className="flex flex-wrap items-end gap-x-3 gap-y-1 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
            {formatMoney(recover.amount)}
            <span className="pb-1 text-sm font-medium tracking-normal text-muted-foreground">
              {pluralize(recover.count, "devolução", "devoluções")}
            </span>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {recover.count ? deadlineLabel(recover.nextDeadlineAt, recover.nextDeadlineEstimated) : "Nada pra contestar agora"}
          </p>
        </CardHeader>
        <CardFooter className="border-t border-brand-teal/15 bg-white/40 pt-4 dark:bg-black/5">
          <Link
            href={props.hrefReturns}
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-auto"
          >
            Revisar agora
            <ArrowUpRightIcon className="size-4" />
          </Link>
        </CardFooter>
      </Card>

      <Card className="border-brand-mint/60 bg-brand-mint/15 shadow-none">
        <CardHeader className="gap-3 pb-3">
          <CardDescription className="flex items-center gap-2 font-medium text-brand-teal-ink">
            <BadgeCheckIcon className="size-4" />
            Recuperado pela maanu
          </CardDescription>
          <CardTitle className="text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">{formatMoney(recovered.amount)}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {recovered.count
              ? pluralize(recovered.count, "devolução recuperada", "devoluções recuperadas")
              : "O total aparece aqui quando o Mercado Livre confirmar a seu favor."}
          </p>
        </CardHeader>
        <CardContent className="mt-auto pt-0 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-brand-teal" aria-hidden="true" />
            Confirmado pelo Mercado Livre
          </span>
        </CardContent>
      </Card>
    </div>
  )
}

/** Compatibilidade visual da tela de impressão legada; a visão do app usa a fila nova. */
export function WaitingCard({ overview, accountId, loading, now }: { overview: RecoveryOverview; accountId: string; loading: boolean; now: Date }) {
  return (
    <Card className="gap-0">
      <CardHeader>
        <CardTitle>Revise agora</CardTitle>
        <CardDescription>{overview.waiting.nextDeadline ? `Próximo prazo: ${overview.waiting.nextDeadline}` : "Devoluções que precisam da sua revisão."}</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {overview.waiting.rows.length ? (
          <ul className="divide-y border-t">
            {overview.waiting.rows.slice(0, 8).map((row) => <ReturnRowItem key={row.id} row={row} accountId={accountId} now={now} />)}
          </ul>
        ) : (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">{loading ? "Lendo as devoluções" : "Tudo em dia"}</p>
        )}
      </CardContent>
    </Card>
  )
}

const STEPS = [
  ["A maanu avisa", "Quando uma devolução libera uma ação, ela aparece com o prazo."],
  ["Você confere", "Abra o caso, confira o produto e escolha o que faz sentido."],
  ["Você envia", "Nada é enviado ao Mercado Livre sem o seu clique."],
] as const

/** Informações secundárias no fim da tela, sempre recolhidas. */
export function RecoveryDetails({ overview, hrefXray, hasFirstSubmission }: { overview: RecoveryOverview; hrefXray: string; hasFirstSubmission: boolean }) {
  return (
    <div className="space-y-3">
      <Link href={hrefXray} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
        <HistoryIcon className="size-4" />
        Ficou para trás? Veja no Raio-X
        <ArrowUpRightIcon className="size-3.5" />
      </Link>

      <div className="rounded-xl bg-card px-4 ring-1 ring-foreground/10 sm:px-5">
        <Accordion>
          <AccordionItem value="retido">
            <AccordionTrigger className="py-4 hover:no-underline">
              <span className="flex items-center gap-3">
                <CircleDollarSignIcon className="size-4 text-amber-600" />
                <span>
                  <span className="block font-medium">Retido no Mercado Pago</span>
                  <span className="block text-xs font-normal text-muted-foreground">{formatMoney(overview.money.retainedTotal)} em devoluções em andamento</span>
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-4 pl-7 text-sm text-muted-foreground">
              Esse valor ainda está no Mercado Pago e pode mudar conforme cada devolução avança.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="saiu">
            <AccordionTrigger className="py-4 hover:no-underline">
              <span className="flex items-center gap-3">
                <PackageCheckIcon className="size-4 text-muted-foreground" />
                <span>
                  <span className="block font-medium">Já saiu</span>
                  <span className="block text-xs font-normal text-muted-foreground">{formatMoney(overview.waiting.refundedAmount)} já foi para o comprador</span>
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-4 pl-7 text-sm text-muted-foreground">
              Mesmo quando o dinheiro já saiu, ainda pode existir uma contestação sobre o produto. Confira os casos na fila.
            </AccordionContent>
          </AccordionItem>

          {!hasFirstSubmission ? (
            <AccordionItem value="como-funciona">
              <AccordionTrigger className="py-4 hover:no-underline">
                <span className="flex items-center gap-3">
                  <BadgeCheckIcon className="size-4 text-brand-teal-ink" />
                  <span>
                    <span className="block font-medium">Como funciona</span>
                    <span className="block text-xs font-normal text-muted-foreground">Você decide cada envio</span>
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-4 pl-7">
                <ol className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                  {STEPS.map(([title, body], index) => (
                    <li key={title} className="flex gap-2.5">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>
                      <span>
                        <strong className="font-medium text-foreground">{title}.</strong> {body}
                      </span>
                    </li>
                  ))}
                </ol>
              </AccordionContent>
            </AccordionItem>
          ) : null}
        </Accordion>
      </div>

      {overview.lost.count ? (
        <p className="text-xs text-muted-foreground">
          {formatNumber(overview.lost.count)} {overview.lost.count === 1 ? "devolução ficou" : "devoluções ficaram"} para trás nos últimos 90 dias.
        </p>
      ) : null}
    </div>
  )
}
