import {
  ArrowLeftIcon,
  ExternalLinkIcon,
  LockIcon,
  MapPinIcon,
  MessageCircleQuestionIcon,
  MessagesSquareIcon,
  NotebookPenIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
  StoreIcon,
} from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { CustomerNoteForm } from "@/components/clientes/customer-note-form"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { conversationHref, conversationSummary, CONVERSATION_TONE_STYLES, saleUrl } from "@/lib/after-sale/presentation"
import {
  customerDisplayName,
  customerInitials,
  customerLocation,
  formatMoney,
  groupPurchases,
  orderStatusLabel,
  purchaseTone,
  type PurchaseTone,
} from "@/lib/customers/presentation"
import { requireSection } from "@/lib/dal/app-context"
import { getCustomerDetail } from "@/lib/dal/customers"
import { formatDate, formatDateTime, formatNumber, pluralize, timeAgo } from "@/lib/format"
import { requiredPlanName } from "@/lib/plans/plans"
import { inboxHref, questionTone, TONE_STYLES } from "@/lib/questions/presentation"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Cliente" }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const TONE_BADGE: Record<PurchaseTone, string> = {
  paid: "border-primary/30 text-brand-teal-ink",
  partial: "border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400",
  cancelled: "border-border text-muted-foreground",
  pending: "border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400",
}

export default async function CustomerPage({ params }: PageProps<"/clientes/[id]">) {
  const context = await requireSection("clientes")
  const { id } = await params
  if (!UUID.test(id)) notFound()
  const afterSale = context.features.pos_venda
  const detail = await getCustomerDetail(context.organization.id, id, { afterSale })
  if (!detail) notFound()

  const { customer, orders, questions, conversations, noteAuthor } = detail
  const name = customerDisplayName(customer)
  const location = customerLocation(customer.city, customer.state)
  const accountName = customer.ml_accounts?.nickname || (customer.ml_accounts ? "Conta " + customer.ml_accounts.ml_user_id : null)
  const purchases = groupPurchases(orders)
  const numbers = [
    { label: "Compras", value: formatNumber(customer.purchases_count) },
    { label: "Total em compras", value: formatMoney(customer.total_spent, customer.currency_id) },
    { label: "Primeira compra", value: customer.first_order_at ? formatDate(customer.first_order_at, "short") : "—" },
    { label: "Última compra", value: customer.last_order_at ? formatDate(customer.last_order_at, "short") : "—" },
  ]

  return (
    <>
      <div className="flex min-w-0 items-start gap-3">
        <Link
          href="/clientes"
          className="mt-1.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          aria-label="Voltar para Clientes"
        >
          <ArrowLeftIcon className="size-4" />
        </Link>
        <Avatar size="lg" className="mt-0.5">
          <AvatarFallback className="bg-primary/10 font-semibold text-brand-teal-ink">{customerInitials(customer)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="truncate text-2xl font-semibold tracking-tight">{name}</h2>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {customer.nickname && customer.nickname !== name ? <span>@{customer.nickname}</span> : null}
            {location ? (
              <span className="inline-flex items-center gap-1">
                <MapPinIcon className="size-3.5" />
                {location}
              </span>
            ) : null}
            {accountName ? (
              <span className="inline-flex items-center gap-1">
                <StoreIcon className="size-3.5" />
                {accountName}
              </span>
            ) : null}
            {customer.purchases_count >= 2 ? (
              <Badge variant="outline" className="border-primary/30 text-brand-teal-ink">
                Voltou a comprar
              </Badge>
            ) : null}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingBagIcon className="size-4 text-primary" />
                Compras
              </CardTitle>
              <CardDescription>
                Vendas do mesmo carrinho aparecem juntas. Canceladas ficam na lista, mas não contam no total.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {purchases.length === 0 ? (
                <p className="px-4 text-sm text-muted-foreground">Nenhuma compra registrada.</p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {purchases.map((purchase) => (
                    <li key={purchase.key} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <ul className="flex flex-col gap-0.5">
                          {(purchase.items.length ? purchase.items : [{ id: null, title: "Produto", variation: null, quantity: 1 }]).map(
                            (item, index) => (
                              <li key={(item.id ?? "item") + ":" + index} className="text-sm">
                                <span className={cn("font-medium", !purchase.valid && "text-muted-foreground line-through")}>
                                  {item.quantity > 1 ? item.quantity + "× " : null}
                                  {item.title}
                                </span>
                                {item.variation ? <span className="text-muted-foreground"> · {item.variation}</span> : null}
                              </li>
                            )
                          )}
                        </ul>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <span>{purchase.orderedAt ? formatDateTime(purchase.orderedAt) : "Data não informada"}</span>
                          <span>·</span>
                          <a
                            href={saleUrl(String(purchase.orderIds[0]), String(purchase.key))}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 hover:text-foreground"
                          >
                            Venda {purchase.key} <ExternalLinkIcon className="size-3" />
                          </a>
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                        <span className={cn("text-sm font-semibold tabular-nums", !purchase.valid && "text-muted-foreground")}>
                          {formatMoney(purchase.total, purchase.currency)}
                        </span>
                        <span className="flex flex-wrap gap-1">
                          <Badge variant="outline" className={TONE_BADGE[purchaseTone(purchase.status)]}>
                            {orderStatusLabel(purchase.status)}
                          </Badge>
                          {purchase.hasClaim ? (
                            <Badge variant="outline" className="border-rose-300 text-rose-700 dark:border-rose-900 dark:text-rose-400">
                              Reclamação
                            </Badge>
                          ) : null}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircleQuestionIcon className="size-4 text-primary" />
                Perguntas que fez
              </CardTitle>
              <CardDescription>Perguntas deste comprador nos seus anúncios (as 20 mais recentes).</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {questions.length === 0 ? (
                <p className="px-4 text-sm text-muted-foreground">Nenhuma pergunta deste comprador na maanu.</p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {questions.map((question) => {
                    const tone = questionTone(question.status, question.answer_source, question.fallback_reason)
                    const askedAt = question.question_created_at ?? question.created_at
                    return (
                      <li key={question.id}>
                        <Link
                          href={inboxHref({ tab: "todas", account: null, item: null, search: "", order: "recentes", page: 1, question: question.id })}
                          className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50"
                        >
                          <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", TONE_STYLES[tone].dot)} aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="line-clamp-2 text-sm">{question.question_text}</span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {[question.item_title ?? question.item_id, timeAgo(askedAt), TONE_STYLES[tone].label].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessagesSquareIcon className="size-4 text-primary" />
                Conversas do pós-venda
              </CardTitle>
              <CardDescription>Mensagens deste comprador depois da compra.</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {!afterSale ? (
                <Empty className="py-6">
                  <EmptyHeader>
                    <EmptyTitle className="flex items-center gap-2 text-base">
                      <LockIcon className="size-4" />
                      Disponível a partir do plano {requiredPlanName("pos_venda")}
                    </EmptyTitle>
                    <EmptyDescription>
                      Com o pós-venda, as conversas com quem já comprou aparecem aqui e o agente responde sozinho.
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Link href="/assinatura?recurso=pos_venda" className={buttonVariants({ size: "sm" })}>
                      Conhecer o plano {requiredPlanName("pos_venda")}
                    </Link>
                  </EmptyContent>
                </Empty>
              ) : conversations.length === 0 ? (
                <p className="px-4 text-sm text-muted-foreground">Nenhuma conversa de pós-venda com este comprador.</p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {conversations.map((conversation) => {
                    const summary = conversationSummary(conversation)
                    return (
                      <li key={conversation.id}>
                        <Link
                          href={conversationHref({ tab: "todas", account: null, search: "", page: 1, conversation: conversation.id })}
                          className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50"
                        >
                          <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", CONVERSATION_TONE_STYLES[summary.tone].dot)} aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{conversation.item_title ?? "Venda " + conversation.pack_id}</span>
                            {summary.preview ? (
                              <span className="line-clamp-1 text-sm text-muted-foreground">{summary.preview}</span>
                            ) : null}
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {[summary.label, conversation.last_message_at ? timeAgo(conversation.last_message_at) : null]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Resumo</CardTitle>
              <CardDescription>
                {customer.purchases_count > 0
                  ? pluralize(customer.purchases_count, "compra paga", "compras pagas") + " nesta loja"
                  : "Nenhuma compra paga nesta loja"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-3">
                {numbers.map((item) => (
                  <div key={item.label} className="rounded-xl bg-muted/50 px-3 py-2">
                    <dt className="text-xs text-muted-foreground">{item.label}</dt>
                    <dd className="text-base font-semibold tabular-nums">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <NotebookPenIcon className="size-4 text-primary" />
                Observações
              </CardTitle>
              <CardDescription>
                Anotações internas da sua equipe. O comprador não vê.
                {customer.notes_updated_at ? (
                  <span className="mt-1 block text-xs">
                    Atualizado por {customer.notes_updated_by === context.user.id ? "você" : (noteAuthor ?? "alguém da equipe")} em{" "}
                    {formatDateTime(customer.notes_updated_at)}
                  </span>
                ) : null}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CustomerNoteForm key={customer.notes_updated_at ?? "novo"} customerId={customer.id} initialNote={customer.notes} />
            </CardContent>
          </Card>

          <p className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
            <ShieldCheckIcon className="mt-px size-3.5 shrink-0" />
            Dados do Mercado Livre. Atenda pelo Mercado Livre: o ML não permite contato fora da plataforma.
          </p>
        </div>
      </div>
    </>
  )
}
