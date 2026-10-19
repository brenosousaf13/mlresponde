import { CheckCircle2Icon, ChevronRightIcon, LoaderIcon, MessageSquareWarningIcon, SparklesIcon } from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { formatMoney } from "@/lib/customers/presentation"
import { CLAIM_FILTERS, type ClaimFilter, type ClaimListRow } from "@/lib/dal/reputation-claims"
import { formatDateTime, formatNumber, timeAgo } from "@/lib/format"
import { BEST_ACTION_LABELS, RISK_LABELS } from "@/lib/reputation/claim-ai"
import { CLAIM_STAGE_LABELS, claimTypeLabel, reasonGroup } from "@/lib/reputation/claim-details"
import { CLAIM_RISK_BADGE, DUE_TEXT, affectsInfo, claimHref, dueState } from "@/lib/reputation/presentation"
import { cn } from "@/lib/utils"

const EMPTY: Record<ClaimFilter, { title: string; description: string }> = {
  precisam: { title: "Nada esperando você", description: "Nenhuma reclamação aberta precisa de uma ação sua agora." },
  mediacao: { title: "Nenhuma mediação", description: "Nenhuma reclamação aberta está com o mediador do Mercado Livre." },
  abertas: { title: "Nenhuma reclamação aberta", description: "Quando um comprador abrir uma reclamação, ela aparece aqui." },
  encerradas: { title: "Nenhuma reclamação encerrada", description: "As reclamações encerradas dos últimos meses aparecem aqui." },
}

/** Aba Reclamações: filtros e lista, do prazo mais curto para o mais longo. */
export function ClaimsList({
  rows,
  counts,
  filter,
  accountId,
  searching,
  now,
  hrefFor,
}: {
  rows: ClaimListRow[]
  counts: Record<Exclude<ClaimFilter, "encerradas">, number>
  filter: ClaimFilter
  accountId: string
  searching: boolean
  now: Date
  hrefFor: (filter: ClaimFilter) => string
}) {
  return (
    <Card className="gap-0">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <MessageSquareWarningIcon className="size-4" />
          Reclamações
        </CardTitle>
        <CardDescription>
          A IA lê cada reclamação e prepara a melhor saída e a resposta. Nada é enviado sem o seu clique.
        </CardDescription>
        <nav aria-label="Filtrar reclamações" className="mt-3 flex flex-wrap gap-2">
          {(Object.keys(CLAIM_FILTERS) as ClaimFilter[]).map((key) => {
            const isActive = key === filter
            const count = key === "encerradas" ? null : counts[key]
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
                {CLAIM_FILTERS[key].label}
                {count !== null ? (
                  <span
                    className={cn(
                      "min-w-5 rounded-full px-1.5 text-center text-xs leading-5 tabular-nums",
                      isActive
                        ? "bg-primary-foreground/20"
                        : key === "precisam" && count > 0
                          ? "bg-red-500/10 text-red-700 dark:text-red-300"
                          : "bg-muted text-muted-foreground"
                    )}
                  >
                    {formatNumber(count)}
                  </span>
                ) : null}
              </Link>
            )
          })}
        </nav>
      </CardHeader>
      <CardContent className="px-0">
        {rows.length === 0 ? (
          <Empty className="mx-4 border border-dashed py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">{searching ? <LoaderIcon /> : <CheckCircle2Icon />}</EmptyMedia>
              <EmptyTitle>{searching ? "Buscando as reclamações" : EMPTY[filter].title}</EmptyTitle>
              <EmptyDescription>
                {searching
                  ? "A maanu está lendo as reclamações desta conta no Mercado Livre. Leva alguns minutos na primeira vez."
                  : EMPTY[filter].description}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y border-t">
            {rows.map((row) => (
              <ClaimRowItem key={row.id} row={row} accountId={accountId} now={now} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function ClaimRowItem({ row, accountId, now }: { row: ClaimListRow; accountId: string; now: Date }) {
  const open = row.status === "opened"
  const item = row.orderSummary?.items[0]?.title
  const affects = affectsInfo(row.affects_reputation)
  const due = dueState(row.next_due_at, now)
  const analyzing = row.ai_status === "pending" || row.ai_status === "processing"
  const suggestion = row.analysis ? BEST_ACTION_LABELS[row.analysis.bestAction] : ""
  const meta = [
    claimTypeLabel(row.type),
    open && row.stage ? CLAIM_STAGE_LABELS[row.stage] : null,
    reasonGroup(row.reason_id),
    row.buyer_nickname,
    "#" + row.claim_id,
  ].filter(Boolean)
  return (
    <li>
      <Link
        href={claimHref(row.id, accountId)}
        className="group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <p className="min-w-0 truncate text-sm font-medium" title={item ?? undefined}>
              {item || claimTypeLabel(row.type)}
            </p>
            {open && row.next_due_at ? (
              <span className={cn("shrink-0 text-xs font-medium tabular-nums", DUE_TEXT[due])}>
                {due === "overdue" ? "Prazo venceu " : "Agir até "}
                {formatDateTime(row.next_due_at)} ({timeAgo(row.next_due_at, now)})
              </span>
            ) : !open && row.ml_updated_at ? (
              <span className="shrink-0 text-xs text-muted-foreground">Encerrada {timeAgo(row.ml_updated_at, now)}</span>
            ) : null}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {meta.join(" · ")}
            {row.orderSummary?.total_amount ? " · " + formatMoney(row.orderSummary.total_amount, row.orderSummary.currency_id) : ""}
          </p>
          {row.analysis?.summary ? (
            <p className="line-clamp-2 text-sm text-muted-foreground">
              <SparklesIcon className="mr-1 inline size-3.5 align-[-2px] text-brand-teal-ink" />
              {row.analysis.summary}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {open && row.needsYou ? <Badge>Precisa de você</Badge> : null}
            <Badge variant="outline" className={cn("border-transparent", affects.className)}>
              {affects.label}
            </Badge>
            {row.analysis && open ? (
              <>
                <Badge variant="outline" className={cn("border-transparent", CLAIM_RISK_BADGE[row.analysis.risk])}>
                  {RISK_LABELS[row.analysis.risk]}
                </Badge>
                <Badge variant="outline">
                  <SparklesIcon data-icon="inline-start" />
                  IA sugere: {suggestion.charAt(0).toLowerCase() + suggestion.slice(1)}
                </Badge>
              </>
            ) : analyzing && open ? (
              <Badge variant="outline">
                <LoaderIcon data-icon="inline-start" className="animate-spin" />
                IA analisando
              </Badge>
            ) : null}
          </div>
        </div>
        <ChevronRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  )
}
