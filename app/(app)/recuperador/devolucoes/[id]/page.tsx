import { ArrowLeftIcon, ExternalLinkIcon, HistoryIcon, PackageOpenIcon, WarehouseIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { PageHeader } from "@/components/app/page-header"
import { SyncReturnButton } from "@/components/recuperador/recovery-buttons"
import { ReturnFollowUpCard } from "@/components/recuperador/return-follow-up"
import { ReturnReviewFlow } from "@/components/recuperador/return-review-flow"
import { ReturnSuggestionCard } from "@/components/recuperador/return-suggestion-card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatMoney } from "@/lib/customers/presentation"
import { canManageOrganization, requireSection } from "@/lib/dal/app-context"
import { getReturnDetail } from "@/lib/dal/recovery"
import { formatDateTime, timeAgo } from "@/lib/format"
import { returnFollowUp } from "@/lib/recovery/follow-up"
import { BENEFITED_LABELS, DESTINATION_LABELS, MODE_LABELS, PHASE_BADGE, recoveryHref, sellerStatusLabel } from "@/lib/recovery/presentation"
import {
  APPEAL_WINDOW_DAYS,
  CONDITION_LABELS,
  PHASE_LABELS,
  SHIPMENT_STATUS_LABELS,
  STATUS_MONEY_LABELS,
  WAREHOUSE_REASON_LABELS,
  cartOrderIds,
  destinationLabel,
  ownReviews,
} from "@/lib/recovery/returns"
import { FALLBACK_REASONS } from "@/lib/recovery/review"
import { suggestActionByRules, suggestInputFromRows } from "@/lib/recovery/suggest"
import { DUE_TEXT, claimHref, dueState, mlSaleUrl } from "@/lib/reputation/presentation"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Devolução" }
// Motivos, relato da IA e o envio da revisão (Server Actions desta página) falam com o ML e a OpenAI.
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

function reasonLabel(id: unknown) {
  return FALLBACK_REASONS.find((reason) => reason.id === id)?.label ?? (typeof id === "string" ? id : null)
}

export default async function ReturnPage({ params, searchParams }: PageProps<"/recuperador/devolucoes/[id]">) {
  const context = await requireSection("recuperador")
  const { id } = await params
  const query = await searchParams
  if (!UUID.test(id)) notFound()
  const data = await getReturnDetail(context.organization.id, id)
  if (!data) notFound()

  const now = new Date()
  const { row, claim, account, actions } = data
  const due = dueState(row.deadline_at, now)
  const saleUrl = mlSaleUrl(row.order_id)
  const conta = typeof query.conta === "string" ? query.conta : account.id
  const backHref = recoveryHref(conta, "devolucoes", row.phase === "needs_review" ? undefined : row.phase === "closed" ? "encerradas" : "andamento")
  // Só a avaliação do pedido desta reclamação (a devolução pode juntar os pedidos de um carrinho).
  const warehouse = ownReviews(row.reviews, row.order_id).filter((review) => review.product_condition || review.benefited)
  const cartOrders = cartOrderIds({ orders: row.orders, reviews: row.reviews }).length
  const quantity = row.orders.reduce((total, order) => total + (order.return_quantity ?? 0), 0)
  const mode = row.phase === "needs_review" ? row.mode : null
  const appeal = mode === "appeal"
  // "Sugerir ação": as regras aparecem na hora; o card pede o refinamento da IA em seguida (Server Action).
  const suggestion = mode
    ? suggestActionByRules(
        suggestInputFromRows(
          {
            reviews: row.reviews,
            orders: row.orders,
            order_id: row.order_id,
            status_money: row.status_money,
            amount: row.amount,
            currency_id: row.currency_id,
            deadline_at: row.deadline_at,
            is_cart: row.is_cart,
            can_review_ok: row.can_review_ok,
            can_review_fail: row.can_review_fail,
          },
          claim ? { reason_detail: claim.reason_detail, affects_reputation: claim.affects_reputation } : null,
          mode
        ),
        now
      )
    : null
  // Depois do envio: em análise no ML, ressarcido, ML manteve a decisão...
  const sentMode = actions.find((action) => action.status === "success" && action.action === "return_review_fail")?.details.mode
  const followUp = returnFollowUp(
    {
      phase: row.phase,
      review_kind: row.review_kind,
      review_submitted_at: row.review_submitted_at,
      recovered_at: row.recovered_at,
      recovered_amount: row.recovered_amount,
      currency_id: row.currency_id,
      reviews: row.reviews,
      order_id: row.order_id,
      submittedMode: sentMode === "appeal" || sentMode === "arrival" ? sentMode : null,
    },
    now
  )

  return (
    <>
      <div>
        <Link href={backHref} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 text-muted-foreground")}>
          <ArrowLeftIcon data-icon="inline-start" />
          Devoluções
        </Link>
      </div>

      <PageHeader
        title={row.item_title || "Devolução " + row.claim_id}
        description={[
          "Devolução #" + row.claim_id,
          row.claim_created_at ? "aberta " + timeAgo(row.claim_created_at, now) : null,
          claim?.buyer_nickname ? "comprador " + claim.buyer_nickname : null,
          account.nickname,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            {saleUrl ? (
              <a href={saleUrl} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline" }), "bg-card")}>
                Ver no ML
                <ExternalLinkIcon data-icon="inline-end" />
              </a>
            ) : null}
            <SyncReturnButton returnRowId={row.id} />
          </>
        }
      />

      <Card size="sm">
        <CardContent className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Fact label="Situação">
            <Badge variant="outline" className={cn("w-fit border-transparent", PHASE_BADGE[row.phase])}>
              {mode ? MODE_LABELS[mode] : PHASE_LABELS[row.phase]}
            </Badge>
          </Fact>
          <Fact label={appeal ? "Prazo para contestar" : "Prazo para revisar"}>
            {mode && row.deadline_at ? (
              <>
                <span className={cn("font-medium", DUE_TEXT[due])}>
                  {formatDateTime(row.deadline_at)} ({timeAgo(row.deadline_at, now)})
                </span>
                {appeal ? (
                  <span className="text-xs text-muted-foreground">
                    Estimado: {APPEAL_WINDOW_DAYS} dias depois da revisão do ML (regra do Full; o ML não informa a data pela API)
                  </span>
                ) : null}
              </>
            ) : (
              <span className="text-muted-foreground">
                {mode ? "O ML não informou (costuma ser 3 dias úteis depois que o pacote chega)" : "Sem prazo agora"}
              </span>
            )}
          </Fact>
          <Fact label="Valor da venda">
            {row.amount ? (
              <span className="font-medium tabular-nums">{formatMoney(row.amount, row.currency_id)}</span>
            ) : (
              <span className="text-muted-foreground">Sem informação</span>
            )}
            {quantity ? <span className="text-xs text-muted-foreground">{quantity} unidade(s) devolvida(s)</span> : null}
          </Fact>
          <Fact label="Dinheiro">
            <span>{row.status_money ? (STATUS_MONEY_LABELS[row.status_money] ?? row.status_money) : "Sem informação"}</span>
          </Fact>
          <Fact label="Envio da devolução">
            <span>{row.shipment_status ? (SHIPMENT_STATUS_LABELS[row.shipment_status] ?? row.shipment_status) : "Sem informação"}</span>
            {destinationLabel(row.destination) ? (
              <span className="text-xs text-muted-foreground">Destino: {destinationLabel(row.destination)}</span>
            ) : null}
          </Fact>
          <Fact label="Motivo do comprador">
            <span className="line-clamp-2">{claim?.reason_detail ?? "Sem informação"}</span>
          </Fact>
          <Fact label="Pedidos">
            <span>{row.is_cart ? "Carrinho com " + Math.max(cartOrders, 2) + " pedidos" : "1 pedido"}</span>
            {row.is_cart ? <span className="text-xs text-muted-foreground">Esta página cuida do pedido {row.order_id}</span> : null}
          </Fact>
          <Fact label="Atualizado">
            <span>{timeAgo(row.synced_at, now)}</span>
          </Fact>
        </CardContent>
      </Card>

      {followUp ? <ReturnFollowUpCard followUp={followUp} syncedAt={row.synced_at} now={now} /> : null}

      {mode && (claim?.ml_title || claim?.ml_description) ? (
        <Alert>
          <WarehouseIcon />
          <AlertTitle>O que o Mercado Livre diz: {claim.ml_title ?? "devolução"}</AlertTitle>
          {claim.ml_description ? <AlertDescription>{claim.ml_description}</AlertDescription> : null}
        </Alert>
      ) : null}

      {mode && suggestion ? <ReturnSuggestionCard returnRowId={row.id} mode={mode} initial={suggestion} /> : null}

      {mode ? (
        <ReturnReviewFlow
          returnRowId={row.id}
          canManage={canManageOrganization(context.role)}
          mode={mode}
          canOk={mode === "arrival" && row.can_review_ok}
          canFail={row.can_review_fail}
          isCart={row.is_cart}
          cartOrders={Math.max(cartOrders, row.is_cart ? 2 : 1)}
          amount={row.amount ? formatMoney(row.amount, row.currency_id) : null}
        />
      ) : row.phase === "at_warehouse" ? (
        <Alert>
          <WarehouseIcon />
          <AlertTitle>Esta devolução vai para o armazém do Mercado Livre</AlertTitle>
          <AlertDescription>
            O ML confere o produto primeiro (você não precisa revisar agora). Se ele devolver o dinheiro ao comprador e der para
            contestar, avisamos no app e por e-mail.
          </AlertDescription>
        </Alert>
      ) : row.phase === "waiting" ? (
        <Alert>
          <PackageOpenIcon />
          <AlertTitle>A devolução ainda não chegou</AlertTitle>
          <AlertDescription>Quando chegar e o Mercado Livre liberar a revisão, avisamos no app e por e-mail.</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <WarehouseIcon className="size-4" />
              Avaliação do produto
            </CardTitle>
          </CardHeader>
          <CardContent>
            {warehouse.length ? (
              <ul className="flex flex-col gap-3">
                {warehouse.map((review, index) => (
                  <li key={index} className="flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-sm">
                    <span className="font-medium">
                      {review.method === "triage" ? "Armazém do ML" : "Revisão"}
                      {review.order_id && row.is_cart ? " · pedido " + review.order_id : ""}
                    </span>
                    <span className="text-muted-foreground">
                      {[
                        review.product_condition ? "Produto " + (CONDITION_LABELS[review.product_condition] ?? review.product_condition) : null,
                        review.reason_id && WAREHOUSE_REASON_LABELS[review.reason_id] ? WAREHOUSE_REASON_LABELS[review.reason_id] : null,
                        review.product_destination && DESTINATION_LABELS[review.product_destination]
                          ? DESTINATION_LABELS[review.product_destination]
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Sem detalhes"}
                    </span>
                    {review.benefited && BENEFITED_LABELS[review.benefited] ? (
                      <span
                        className={
                          review.benefited === "seller" || review.benefited === "both"
                            ? "text-emerald-700 dark:text-emerald-300"
                            : "text-muted-foreground"
                        }
                      >
                        {BENEFITED_LABELS[review.benefited]}
                      </span>
                    ) : null}
                    {sellerStatusLabel(review.seller_status, review.seller_reason) ? (
                      <span className={review.seller_status === "failed" ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}>
                        {sellerStatusLabel(review.seller_status, review.seller_reason)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">O Mercado Livre ainda não avaliou o produto desta devolução.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HistoryIcon className="size-4" />
              Histórico na maanu
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {actions.length ? (
              <ul className="flex flex-col gap-3">
                {actions.map((action) => (
                  <li key={action.id} className="flex flex-col gap-0.5 text-sm">
                    <span className="font-medium">
                      {action.action === "return_review_ok" ? "Chegou certinho" : "Chegou com problema"}
                      {action.status === "failed" ? " (o ML recusou)" : ""}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(action.performed_at)}
                      {reasonLabel(action.details.reason) ? " · " + reasonLabel(action.details.reason) : ""}
                      {Array.isArray(action.details.attachments) && action.details.attachments.length
                        ? " · " + action.details.attachments.length + " foto(s)"
                        : ""}
                    </span>
                    {action.error ? <span className="text-xs text-destructive">{action.error}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma revisão enviada pela maanu nesta devolução.</p>
            )}
            <Link href={claimHref(row.claim_row_id, account.id)} className="text-sm font-medium text-primary hover:underline">
              Ver a reclamação no Escudo de Reputação
            </Link>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
