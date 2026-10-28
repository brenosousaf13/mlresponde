import { ArrowRightIcon, ExternalLinkIcon, HourglassIcon, ScanSearchIcon, ShieldCheckIcon } from "lucide-react"
import Link from "next/link"

import { CopyTextButton } from "@/components/recuperador/recovery-buttons"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Progress } from "@/components/ui/progress"
import { formatMoney } from "@/lib/customers/presentation"
import type { FindingRow, RecoveryOverview } from "@/lib/dal/recovery"
import type { LeftBehindSummary } from "@/lib/recovery/left-behind"
import { formatDate, formatNumber } from "@/lib/format"
import { DESTINATION_LABELS, returnHref } from "@/lib/recovery/presentation"
import { APPEAL_STRENGTH_LABELS, CONDITION_LABELS, WAREHOUSE_REASON_LABELS, findingRequestText } from "@/lib/recovery/returns"
import { mlSaleUrl } from "@/lib/reputation/presentation"
import { cn } from "@/lib/utils"

/** Progresso da varredura de 90 dias. */
export function XrayProgress({ overview }: { overview: RecoveryOverview }) {
  const scan = overview.scan
  const waiting = !overview.claimsReady || !scan || scan.status === "waiting"
  const done = scan?.status === "done"
  const percent = scan && scan.returns_total ? Math.round((scan.returns_done / scan.returns_total) * 100) : done ? 100 : 0
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScanSearchIcon className="size-4" />
          Raio-X dos últimos 90 dias
        </CardTitle>
        <CardDescription>
          {waiting
            ? "Esperando o Escudo de Reputação terminar de ler as reclamações desta conta. Começa sozinho em alguns minutos."
            : done
              ? "Pronto" + (scan?.completed_at ? " desde " + formatDate(scan.completed_at) : "") + ". Devoluções novas entram sozinhas."
              : "Lendo cada devolução no Mercado Livre, sem pressa para não travar a sua conta."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {waiting ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <HourglassIcon className="size-4" /> Aguardando
          </p>
        ) : (
          <>
            <Progress value={percent} />
            <p className="text-sm text-muted-foreground tabular-nums">
              {formatNumber(scan?.returns_done ?? 0)} de {formatNumber(scan?.returns_total ?? 0)} devoluções lidas
            </p>
          </>
        )}
        <p className="text-xs text-muted-foreground">
          O Raio-X das cobranças (frete fora do padrão e cobrança em duplicidade) chega na próxima etapa.
        </p>
      </CardContent>
    </Card>
  )
}

function evidenceLine(finding: FindingRow) {
  const evidence = finding.evidence
  const reason = typeof evidence.reason_id === "string" ? WAREHOUSE_REASON_LABELS[evidence.reason_id] : null
  const parts = [
    typeof evidence.product_condition === "string"
      ? "Armazém do ML: " + (CONDITION_LABELS[evidence.product_condition] ?? evidence.product_condition) + (reason ? " (" + reason + ")" : "")
      : null,
    typeof evidence.product_destination === "string" && DESTINATION_LABELS[evidence.product_destination]
      ? "o produto " + DESTINATION_LABELS[evidence.product_destination]
      : null,
    evidence.claim_id ? "#" + String(evidence.claim_id) : null,
  ].filter(Boolean)
  return parts.join(" · ")
}

function titleOf(finding: FindingRow) {
  return typeof finding.evidence.item_title === "string" && finding.evidence.item_title ? finding.evidence.item_title : "Devolução"
}

function money(finding: FindingRow) {
  return finding.amount ? formatMoney(finding.amount, finding.currency_id) : "valor não lido"
}

function totalOf(findings: readonly FindingRow[]) {
  return Math.round(findings.reduce((total, finding) => total + (finding.amount ?? 0), 0) * 100) / 100
}

function strengthOf(finding: FindingRow) {
  const key = finding.confidence === "high" || finding.confidence === "low" ? finding.confidence : "medium"
  return { key, ...APPEAL_STRENGTH_LABELS[key] }
}

const STRENGTH_BADGE: Record<string, string> = {
  high: "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  medium: "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-300",
  low: "",
}

/**
 * Achados do Raio-X, separados pelo que dá para fazer: contestar agora (pela maanu), em análise no ML, o que ficou para
 * trás (texto pronto para a Ajuda do ML) e os ressarcimentos já recebidos (referência).
 */
export function Findings({ findings, accountId, leftBehind }: { findings: FindingRow[]; accountId: string; leftBehind?: LeftBehindSummary }) {
  const contestable = findings.filter((finding) => finding.outcome === "contestable")
  const appealed = findings.filter((finding) => finding.outcome === "appealed")
  const lost = findings.filter((finding) => finding.outcome === "expired")
  const appealLost = findings.filter((finding) => finding.outcome === "appeal_lost")
  const reimbursed = findings.filter((finding) => finding.outcome === "reimbursed")
  const leftBehindTotal = leftBehind?.total ?? { count: lost.length, amount: totalOf(lost), estimated: false }
  const leftBehindDetails = leftBehind
  const leftBehindReasons = leftBehind
    ? ([
        ["sem_condicao_venda", "sem condição de venda"],
        ["contestacao_full_nao_feita", "contestação Full não feita"],
        ["prazo_endereco", "prazo no endereço vencido"],
      ] as const).filter(([reason]) => leftBehind.byReason[reason].count > 0)
    : []
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
        <Card className="gap-0">
          <CardHeader className="pb-4">
            <CardTitle className="flex flex-wrap items-baseline justify-between gap-2">
              <span>Dá para contestar agora</span>
              {contestable.length ? <span className="text-base tabular-nums">{formatMoney(totalOf(contestable))}</span> : null}
            </CardTitle>
            <CardDescription>
              O armazém do Mercado Livre marcou o produto como sem condição de venda e devolveu o dinheiro ao comprador. Se o
              produto saiu em perfeito estado, conteste pela maanu com o motivo, o relato e as fotos. A decisão é do ML.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {contestable.length ? (
              <ul className="divide-y border-t">
                {contestable.map((finding) => {
                  const strength = strengthOf(finding)
                  const deadline = typeof finding.evidence.deadline_at === "string" ? finding.evidence.deadline_at : null
                  const buyer = typeof finding.evidence.buyer_reason === "string" ? finding.evidence.buyer_reason : null
                  return (
                    <li key={finding.id} className="flex flex-col gap-2 px-4 py-3.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-medium">{titleOf(finding)}</p>
                        <span className="text-sm font-semibold tabular-nums">{money(finding)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{evidenceLine(finding)}</p>
                      {buyer ? <p className="text-xs text-muted-foreground">Comprador: “{buyer}”</p> : null}
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={STRENGTH_BADGE[strength.key]} title={strength.hint}>
                          {strength.label}
                        </Badge>
                        {deadline ? (
                          <span className="text-xs text-muted-foreground">Contestar até {formatDate(deadline)} (estimado)</span>
                        ) : null}
                        {finding.return_row_id ? (
                          <Link
                            href={returnHref(finding.return_row_id, accountId)}
                            className={cn(buttonVariants({ size: "sm" }), "ml-auto")}
                          >
                            Contestar pela maanu
                            <ArrowRightIcon data-icon="inline-end" />
                          </Link>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <Empty className="mx-4 border border-dashed py-10">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ShieldCheckIcon />
                  </EmptyMedia>
                  <EmptyTitle>Nada para contestar agora</EmptyTitle>
                  <EmptyDescription>
                    Quando o armazém do ML devolver o dinheiro ao comprador e der para contestar, a devolução aparece aqui e em
                    “Revise agora”.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>

        {appealed.length ? (
          <Card className="gap-0">
            <CardHeader className="pb-4">
              <CardTitle className="flex flex-wrap items-baseline justify-between gap-2">
                <span>Em análise no Mercado Livre</span>
                <span className="text-base tabular-nums">{formatMoney(totalOf(appealed))}</span>
              </CardTitle>
              <CardDescription>Contestações enviadas. Avisamos aqui quando o ML decidir.</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <ul className="divide-y border-t">
                {appealed.map((finding) => (
                  <li key={finding.id} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm">
                    {finding.return_row_id ? (
                      <Link href={returnHref(finding.return_row_id, accountId)} className="min-w-0 truncate hover:underline">
                        {titleOf(finding)}
                      </Link>
                    ) : (
                      <span className="min-w-0 truncate">{titleOf(finding)}</span>
                    )}
                    <span className="shrink-0 tabular-nums text-muted-foreground">{money(finding)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {leftBehindTotal.count ? (
          <Card className="gap-0">
            <CardHeader className="pb-4">
              <CardTitle className="flex flex-wrap items-baseline justify-between gap-2">
                <span>Ficou para trás</span>
                <span className="text-base tabular-nums">{formatMoney(leftBehindTotal.amount)}</span>
              </CardTitle>
              <CardDescription>
                {leftBehindTotal.count} {leftBehindTotal.count === 1 ? "devolução" : "devoluções"} venceram sem uma ação que recuperasse o dinheiro.
                {leftBehindTotal.estimated ? " Inclui prazo estimado." : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {leftBehindReasons.length ? (
                <ul className="flex flex-wrap gap-2 border-t px-4 py-3 text-xs text-muted-foreground">
                  {leftBehindReasons.map(([reason, label]) => (
                    <li key={reason} className="rounded-full bg-muted px-2.5 py-1">
                      {label}: {leftBehindDetails?.byReason[reason].count ?? 0} · {formatMoney(leftBehindDetails?.byReason[reason].amount ?? 0)}
                    </li>
                  ))}
                </ul>
              ) : null}
              {lost.length ? <ul className="divide-y border-t">
                {lost.map((finding) => {
                  const orderUrl = mlSaleUrl(finding.evidence.order_id as number | null)
                  return (
                    <li key={finding.id} className="flex flex-col gap-2 px-4 py-3.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-medium">{titleOf(finding)}</p>
                        <span className="text-sm font-semibold tabular-nums">{money(finding)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{evidenceLine(finding)}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <CopyTextButton text={findingRequestText(finding)} />
                        {orderUrl ? (
                          <a
                            href={orderUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                          >
                            Abrir a venda no ML <ExternalLinkIcon className="size-3.5" />
                          </a>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul> : null}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <Card className="gap-0">
          <CardHeader className="pb-4">
            <CardTitle>Ressarcimentos recebidos</CardTitle>
            <CardDescription>Devoluções em que o ML já deu razão a você (só referência).</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {reimbursed.length ? (
              <ul className="divide-y border-t">
                {reimbursed.slice(0, 30).map((finding) => (
                  <li key={finding.id} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm">
                    <span className="min-w-0 truncate">{titleOf(finding)}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{money(finding)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="border-t px-4 py-6 text-sm text-muted-foreground">Nenhum ressarcimento nos últimos 90 dias.</p>
            )}
          </CardContent>
        </Card>

        {appealLost.length ? (
          <Card className="gap-0">
            <CardHeader className="pb-4">
              <CardTitle>Contestadas sem sucesso</CardTitle>
              <CardDescription>O ML analisou a contestação e deu razão ao comprador.</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <ul className="divide-y border-t">
                {appealLost.slice(0, 30).map((finding) => (
                  <li key={finding.id} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm">
                    <span className="min-w-0 truncate">{titleOf(finding)}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{money(finding)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
