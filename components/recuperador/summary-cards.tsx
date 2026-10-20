import { AlertTriangleIcon, ArrowRightIcon, BadgeCheckIcon, ClockIcon, HandCoinsIcon, PackageOpenIcon } from "lucide-react"
import Link from "next/link"

import { ReturnRowItem } from "@/components/recuperador/returns-list"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { formatMoney } from "@/lib/customers/presentation"
import type { RecoveryOverview } from "@/lib/dal/recovery"
import { formatDateTime, formatNumber, pluralize, timeAgo } from "@/lib/format"

/**
 * Os 3 números do Recuperador, sem contar o mesmo dinheiro duas vezes: o que dá para recuperar agora (revisões e
 * contestações liberadas), o que ficou para trás nos últimos 90 dias e o que a maanu já recuperou (confirmado pelo ML).
 */
export function SummaryCards({
  overview,
  hrefReturns,
  hrefXray,
  now,
}: {
  overview: RecoveryOverview
  hrefReturns: string
  hrefXray: string
  now: Date
}) {
  const waiting = overview.waiting
  const arrivals = waiting.count - waiting.appeals
  const parts = [
    arrivals ? pluralize(arrivals, "devolução chegou e espera", "devoluções chegaram e esperam") + " a sua revisão" : null,
    waiting.appeals
      ? pluralize(waiting.appeals, "revisão do armazém do ML dá", "revisões do armazém do ML dão") + " para contestar"
      : null,
  ].filter(Boolean)
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className={waiting.count ? "border-red-500/40" : undefined}>
        <CardHeader>
          <CardDescription className="flex items-center gap-2">
            <ClockIcon className="size-4" />
            Para recuperar agora
          </CardDescription>
          <CardTitle className="text-3xl tabular-nums">
            {waiting.amount > 0 ? formatMoney(waiting.amount) : formatNumber(waiting.count)}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 text-sm text-muted-foreground">
          {waiting.count
            ? parts.join(" e ") +
              "." +
              (waiting.withoutAmount ? " " + pluralize(waiting.withoutAmount, "venda ainda sem valor lido", "vendas ainda sem valor lido") + "." : "") +
              (waiting.nextDeadline ? " O próximo prazo vence " + timeAgo(waiting.nextDeadline, now) + "." : "")
            : "Nenhuma devolução esperando a sua revisão ou contestação agora."}
        </CardContent>
        <CardFooter>
          <Link href={hrefReturns} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            {waiting.count ? "Revisar agora" : "Ver devoluções"} <ArrowRightIcon className="size-3.5" />
          </Link>
        </CardFooter>
      </Card>

      <Card className={overview.lost.count ? "border-amber-500/40" : undefined}>
        <CardHeader>
          <CardDescription className="flex items-center gap-2">
            <AlertTriangleIcon className="size-4" />
            Ficou para trás (90 dias)
          </CardDescription>
          <CardTitle className="text-3xl tabular-nums">{formatMoney(overview.lost.amount)}</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 text-sm text-muted-foreground">
          {overview.lost.count
            ? pluralize(overview.lost.count, "venda voltou", "vendas voltaram") +
              " sem condição de venda, o dinheiro ficou com o comprador e o Mercado Livre não aceita mais contestação. Daqui para frente a maanu avisa antes do prazo."
            : "Nada ficou para trás nos últimos 90 dias (até onde o Raio-X já leu)."}
          {overview.appealed.count
            ? " " + pluralize(overview.appealed.count, "contestação em análise", "contestações em análise") + " no ML (" + formatMoney(overview.appealed.amount) + ")."
            : ""}
        </CardContent>
        <CardFooter>
          <Link href={hrefXray} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            Abrir o Raio-X <ArrowRightIcon className="size-3.5" />
          </Link>
        </CardFooter>
      </Card>

      <Card className="border-emerald-500/40 bg-emerald-500/5">
        <CardHeader>
          <CardDescription className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
            <HandCoinsIcon className="size-4" />
            Recuperado pela maanu
          </CardDescription>
          <CardTitle className="text-3xl text-emerald-800 tabular-nums dark:text-emerald-300">
            {formatMoney(overview.recovered.amount)}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 text-sm text-muted-foreground">
          {overview.recovered.count
            ? pluralize(overview.recovered.count, "revisão enviada", "revisões enviadas") +
              " pela maanu em que o Mercado Livre deu razão a você."
            : "Só conta o que o Mercado Livre confirmou: revisões e contestações enviadas pela maanu que terminaram a seu favor."}
        </CardContent>
        <CardFooter className="text-xs text-muted-foreground">
          <BadgeCheckIcon className="mr-1 size-3.5" />
          Confirmado pelo Mercado Livre
        </CardFooter>
      </Card>
    </div>
  )
}

/** "Revise agora": devoluções que chegaram e contestações liberadas, do prazo mais curto para o mais longo. */
export function WaitingCard({ overview, accountId, loading, now }: { overview: RecoveryOverview; accountId: string; loading: boolean; now: Date }) {
  return (
    <Card className="gap-0">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <PackageOpenIcon className="size-4" />
          Revise agora
        </CardTitle>
        <CardDescription>
          {overview.waiting.nextDeadline
            ? "O próximo prazo vence em " + formatDateTime(overview.waiting.nextDeadline) + "."
            : "Devoluções que chegaram até você e revisões do armazém do ML que dá para contestar."}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {overview.waiting.rows.length ? (
          <ul className="divide-y border-t">
            {overview.waiting.rows.slice(0, 8).map((row) => (
              <ReturnRowItem key={row.id} row={row} accountId={accountId} now={now} />
            ))}
          </ul>
        ) : (
          <Empty className="mx-4 border border-dashed py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BadgeCheckIcon />
              </EmptyMedia>
              <EmptyTitle>{loading ? "Lendo as devoluções" : "Tudo em dia"}</EmptyTitle>
              <EmptyDescription>
                {loading
                  ? "A maanu está lendo as devoluções desta conta no Mercado Livre."
                  : "Quando uma devolução chegar ou o armazém do ML devolver o dinheiro ao comprador, avisamos no app e por e-mail."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  )
}
