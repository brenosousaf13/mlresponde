import { AlertTriangleIcon, ArrowRightIcon, BadgeCheckIcon, CircleDollarSignIcon, ClockIcon, HandCoinsIcon, PackageOpenIcon } from "lucide-react"
import Link from "next/link"

import { ReturnRowItem } from "@/components/recuperador/returns-list"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { formatMoney } from "@/lib/customers/presentation"
import type { RecoveryOverview } from "@/lib/dal/recovery"
import { formatDateTime, formatNumber, pluralize, timeAgo } from "@/lib/format"

/**
 * Os 3 cards do Recuperador, com buckets honestos:
 *  1. "Para revisar / contestar agora": soma das vendas contestáveis (actionableAmount), com breakdown retido vs reembolsado.
 *     NÃO apresenta actionableAmount como "dinheiro retido" — a maioria já foi devolvida ao comprador.
 *  2. "Ficou para trás": achados do Raio-X expirados (perdidos).
 *  3. "Recuperado pela maanu": só o que o ML confirmou.
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
  const parts = [
    waiting.arrivals ? pluralize(waiting.arrivals, "devolução chegou e espera", "devoluções chegaram e esperam") + " a sua revisão" : null,
    waiting.appeals
      ? pluralize(waiting.appeals, "revisão do armazém do ML dá", "revisões do armazém do ML dão") + " para contestar"
      : null,
  ].filter(Boolean)

  // Legenda honesta: deixa claro o que é retido vs o que já foi reembolsado ao comprador
  const retainedHint =
    waiting.retainedCount > 0
      ? pluralize(waiting.retainedCount, "ainda com dinheiro retido no MP", "ainda com dinheiro retido no MP") +
        " (" + formatMoney(waiting.retainedAmount) + ")"
      : null
  const refundedHint =
    waiting.refundedCount > 0
      ? pluralize(waiting.refundedCount, "já reembolsado ao comprador — contestação sobre produto", "já reembolsados ao comprador — contestação sobre produto") +
        " (" + formatMoney(waiting.refundedAmount) + ")"
      : null

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className={waiting.count ? "border-amber-500/40" : undefined}>
        <CardHeader>
          <CardDescription className="flex items-center gap-2">
            <ClockIcon className="size-4" />
            Para revisar / contestar agora
          </CardDescription>
          <CardTitle className="text-3xl tabular-nums">
            {waiting.count > 0 ? formatMoney(waiting.actionableAmount) : formatNumber(waiting.count)}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 space-y-1.5 text-sm text-muted-foreground">
          {waiting.count ? (
            <>
              <p>
                {parts.join(" e ") + "."}
                {waiting.withoutAmount
                  ? " " + pluralize(waiting.withoutAmount, "venda ainda sem valor lido", "vendas ainda sem valor lido") + "."
                  : ""}
                {waiting.nextDeadline ? " O próximo prazo vence " + timeAgo(waiting.nextDeadline, now) + "." : ""}
              </p>
              {/* breakdown honesto por status_money */}
              {retainedHint && (
                <p className="text-xs">
                  <span className="font-medium text-amber-700 dark:text-amber-400">? Retido no MP:</span>{" "}
                  {retainedHint}
                </p>
              )}
              {refundedHint && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium">? Já saiu:</span> {refundedHint}
                </p>
              )}
            </>
          ) : (
            "Nenhuma devolução esperando a sua revisão ou contestação agora."
          )}
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

/**
 * Card "Revise agora" com lista de devoluções.
 *
 * O título e a descrição deixam claro que "revisar / contestar" não é sinônimo de "dinheiro retido".
 * O breakdown retido vs já saído aparece no cabeçalho quando há itens.
 */
export function WaitingCard({ overview, accountId, loading, now }: { overview: RecoveryOverview; accountId: string; loading: boolean; now: Date }) {
  const waiting = overview.waiting
  const hasRetained = waiting.retainedCount > 0
  const hasRefunded = waiting.refundedCount > 0

  return (
    <Card className="gap-0">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <PackageOpenIcon className="size-4" />
          Revise / conteste agora
        </CardTitle>
        <CardDescription>
          {waiting.nextDeadline
            ? "O próximo prazo vence em " + formatDateTime(waiting.nextDeadline) + "."
            : "Devoluções que chegaram até você e revisões do armazém do ML que dá para contestar."}
        </CardDescription>

        {/* Breakdown retido vs reembolsado — só aparece quando há itens */}
        {waiting.count > 0 && (hasRetained || hasRefunded) && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {hasRetained && (
              <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
                <CircleDollarSignIcon className="size-3.5" />
                <span>
                  <strong>Retido no MP:</strong>{" "}
                  {formatMoney(waiting.retainedAmount)}{" "}
                  ({pluralize(waiting.retainedCount, "item", "itens")})
                </span>
              </span>
            )}
            {hasRefunded && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <AlertTriangleIcon className="size-3.5" />
                <span>
                  <strong>Já saiu (contestação sobre produto):</strong>{" "}
                  {formatMoney(waiting.refundedAmount)}{" "}
                  ({pluralize(waiting.refundedCount, "item", "itens")})
                </span>
              </span>
            )}
          </div>
        )}
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
