import { AlertTriangleIcon, ArrowRightIcon, BadgeCheckIcon, ClockIcon, HandCoinsIcon, PackageOpenIcon } from "lucide-react"
import Link from "next/link"

import { ReturnRowItem } from "@/components/recuperador/returns-list"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { formatMoney } from "@/lib/customers/presentation"
import type { RecoveryOverview } from "@/lib/dal/recovery"
import { formatDateTime, formatNumber, pluralize, timeAgo } from "@/lib/format"

/** Os 3 números do Recuperador: o que espera o dono, o dinheiro sob suspeita e o que a maanu já recuperou. */
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
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className={waiting.count ? "border-red-500/40" : undefined}>
        <CardHeader>
          <CardDescription className="flex items-center gap-2">
            <ClockIcon className="size-4" />
            Aguardando você
          </CardDescription>
          <CardTitle className="text-3xl tabular-nums">{formatNumber(waiting.count)}</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 text-sm text-muted-foreground">
          {waiting.count
            ? pluralize(waiting.count, "devolução chegou", "devoluções chegaram") +
              " e " +
              (waiting.count === 1 ? "espera" : "esperam") +
              " a sua revisão" +
              (waiting.nextDeadline ? ". A próxima vence " + timeAgo(waiting.nextDeadline, now) + "." : ".")
            : "Nenhuma devolução esperando a sua revisão agora."}
        </CardContent>
        <CardFooter>
          <Link href={hrefReturns} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            Ver devoluções <ArrowRightIcon className="size-3.5" />
          </Link>
        </CardFooter>
      </Card>

      <Card className={overview.suspect.count ? "border-amber-500/40" : undefined}>
        <CardHeader>
          <CardDescription className="flex items-center gap-2">
            <AlertTriangleIcon className="size-4" />
            Dinheiro sob suspeita
          </CardDescription>
          <CardTitle className="text-3xl tabular-nums">{formatMoney(overview.suspect.amount)}</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 text-sm text-muted-foreground">
          {overview.suspect.count
            ? pluralize(overview.suspect.count, "devolução", "devoluções") +
              " em que o armazém do ML marcou o produto sem condição de venda e o dinheiro foi para o comprador. Dá para pedir revisão."
            : "Nenhuma devolução suspeita nos últimos 90 dias (até onde o Raio-X já leu)."}
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
              " pela maanu em que o Mercado Livre ressarciu você."
            : "Só conta o que o Mercado Livre confirmou: revisões enviadas pela maanu que terminaram a seu favor."}
        </CardContent>
        <CardFooter className="text-xs text-muted-foreground">
          <BadgeCheckIcon className="mr-1 size-3.5" />
          Confirmado pelo Mercado Livre
        </CardFooter>
      </Card>
    </div>
  )
}

/** "Revise agora": as devoluções que chegaram e esperam o dono, do prazo mais curto para o mais longo. */
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
            ? "A próxima revisão vence em " + formatDateTime(overview.waiting.nextDeadline) + "."
            : "Devoluções que chegaram e esperam você dizer ao Mercado Livre como o produto voltou."}
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
                  : "Quando uma devolução chegar, avisamos no app e por e-mail para você revisar pelo celular."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  )
}
