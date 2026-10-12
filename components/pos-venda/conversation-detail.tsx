import {
  ArrowLeftIcon,
  BotIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  ExternalLinkIcon,
  FileIcon,
  LoaderIcon,
  LockIcon,
  PackageIcon,
  ShieldAlertIcon,
  StoreIcon,
  TruckIcon,
  UserCheckIcon,
  UserIcon,
} from "lucide-react"
import Link from "next/link"
import { Fragment } from "react"

import { ItemThumb } from "@/components/perguntas/question-detail"
import { ConversationMenu } from "@/components/pos-venda/conversation-menu"
import { ReplyComposer } from "@/components/pos-venda/reply-composer"
import { ScrollToLatest } from "@/components/pos-venda/scroll-to-latest"
import { Card } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ScrollArea } from "@/components/ui/scroll-area"
import { blockReasonLabel, type MessageAttachment } from "@/lib/after-sale/conversation"
import { AFTER_SALE_REVIEW_LABELS, TOPIC_LABELS, type AfterSaleReviewReason, type AfterSaleTopic } from "@/lib/after-sale/decision"
import {
  LOGISTIC_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  formatMoney,
  parseOrderSnapshot,
  shippingLabel,
} from "@/lib/after-sale/order"
import { CONVERSATION_TONE_STYLES, conversationTone, isShippingLate, saleUrl } from "@/lib/after-sale/presentation"
import { composeAfterSaleMessage } from "@/lib/after-sale/text"
import { dayKey, dayLabel, formatDate, formatDateTime, formatTime } from "@/lib/format"
import type { Json } from "@/lib/supabase/database.types"
import { cn } from "@/lib/utils"

export type DetailConversation = {
  id: string
  ml_account_id: string
  pack_id: string
  order_ids: string[]
  buyer_nickname: string | null
  item_title: string | null
  item_thumbnail: string | null
  item_permalink: string | null
  order_summary: Json
  status: string
  review_reason: string | null
  last_answer_source: string | null
  ml_substatus: string | null
  claim_open: boolean
  max_message_length: number
  ai_draft: string | null
  ai_confidence: number | null
  ai_reason: string | null
  ai_topic: string | null
  pending_count: number
  shipping_status: string | null
  estimated_delivery_at: string | null
  last_error: string | null
}

export type DetailMessage = {
  id: string
  ml_message_id: string
  sender: string
  source: string
  text: string
  attachments: Json
  ml_status: string | null
  moderation_status: string | null
  moderation_reason: string | null
  sent_at: string
}

const SOURCE = {
  ai: { label: "Agente", icon: BotIcon, avatar: "bg-primary text-primary-foreground", bubble: "bg-primary/10" },
  manual: { label: "Você", icon: UserCheckIcon, avatar: "bg-brand-graphite text-white dark:bg-slate-600", bubble: "bg-slate-100 dark:bg-slate-800/60" },
  external: { label: "Você, no Mercado Livre", icon: StoreIcon, avatar: "bg-slate-500 text-white", bubble: "bg-slate-50 ring-1 ring-slate-200 dark:bg-slate-900/40 dark:ring-slate-800" },
} as const

const MODERATION_LABELS: Record<string, string> = {
  OUT_OF_PLACE_LANGUAGE: "linguagem inadequada",
  SOCIAL_NETWORK_LINK: "link de rede social",
  LINK_SHORT_URL: "link encurtado",
  AUTOMATIC_MESSAGE: "mensagem automática",
  PERSONAL_DATA: "dados pessoais",
  LINK_MERCADOPAGO: "link do Mercado Pago",
  ML_LINKS_PAYPAL: "link de pagamento externo",
  EVASION_CLAIM_SELLER: "tentativa de evitar reclamação",
}

function attachmentsOf(value: Json): MessageAttachment[] {
  return Array.isArray(value) ? (value as unknown as MessageAttachment[]).filter((item) => item && typeof item.id === "string") : []
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="shrink-0 text-muted-foreground sm:w-36">{label}</dt>
      <dd className="min-w-0 font-medium">{children}</dd>
    </div>
  )
}

/** Resumo da venda e do envio (o mesmo que o agente lê). */
function SalePanel({ conversation }: { conversation: DetailConversation }) {
  const snapshot = parseOrderSnapshot(conversation.order_summary)
  if (!snapshot) {
    return (
      <div className="rounded-xl border border-dashed p-3.5 text-sm text-muted-foreground">
        Os dados da venda ainda não foram carregados do Mercado Livre.
      </div>
    )
  }
  const shipment = snapshot.shipment
  const late = isShippingLate(conversation)
  const estimate = shipment?.estimatedDeliveryLimit ?? shipment?.estimatedDelivery ?? null
  return (
    <Collapsible className="rounded-xl border bg-muted/20">
      <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm font-medium hover:bg-muted/40">
        <PackageIcon className="size-4 text-muted-foreground" />
        <span className="min-w-0 truncate">
          Detalhes da venda
          {snapshot.total !== null ? <span className="font-normal text-muted-foreground"> · {formatMoney(snapshot.total, snapshot.currency)}</span> : null}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2 text-xs font-normal text-muted-foreground">
          {shipment ? (
            <span className={cn("inline-flex items-center gap-1", late && "font-medium text-rose-600 dark:text-rose-400")}>
              <TruckIcon className="size-3.5" />
              {late ? "Envio atrasado" : shippingLabel(shipment.status)}
              {shipment.trackingNumber ? <span className="hidden font-mono sm:inline">· {shipment.trackingNumber}</span> : null}
            </span>
          ) : null}
          <ChevronDownIcon className="size-4 transition-transform group-data-[panel-open]:rotate-180" />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-3 border-t px-3.5 py-3 text-sm">
          <ul className="flex flex-col gap-1.5">
            {snapshot.items.map((item, index) => (
              <li key={`${item.itemId}-${index}`} className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="font-medium">{item.quantity}× </span>
                  {item.title}
                  {item.variation ? <span className="text-muted-foreground"> · {item.variation}</span> : null}
                </span>
                {item.unitPrice !== null ? (
                  <span className="shrink-0 tabular-nums text-muted-foreground">{formatMoney(item.unitPrice, snapshot.currency)}</span>
                ) : null}
              </li>
            ))}
          </ul>
          <dl className="grid gap-2 border-t pt-3 text-[13px]">
            {snapshot.total !== null ? <Row label="Total">{formatMoney(snapshot.total, snapshot.currency)}</Row> : null}
            {snapshot.orderedAt ? <Row label="Comprado em">{formatDateTime(snapshot.orderedAt)}</Row> : null}
            {snapshot.orderStatus ? (
              <Row label="Situação">
                {ORDER_STATUS_LABELS[snapshot.orderStatus] ?? snapshot.orderStatus}
                {snapshot.paymentStatus ? ` · pagamento ${PAYMENT_STATUS_LABELS[snapshot.paymentStatus] ?? snapshot.paymentStatus}` : ""}
              </Row>
            ) : null}
            {snapshot.cancelDetail ? <Row label="Cancelamento">{snapshot.cancelDetail}</Row> : null}
            {shipment ? (
              <>
                <Row label="Envio">{shippingLabel(shipment.status, shipment.substatus) ?? "—"}</Row>
                {shipment.logisticType ? <Row label="Forma de envio">{LOGISTIC_LABELS[shipment.logisticType] ?? shipment.logisticType}</Row> : null}
                <Row label="Rastreio">
                  {shipment.trackingNumber ? (
                    <span className="font-mono text-[13px]">
                      {shipment.trackingNumber}
                      {shipment.trackingMethod ? <span className="font-sans font-normal text-muted-foreground"> · {shipment.trackingMethod}</span> : null}
                    </span>
                  ) : (
                    <span className="font-normal text-muted-foreground">ainda não disponível</span>
                  )}
                </Row>
                {shipment.deliveredAt ? (
                  <Row label="Entregue em">{formatDate(shipment.deliveredAt, "short")}</Row>
                ) : estimate ? (
                  <Row label="Previsão de entrega">
                    <span className={cn(late && "text-rose-600 dark:text-rose-400")}>
                      até {formatDate(estimate, "short")}
                      {late ? " (já passou)" : ""}
                    </span>
                  </Row>
                ) : null}
              </>
            ) : (
              <Row label="Envio">
                <span className="font-normal text-muted-foreground">
                  {snapshot.tags.includes("no_shipping") ? "Sem envio pelo Mercado Livre (a combinar)" : "Sem informações de envio"}
                </span>
              </Row>
            )}
          </dl>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function Banner({ tone, icon: Icon, title, children }: { tone: string; icon: typeof CircleAlertIcon; title: string; children?: React.ReactNode }) {
  return (
    <div className={cn("flex items-start gap-2.5 rounded-xl border p-3.5 text-sm", tone)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="flex flex-col gap-0.5">
        <p className="font-medium">{title}</p>
        {children ? <div className="opacity-85">{children}</div> : null}
      </div>
    </div>
  )
}

export function ConversationDetail({
  conversation,
  messages,
  accountNickname,
  signature,
  backHref,
  nextHref,
  className,
}: {
  conversation: DetailConversation
  messages: DetailMessage[]
  accountNickname: string | null
  signature: string
  backHref: string
  nextHref: string | null
  className?: string
}) {
  const tone = conversationTone(conversation.status, conversation.last_answer_source)
  const style = CONVERSATION_TONE_STYLES[tone]
  const reason = conversation.review_reason ? AFTER_SALE_REVIEW_LABELS[conversation.review_reason as AfterSaleReviewReason] : null
  const topic = conversation.ai_topic ? TOPIC_LABELS[conversation.ai_topic as AfterSaleTopic] : null
  const draft = tone === "open" && conversation.ai_draft ? composeAfterSaleMessage(conversation.ai_draft, signature) : ""
  const url = saleUrl(conversation.order_ids[0], conversation.pack_id)
  const now = new Date()

  return (
    <Card className={cn("gap-0 py-0", className)}>
      <div className="flex shrink-0 items-start gap-3 border-b p-4">
        <Link
          href={backHref}
          scroll={false}
          className="-ml-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted lg:hidden"
          aria-label="Voltar para a lista"
        >
          <ArrowLeftIcon className="size-4" />
        </Link>
        <ItemThumb src={conversation.item_thumbnail} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="font-medium leading-snug">
            {conversation.buyer_nickname ?? "Comprador"}
            <span className="font-normal text-muted-foreground"> · Venda {conversation.order_ids[0] ?? conversation.pack_id}</span>
          </p>
          {conversation.item_permalink ? (
            <a
              href={conversation.item_permalink}
              target="_blank"
              rel="noreferrer"
              className="group inline-flex items-start gap-1 text-sm text-muted-foreground hover:text-primary"
            >
              <span className="line-clamp-1">{conversation.item_title ?? "Produto"}</span>
              <ExternalLinkIcon className="mt-0.5 size-3.5 shrink-0 opacity-50 group-hover:opacity-100" />
            </a>
          ) : (
            <p className="line-clamp-1 text-sm text-muted-foreground">{conversation.item_title ?? "Produto"}</p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className={cn("inline-flex items-center gap-1.5 font-medium", style.text)}>
              <span className={cn("size-2 rounded-full", style.dot)} />
              {style.label}
            </span>
            {topic ? <span className="text-muted-foreground">Assunto: {topic}</span> : null}
            {accountNickname ? <span className="text-muted-foreground">{accountNickname}</span> : null}
          </div>
        </div>
        <ConversationMenu
          conversationId={conversation.id}
          saleUrl={url}
          permalink={conversation.item_permalink}
          canRetry={tone === "open" && conversation.pending_count > 0}
          archived={conversation.status === "archived"}
        />
      </div>

      <ScrollArea key={conversation.id} className="lg:min-h-0 lg:flex-1">
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          {tone === "open" ? (
            <Banner tone={style.soft} icon={CircleAlertIcon} title={reason ?? "Esta conversa está esperando você"}>
              {conversation.ai_reason ? <p>{conversation.ai_reason}</p> : null}
              {conversation.review_reason === "send_rejected" && conversation.last_error ? <p>Resposta do Mercado Livre: {conversation.last_error}</p> : null}
            </Banner>
          ) : null}
          {conversation.claim_open && tone !== "blocked" ? (
            <Banner tone={CONVERSATION_TONE_STYLES.blocked.soft} icon={ShieldAlertIcon} title="Há uma reclamação ou mediação aberta">
              O agente não responde sozinho enquanto ela estiver aberta. Acompanhe e responda a reclamação no Mercado Livre.
            </Banner>
          ) : null}
          {tone === "queue" ? (
            <Banner tone={style.soft} icon={LoaderIcon} title="O agente está analisando esta conversa">
              A tela atualiza sozinha.
            </Banner>
          ) : null}
          {tone === "blocked" ? (
            <Banner tone={style.soft} icon={LockIcon} title="O Mercado Livre fechou esta conversa para novas mensagens">
              {blockReasonLabel(conversation.ml_substatus)}
            </Banner>
          ) : null}
          {tone === "archived" ? (
            <div className={cn("rounded-xl border p-3.5 text-sm", style.soft)}>Conversa arquivada. Se o comprador escrever de novo, ela volta sozinha.</div>
          ) : null}

          <SalePanel conversation={conversation} />

          <div className="flex flex-col gap-3">
            {messages.length ? null : <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma mensagem carregada ainda.</p>}
            {messages.map((message, index) => {
              const previous = messages[index - 1]
              const newDay = !previous || dayKey(previous.sent_at) !== dayKey(message.sent_at)
              const files = attachmentsOf(message.attachments)
              const rejected = message.ml_status === "rejected" || message.moderation_status === "rejected"
              const fromBuyer = message.sender === "buyer"
              const source = SOURCE[(message.source as keyof typeof SOURCE) ?? "external"] ?? SOURCE.external
              const content = (
                <>
                  {message.text ? <p className="whitespace-pre-wrap">{message.text}</p> : null}
                  {files.length ? (
                    <ul className={cn("flex flex-col gap-1", message.text && "mt-2")}>
                      {files.map((file) => (
                        <li key={file.id}>
                          <a
                            href={`/api/pos-venda/anexo?c=${conversation.id}&id=${encodeURIComponent(file.id)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-background/70 px-2 py-1 text-xs underline-offset-2 hover:underline"
                          >
                            <FileIcon className="size-3.5 shrink-0" />
                            <span className="truncate">{file.name}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              )
              return (
                <Fragment key={message.id}>
                  {newDay ? (
                    <p className="py-1 text-center text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                      {dayLabel(message.sent_at, now)}
                    </p>
                  ) : null}
                  {fromBuyer ? (
                    <div className="flex items-start gap-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <UserIcon className="size-4" />
                      </span>
                      <div className="flex min-w-0 max-w-[85%] flex-col gap-1">
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Comprador</span> · {formatTime(message.sent_at)}
                        </p>
                        <div className="w-fit max-w-full rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2.5 text-[15px] leading-relaxed">{content}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-row-reverse items-start gap-2.5">
                      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", source.avatar)}>
                        <source.icon className="size-4" />
                      </span>
                      <div className="flex min-w-0 max-w-[85%] flex-col items-end gap-1">
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{source.label}</span> · {formatTime(message.sent_at)}
                          {message.ml_status === "pending_review" ? " · em análise pelo ML" : ""}
                        </p>
                        <div
                          className={cn(
                            "w-fit max-w-full rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-[15px] leading-relaxed",
                            rejected ? "border border-dashed border-rose-300 bg-rose-50/60 text-muted-foreground line-through decoration-rose-400/60 dark:bg-rose-950/20" : source.bubble
                          )}
                        >
                          {content}
                        </div>
                        {rejected ? (
                          <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
                            Recusada pelo Mercado Livre
                            {message.moderation_reason ? ` (${MODERATION_LABELS[message.moderation_reason] ?? message.moderation_reason})` : ""}: o
                            comprador não recebeu.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  )}
                </Fragment>
              )
            })}
          </div>
          <ScrollToLatest />
        </div>
      </ScrollArea>

      {tone === "blocked" ? null : (
        <div className="shrink-0 border-t bg-muted/30 p-3 sm:p-4">
          <ReplyComposer
            key={`${conversation.id}-${conversation.status}-${conversation.ai_draft ?? ""}`}
            conversationId={conversation.id}
            initialText={draft}
            draftConfidence={draft && conversation.ai_confidence !== null ? Number(conversation.ai_confidence) : null}
            maxLength={conversation.max_message_length}
            nextHref={tone === "open" ? nextHref : null}
            canTeach={conversation.pending_count > 0}
          />
        </div>
      )}
    </Card>
  )
}
