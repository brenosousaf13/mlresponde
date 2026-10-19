import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
  FlagIcon,
  HistoryIcon,
  InfoIcon,
  MessagesSquareIcon,
  PackageIcon,
  PaperclipIcon,
  ShieldAlertIcon,
  SparklesIcon,
  XCircleIcon,
} from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { PageHeader } from "@/components/app/page-header"
import { AnalyzeClaimButton } from "@/components/reputacao/analyze-claim-button"
import { ClaimComposer } from "@/components/reputacao/claim-composer"
import { ClaimExclusionActions } from "@/components/reputacao/claim-exclusion-actions"
import { ClaimMoneyActions } from "@/components/reputacao/claim-money-actions"
import { SyncClaimButton } from "@/components/reputacao/sync-claim-button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { formatMoney } from "@/lib/customers/presentation"
import { canManageOrganization, requireSection } from "@/lib/dal/app-context"
import { getClaimPage, type ClaimPageData } from "@/lib/dal/reputation-claims"
import { formatDateTime, timeAgo } from "@/lib/format"
import { BEST_ACTION_LABELS, RISK_LABELS } from "@/lib/reputation/claim-ai"
import {
  CLAIM_STAGE_LABELS,
  EXPECTED_RESOLUTION_LABELS,
  EXPECTED_STATUS_LABELS,
  MAX_CLAIM_ANALYSES,
  ROLE_LABELS,
  claimTypeLabel,
  isRestrictedAction,
  reasonGroup,
} from "@/lib/reputation/claim-details"
import { EXCLUSION_RULES_URL, exclusionLabel } from "@/lib/reputation/exclusions"
import {
  CLAIM_RISK_BADGE,
  DUE_TEXT,
  SHIPPING_STATUS_LABELS,
  actionResponsibleLabel,
  affectsInfo,
  dueState,
  mlSaleUrl,
  moderationLabel,
} from "@/lib/reputation/presentation"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Reclamação" }
// Mensagens, reembolsos, devolução, mediação e a análise da IA (Server Actions desta página) falam com o ML e a OpenAI.
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const CONFIDENCE_LABELS: Record<string, string> = { high: "certeza alta", medium: "certeza média", low: "certeza baixa" }

type MoneyKind = "refund" | "partial_refund" | "allow_return" | "open_dispute"

export default async function ClaimPage({ params, searchParams }: PageProps<"/reputacao/reclamacoes/[id]">) {
  const context = await requireSection("reputacao")
  const { id } = await params
  const query = await searchParams
  if (!UUID.test(id)) notFound()
  const data = await getClaimPage(context.organization.id, id)
  if (!data) notFound()

  const now = new Date()
  const canManage = canManageOrganization(context.role)
  const { claim, detail, orderSummary, analysis, actions } = data
  const open = claim.status === "opened"
  const item = orderSummary?.items[0]?.title
  const affects = affectsInfo(claim.affects_reputation)
  const due = dueState(claim.next_due_at, now)
  const responsible = actionResponsibleLabel(detail?.action_responsible)
  const saleUrl = mlSaleUrl(orderSummary?.pack_id ?? orderSummary?.order_id ?? claim.resource_id)
  const conta = typeof query.conta === "string" ? query.conta : claim.ml_account_id
  const backHref = "/reputacao?conta=" + encodeURIComponent(conta) + "&aba=reclamacoes"

  const receivers = actions.available
    .map((action) => action.kind)
    .filter((kind): kind is "message_buyer" | "message_mediator" => kind === "message_buyer" || kind === "message_mediator")
  const moneyKinds = actions.available.map((action) => action.kind).filter((kind): kind is MoneyKind => isRestrictedAction(kind))
  // Em análise agora (trava ativa) ou na fila da rotina (pending): na fila, dá para pedir a análise na hora.
  const processing =
    claim.ai_status === "processing" && Boolean(claim.ai_locked_until) && Date.parse(claim.ai_locked_until ?? "") > now.getTime()
  const queued = claim.ai_status === "pending"

  return (
    <>
      <div>
        <Link href={backHref} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 text-muted-foreground")}>
          <ArrowLeftIcon data-icon="inline-start" />
          Reclamações
        </Link>
      </div>

      <PageHeader
        title={item || claimTypeLabel(claim.type)}
        description={[
          claimTypeLabel(claim.type) + " #" + claim.claim_id,
          claim.ml_created_at ? "aberta " + timeAgo(claim.ml_created_at, now) : null,
          claim.buyer_nickname ? "comprador " + claim.buyer_nickname : null,
          data.accountName,
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
            <SyncClaimButton claimRowId={claim.id} />
          </>
        }
      />

      <Card size="sm">
        <CardContent className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Fact label="Situação">
            <span className="flex flex-wrap items-center gap-1.5">
              {open ? "Aberta" : "Encerrada"}
              {open && claim.stage && CLAIM_STAGE_LABELS[claim.stage] ? (
                <Badge variant="outline">{CLAIM_STAGE_LABELS[claim.stage]}</Badge>
              ) : null}
            </span>
          </Fact>
          <Fact label="Próximo prazo">
            {open && claim.next_due_at ? (
              <span className={cn("font-medium", DUE_TEXT[due])}>
                {formatDateTime(claim.next_due_at)} ({timeAgo(claim.next_due_at, now)})
              </span>
            ) : (
              <span className="text-muted-foreground">Sem prazo agora</span>
            )}
            {open && responsible ? <span className="text-xs text-muted-foreground">Quem age: {responsible}</span> : null}
          </Fact>
          <Fact label="Reputação">
            <Badge variant="outline" className={cn("border-transparent", affects.className)}>
              {affects.label}
            </Badge>
            {open && claim.has_incentive && claim.affects_due_at ? (
              <span className="text-xs text-muted-foreground">
                Resolva até {formatDateTime(claim.affects_due_at)} e ela não conta.
              </span>
            ) : null}
          </Fact>
          <Fact label="Valor da venda">
            {orderSummary?.total_amount ? (
              <span className="font-medium tabular-nums">{formatMoney(orderSummary.total_amount, orderSummary.currency_id)}</span>
            ) : (
              <span className="text-muted-foreground">Sem informação</span>
            )}
            {orderSummary?.date ? <span className="text-xs text-muted-foreground">Venda de {formatDateTime(orderSummary.date)}</span> : null}
          </Fact>
        </CardContent>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-5">
        <div className="flex flex-col gap-4 lg:col-span-3">
          <WhatHappened data={data} />
          <Conversation data={data} receivers={receivers} />
        </div>

        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SparklesIcon className="size-4 text-brand-teal-ink" />
                Análise da IA
              </CardTitle>
              <CardDescription>A IA prepara; você decide. Confira antes de usar.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {analysis ? (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className={cn("border-transparent", CLAIM_RISK_BADGE[analysis.risk])}>
                      {RISK_LABELS[analysis.risk]}
                    </Badge>
                  </div>
                  <p className="leading-relaxed">{analysis.summary}</p>
                  {open ? (
                    <div className="rounded-lg border border-primary/30 bg-primary/[0.04] p-3">
                      <p className="text-xs font-medium tracking-wide text-brand-teal-ink uppercase">Melhor saída</p>
                      <p className="mt-0.5 font-medium">{BEST_ACTION_LABELS[analysis.bestAction]}</p>
                      {analysis.bestActionReason ? <p className="mt-1 text-muted-foreground">{analysis.bestActionReason}</p> : null}
                    </div>
                  ) : null}
                  {open && receivers.length && (analysis.buyerDraft || analysis.mediatorDraft) ? (
                    <p className="text-xs text-muted-foreground">
                      O rascunho da resposta está em Conversa, pronto para você revisar e enviar.
                    </p>
                  ) : null}
                </>
              ) : processing ? (
                <p className="text-muted-foreground">A IA está analisando esta reclamação. Leva menos de um minuto.</p>
              ) : queued ? (
                <p className="text-muted-foreground">
                  A reclamação está na fila da IA e fica pronta em poucos minutos. Se preferir, analise agora.
                </p>
              ) : claim.ai_status === "failed" ? (
                <p className="text-muted-foreground">A IA não conseguiu analisar esta reclamação. Tente de novo.</p>
              ) : (
                <p className="text-muted-foreground">Esta reclamação ainda não foi analisada.</p>
              )}
            </CardContent>
            <CardFooter className="flex-wrap justify-between gap-2 border-t">
              <span className="text-xs text-muted-foreground">
                {claim.ai_analyzed_at ? "Analisada " + timeAgo(claim.ai_analyzed_at, now) + " · " : ""}
                {claim.ai_analyses} de {MAX_CLAIM_ANALYSES} análises
              </span>
              <AnalyzeClaimButton
                claimRowId={claim.id}
                label={analysis ? "Analisar de novo" : "Analisar agora"}
                disabled={processing || claim.ai_analyses >= MAX_CLAIM_ANALYSES}
              />
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>O que fazer</CardTitle>
              <CardDescription>
                {open
                  ? "Só aparecem as ações que o Mercado Livre libera para você agora."
                  : "A reclamação está encerrada. Não há mais ações."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {moneyKinds.length ? (
                <div className="flex flex-col gap-2">
                  <ClaimMoneyActions
                    claimRowId={claim.id}
                    kinds={moneyKinds}
                    canManage={canManage}
                    amount={orderSummary?.total_amount ?? null}
                    currency={orderSummary?.currency_id ?? null}
                  />
                  <p className="text-xs text-muted-foreground">
                    {canManage
                      ? "A maanu executa no Mercado Livre depois de você confirmar duas vezes. Tudo fica no histórico."
                      : "Ações com dinheiro ou mediação: só o dono ou um administrador da loja."}
                  </p>
                </div>
              ) : null}
              {actions.onlyInMl.length ? (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium text-muted-foreground">Só no Mercado Livre</p>
                  <ul className="flex flex-col gap-2">
                    {actions.onlyInMl.map((action) => (
                      <li key={action.action} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                        <div className="min-w-0">
                          <p className="font-medium">{action.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {action.mandatory ? "Obrigatória" : "Opcional"}
                            {action.dueDate ? " · até " + formatDateTime(action.dueDate) : ""}
                          </p>
                        </div>
                        {saleUrl ? (
                          <a
                            href={saleUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0 bg-card")}
                          >
                            Fazer no ML
                            <ExternalLinkIcon data-icon="inline-end" />
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {open && !moneyKinds.length && !actions.onlyInMl.length && !receivers.length ? (
                <p className="text-muted-foreground">
                  Nenhuma ação sua agora: a vez é {responsible ? "de " + responsible.toLowerCase() : "da outra parte"}. A maanu
                  avisa quando mudar.
                </p>
              ) : null}
              {open && !moneyKinds.length && !actions.onlyInMl.length && receivers.length ? (
                <p className="text-muted-foreground">Por enquanto, a ação liberada é responder em Conversa.</p>
              ) : null}
            </CardContent>
          </Card>

          <ExclusionCard data={data} now={now} />
          <HistoryCard data={data} now={now} />
        </div>
      </div>
    </>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

function WhatHappened({ data }: { data: ClaimPageData }) {
  const { claim, detail, expected, orderSummary, shipping } = data
  const reason = [reasonGroup(claim.reason_id), claim.reason_detail].filter(Boolean).join(" · ")
  const buyerWants = expected.filter((item) => item.player_role !== "respondent" && item.player_role !== "mediator")
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlertIcon className="size-4" />O que aconteceu
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {detail?.title || detail?.description ? (
          <div>
            {detail.title ? <p className="font-medium">{detail.title}</p> : null}
            {detail.description ? <p className="text-muted-foreground">{detail.description}</p> : null}
          </div>
        ) : null}
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Motivo</dt>
            <dd>{reason || claim.reason_id || "Sem informação"}</dd>
          </div>
          {detail?.problem ? (
            <div>
              <dt className="text-xs text-muted-foreground">Problema informado</dt>
              <dd>{detail.problem}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs text-muted-foreground">O que o comprador espera</dt>
            <dd>
              {buyerWants.length
                ? buyerWants
                    .map(
                      (item) =>
                        (EXPECTED_RESOLUTION_LABELS[item.expected_resolution] ?? item.expected_resolution) +
                        (item.status && EXPECTED_STATUS_LABELS[item.status] ? " (" + EXPECTED_STATUS_LABELS[item.status] + ")" : "")
                    )
                    .join("; ")
                : "Sem informação"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Produto entregue</dt>
            <dd>{claim.fulfilled === null ? "Sem informação" : claim.fulfilled ? "Sim" : "Não"}</dd>
          </div>
        </dl>

        {orderSummary?.items.length || shipping ? (
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
            {orderSummary?.items.map((saleItem, index) => (
              <p key={index} className="flex items-start gap-2">
                <PackageIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  {saleItem.quantity}x {saleItem.title}
                  {saleItem.unit_price !== null ? (
                    <span className="text-muted-foreground"> · {formatMoney(saleItem.unit_price, orderSummary.currency_id)} cada</span>
                  ) : null}
                </span>
              </p>
            ))}
            {shipping ? (
              <p className="text-xs text-muted-foreground">
                Envio: {SHIPPING_STATUS_LABELS[shipping.status ?? ""] ?? shipping.status ?? "sem informação"}
                {shipping.substatus ? " (" + shipping.substatus.replace(/_/g, " ") + ")" : ""}
                {shipping.tracking_number ? " · rastreio " + shipping.tracking_number : ""}
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function Conversation({
  data,
  receivers,
}: {
  data: ClaimPageData
  receivers: ("message_buyer" | "message_mediator")[]
}) {
  const { claim, messages, analysis } = data
  const open = claim.status === "opened"
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessagesSquareIcon className="size-4" />
          Conversa
        </CardTitle>
        <CardDescription>As mensagens da reclamação, como estão no Mercado Livre.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {messages.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">Nenhuma mensagem ainda.</p>
        ) : (
          <ol className="flex max-h-[32rem] flex-col gap-3 overflow-y-auto pr-1">
            {messages.map((message) => {
              const mine = message.sender_role === "respondent"
              const mediator = message.sender_role === "mediator"
              const moderation = moderationLabel(message.moderation_status)
              const attachments = Array.isArray(message.attachments)
                ? (message.attachments as { filename?: string; original_filename?: string | null }[])
                : []
              return (
                <li key={message.id} className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
                  <span className="text-xs text-muted-foreground">
                    {ROLE_LABELS[message.sender_role ?? ""] ?? "Mensagem"}
                    {message.message_at ? " · " + formatDateTime(message.message_at) : ""}
                  </span>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3.5 py-2.5 leading-relaxed whitespace-pre-wrap",
                      mine
                        ? "rounded-br-sm bg-primary/10"
                        : mediator
                          ? "rounded-bl-sm border border-amber-500/30 bg-amber-500/10"
                          : "rounded-bl-sm bg-muted"
                    )}
                  >
                    {message.message || <span className="text-muted-foreground italic">Sem texto</span>}
                    {attachments.length ? (
                      <span className="mt-2 flex flex-wrap gap-1.5">
                        {attachments.map((attachment, index) => (
                          <span key={index} className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-xs">
                            <PaperclipIcon className="size-3" />
                            {attachment.original_filename || attachment.filename}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </div>
                  {moderation ? <span className="text-xs text-amber-700 dark:text-amber-300">{moderation}</span> : null}
                </li>
              )
            })}
          </ol>
        )}

        {receivers.length ? (
          <div className="border-t pt-4">
            <ClaimComposer
              claimRowId={claim.id}
              receivers={receivers}
              drafts={{ buyer: analysis?.buyerDraft ?? "", mediator: analysis?.mediatorDraft ?? "" }}
            />
          </div>
        ) : (
          <p className="flex items-center gap-2 border-t pt-4 text-xs text-muted-foreground">
            <InfoIcon className="size-3.5 shrink-0" />
            {open
              ? "O Mercado Livre não libera mensagens para você agora nesta reclamação."
              : "A reclamação está encerrada: não dá mais para enviar mensagens."}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function ExclusionCard({ data, now }: { data: ClaimPageData; now: Date }) {
  const { claim, analysis } = data
  const suggestion = analysis && analysis.exclusionCase !== "none" ? analysis : null
  const requested = claim.exclusion_requested_at
  const relevant = claim.affects_reputation === "affected" || Boolean(requested) || Boolean(suggestion)
  if (!relevant) return null
  const excluded = Boolean(requested) && claim.affects_reputation === "not_affected"
  const inDispute = claim.stage === "dispute" && claim.status === "opened"
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlagIcon className="size-4" />
          Tirar da reputação
        </CardTitle>
        <CardDescription>O Mercado Livre pode excluir reclamações em 11 casos. O pedido é feito por você, no ML.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {excluded ? (
          <Alert>
            <CheckCircle2Icon />
            <AlertTitle>Ela não conta mais na reputação</AlertTitle>
            <AlertDescription>O Mercado Livre deixou de contar esta reclamação.</AlertDescription>
          </Alert>
        ) : requested ? (
          <Alert>
            <InfoIcon />
            <AlertTitle>Você pediu a exclusão {timeAgo(requested, now)}</AlertTitle>
            <AlertDescription>A maanu confere no ML e avisa quando ela deixar de contar.</AlertDescription>
          </Alert>
        ) : null}
        {inDispute && !excluded ? (
          <Alert>
            <AlertTriangleIcon />
            <AlertTitle>Com mediação aberta, o ML não analisa a exclusão</AlertTitle>
          </Alert>
        ) : null}
        {excluded ? null : suggestion ? (
          <p>
            A IA acha que pode ser o caso: <span className="font-medium">{exclusionLabel(suggestion.exclusionCase)}</span>{" "}
            <span className="text-muted-foreground">({CONFIDENCE_LABELS[suggestion.exclusionConfidence]})</span>
          </p>
        ) : analysis ? (
          <p className="text-muted-foreground">
            A IA não viu um caso de exclusão nesta reclamação. Se você discorda, veja as regras do ML.
          </p>
        ) : (
          <p className="text-muted-foreground">Depois da análise da IA, a maanu diz se ela se encaixa em algum dos casos.</p>
        )}
        {claim.status === "opened" && !inDispute && !requested ? (
          <p className="text-xs text-muted-foreground">Peça a exclusão depois que a reclamação for resolvida.</p>
        ) : null}
        {excluded ? null : inDispute ? (
          <a
            href={EXCLUSION_RULES_URL}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-fit bg-card")}
          >
            Regras do ML
            <ExternalLinkIcon data-icon="inline-end" />
          </a>
        ) : (
          <ClaimExclusionActions claimRowId={claim.id} text={suggestion?.exclusionText ?? ""} requestedAt={requested} />
        )}
      </CardContent>
    </Card>
  )
}

const HISTORY_LABELS: Record<string, string> = {
  refund: "Dinheiro devolvido",
  partial_refund: "Reembolso parcial oferecido",
  allow_return: "Devolução aceita",
  open_dispute: "Mediação pedida",
  exclusion_requested: "Exclusão pedida no ML",
}

function historyLabel(row: ClaimPageData["history"][number]): string {
  if (row.action === "send_message") return row.receiver_role === "mediator" ? "Mensagem ao mediador" : "Mensagem ao comprador"
  const details = (row.details ?? {}) as { percentage?: number; amount?: number | null; currency?: string | null }
  const base = HISTORY_LABELS[row.action] ?? row.action
  if (row.action === "partial_refund" && details.percentage) {
    return base + " (" + details.percentage + "%" + (details.amount ? ", " + formatMoney(details.amount, details.currency) : "") + ")"
  }
  if (row.action === "refund" && details.amount) return base + " (" + formatMoney(details.amount, details.currency) + ")"
  return base
}

function HistoryCard({ data, now }: { data: ClaimPageData; now: Date }) {
  if (!data.history.length) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HistoryIcon className="size-4" />
          Histórico na maanu
        </CardTitle>
        <CardDescription>Tudo o que foi feito por aqui. Não dá para editar nem apagar.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-3">
          {data.history.map((row) => (
            <li key={row.id} className="flex items-start gap-2.5">
              {row.status === "success" ? (
                <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              ) : (
                <XCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
              )}
              <div className="min-w-0">
                <p className="font-medium">{historyLabel(row)}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(row.performed_at)} ({timeAgo(row.performed_at, now)})
                  {row.status === "failed" ? " · falhou" + (row.error ? ": " + row.error : "") : ""}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
