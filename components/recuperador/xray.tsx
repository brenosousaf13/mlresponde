import { ExternalLinkIcon, HourglassIcon, ScanSearchIcon, ShieldCheckIcon } from "lucide-react"
import Link from "next/link"

import { CopyTextButton } from "@/components/recuperador/recovery-buttons"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Progress } from "@/components/ui/progress"
import { formatMoney } from "@/lib/customers/presentation"
import type { FindingRow, RecoveryOverview } from "@/lib/dal/recovery"
import { formatDate, formatNumber } from "@/lib/format"
import { DESTINATION_LABELS, returnHref } from "@/lib/recovery/presentation"
import { CONDITION_LABELS, findingRequestText } from "@/lib/recovery/returns"
import { mlSaleUrl } from "@/lib/reputation/presentation"

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
  const parts = [
    typeof evidence.product_condition === "string" ? "Armazém: " + (CONDITION_LABELS[evidence.product_condition] ?? evidence.product_condition) : null,
    typeof evidence.product_destination === "string" && DESTINATION_LABELS[evidence.product_destination]
      ? "o produto " + DESTINATION_LABELS[evidence.product_destination]
      : null,
    evidence.claim_id ? "#" + String(evidence.claim_id) : null,
  ].filter(Boolean)
  return parts.join(" · ")
}

/** Achados: dinheiro sob suspeita (com texto pronto e link do ML) e os ressarcimentos já recebidos (referência). */
export function Findings({ findings, accountId }: { findings: FindingRow[]; accountId: string }) {
  const suspect = findings.filter((finding) => finding.kind === "return_unsaleable_unreimbursed" && finding.status === "open")
  const reimbursed = findings.filter((finding) => finding.kind === "return_reimbursed")
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="gap-0 lg:col-span-2">
        <CardHeader className="pb-4">
          <CardTitle>Dinheiro sob suspeita</CardTitle>
          <CardDescription>
            O armazém do ML marcou o produto sem condição de venda e o dinheiro foi para o comprador. Copie o texto e peça a
            revisão no Mercado Livre (a maanu não envia nada por você aqui).
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {suspect.length ? (
            <ul className="divide-y border-t">
              {suspect.map((finding) => {
                const orderUrl = mlSaleUrl(finding.evidence.order_id as number | null)
                const title = typeof finding.evidence.item_title === "string" ? finding.evidence.item_title : "Devolução"
                return (
                  <li key={finding.id} className="flex flex-col gap-2 px-4 py-3.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-medium">{title}</p>
                      <span className="text-sm font-semibold tabular-nums">
                        {finding.amount ? formatMoney(finding.amount, finding.currency_id) : "—"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{evidenceLine(finding)}</p>
                    <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm">{findingRequestText(finding)}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">Confiança média</Badge>
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
                      {finding.return_row_id ? (
                        <Link href={returnHref(finding.return_row_id, accountId)} className="text-sm text-muted-foreground hover:underline">
                          Ver devolução
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
                <EmptyTitle>Nada suspeito por enquanto</EmptyTitle>
                <EmptyDescription>Quando o Raio-X achar uma devolução que vale contestar, ela aparece aqui com o texto pronto.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      <Card className="gap-0">
        <CardHeader className="pb-4">
          <CardTitle>Ressarcimentos recebidos</CardTitle>
          <CardDescription>Devoluções em que o ML já ressarciu você (só referência).</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {reimbursed.length ? (
            <ul className="divide-y border-t">
              {reimbursed.slice(0, 30).map((finding) => (
                <li key={finding.id} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0 truncate">
                    {typeof finding.evidence.item_title === "string" ? finding.evidence.item_title : "Devolução"}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {finding.amount ? formatMoney(finding.amount, finding.currency_id) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="border-t px-4 py-6 text-sm text-muted-foreground">Nenhum ressarcimento nos últimos 90 dias.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
