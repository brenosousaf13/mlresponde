import { CheckCircle2Icon, ChevronRightIcon, LoaderIcon, PackageOpenIcon } from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { formatMoney } from "@/lib/customers/presentation"
import { RETURN_FILTERS, type ReturnFilter, type ReturnListRow } from "@/lib/dal/recovery"
import { formatDateTime, formatNumber, timeAgo } from "@/lib/format"
import { MODE_LABELS, PHASE_BADGE, deadlineLabel, returnHref } from "@/lib/recovery/presentation"
import { PHASE_LABELS, SHIPMENT_STATUS_LABELS, STATUS_MONEY_LABELS, destinationLabel } from "@/lib/recovery/returns"
import { DUE_TEXT, dueState } from "@/lib/reputation/presentation"
import { cn } from "@/lib/utils"

const EMPTY: Record<ReturnFilter, { title: string; description: string }> = {
  revisar: {
    title: "Nenhuma devolução esperando você",
    description:
      "Quando uma devolução chegar até você ou o armazém do ML devolver o dinheiro ao comprador e der para contestar, ela aparece aqui e avisamos você.",
  },
  andamento: { title: "Nenhuma devolução em andamento", description: "Devoluções a caminho ou no armazém do ML aparecem aqui." },
  encerradas: { title: "Nenhuma devolução encerrada", description: "As devoluções encerradas dos últimos 90 dias aparecem aqui." },
}

/** Uma devolução na lista (também usada na Visão geral). */
export function ReturnRowItem({ row, accountId, now }: { row: ReturnListRow; accountId: string; now: Date }) {
  const due = dueState(row.deadline_at, now)
  const meta = [
    row.phase === "needs_review" ? null : destinationLabel(row.destination),
    row.shipment_status && row.phase !== "closed" ? SHIPMENT_STATUS_LABELS[row.shipment_status] : null,
    row.status_money ? STATUS_MONEY_LABELS[row.status_money] : null,
    row.is_cart ? "Vários pedidos" : null,
    "#" + row.claim_id,
  ].filter(Boolean)
  return (
    <li>
      <Link
        href={returnHref(row.id, accountId)}
        className="group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <p className="min-w-0 truncate text-sm font-medium" title={row.item_title ?? undefined}>
              {row.item_title || "Devolução " + row.claim_id}
            </p>
            {row.phase === "needs_review" && row.deadline_at ? (
              <span className={cn("shrink-0 text-xs font-medium tabular-nums", DUE_TEXT[due])}>
                {deadlineLabel(row.mode, due === "overdue")}
                {formatDateTime(row.deadline_at)} ({timeAgo(row.deadline_at, now)}){row.mode === "appeal" ? " · estimado" : ""}
              </span>
            ) : row.claim_created_at ? (
              <span className="shrink-0 text-xs text-muted-foreground">Aberta {timeAgo(row.claim_created_at, now)}</span>
            ) : null}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {meta.join(" · ")}
            {row.amount ? " · " + formatMoney(row.amount, row.currency_id) : ""}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className={cn("border-transparent", PHASE_BADGE[row.phase])}>
              {row.phase === "needs_review" && row.mode ? MODE_LABELS[row.mode] : PHASE_LABELS[row.phase]}
            </Badge>
            {row.review_kind ? (
              <Badge variant="outline">{row.review_kind === "fail" ? "Você relatou problema" : "Você confirmou que chegou certinho"}</Badge>
            ) : null}
            {row.recovered_at ? (
              <Badge variant="outline" className="border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                Recuperado {row.recovered_amount ? formatMoney(row.recovered_amount, row.currency_id) : ""}
              </Badge>
            ) : null}
          </div>
        </div>
        <ChevronRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  )
}

/** Aba Devoluções: filtros e lista. */
export function ReturnsList({
  rows,
  counts,
  filter,
  accountId,
  loading,
  now,
  hrefFor,
}: {
  rows: ReturnListRow[]
  counts: Record<ReturnFilter, number>
  filter: ReturnFilter
  accountId: string
  loading: boolean
  now: Date
  hrefFor: (filter: ReturnFilter) => string
}) {
  return (
    <Card className="gap-0">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <PackageOpenIcon className="size-4" />
          Devoluções
        </CardTitle>
        <CardDescription>
          Quando a devolução chega, você revisa pelo celular em 1 minuto; quando o armazém do ML devolve o dinheiro ao comprador,
          você contesta por aqui. Nada é enviado ao Mercado Livre sem o seu clique.
        </CardDescription>
        <nav aria-label="Filtrar devoluções" className="mt-3 flex flex-wrap gap-2">
          {(Object.keys(RETURN_FILTERS) as ReturnFilter[]).map((key) => {
            const isActive = key === filter
            const count = counts[key]
            return (
              <Link
                key={key}
                href={hrefFor(key)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
                  isActive ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"
                )}
              >
                {RETURN_FILTERS[key].label}
                <span
                  className={cn(
                    "min-w-5 rounded-full px-1.5 text-center text-xs leading-5 tabular-nums",
                    isActive
                      ? "bg-primary-foreground/20"
                      : key === "revisar" && count > 0
                        ? "bg-red-500/10 text-red-700 dark:text-red-300"
                        : "bg-muted text-muted-foreground"
                  )}
                >
                  {formatNumber(count)}
                </span>
              </Link>
            )
          })}
        </nav>
      </CardHeader>
      <CardContent className="px-0">
        {rows.length === 0 ? (
          <Empty className="mx-4 border border-dashed py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">{loading ? <LoaderIcon /> : <CheckCircle2Icon />}</EmptyMedia>
              <EmptyTitle>{loading ? "Lendo as devoluções" : EMPTY[filter].title}</EmptyTitle>
              <EmptyDescription>
                {loading
                  ? "A maanu está lendo as devoluções desta conta no Mercado Livre. Leva alguns minutos na primeira vez."
                  : EMPTY[filter].description}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y border-t">
            {rows.map((row) => (
              <ReturnRowItem key={row.id} row={row} accountId={accountId} now={now} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
