import { BotIcon, InboxIcon, LayersIcon, TruckIcon, UserCheckIcon, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { Fragment } from "react"

import { AccountSelect } from "@/components/app/account-select"
import { InboxRowLink } from "@/components/perguntas/inbox-row-link"
import { ItemThumb } from "@/components/perguntas/question-detail"
import { QuestionSearch } from "@/components/perguntas/question-search"
import { shippingChip } from "@/lib/after-sale/order"
import {
  CONVERSATION_TABS,
  CONVERSATION_TONE_STYLES,
  conversationSummary,
  isShippingLate,
  type ConversationTab,
} from "@/lib/after-sale/presentation"
import { dayKey, dayLabel, formatNumber, listTime } from "@/lib/format"
import { cn } from "@/lib/utils"

export type ListConversation = {
  id: string
  ml_account_id: string
  pack_id: string
  buyer_nickname: string | null
  item_title: string | null
  item_thumbnail: string | null
  items_count: number
  status: string
  review_reason: string | null
  last_answer_source: string | null
  last_message_at: string | null
  last_message_from: string | null
  last_message_text: string | null
  pending_count: number
  shipping_status: string | null
  shipping_substatus: string | null
  estimated_delivery_at: string | null
  claim_open: boolean
  created_at: string
}

const TAB_STYLE: Record<ConversationTab, { icon: LucideIcon; iconBg: string; ring: string }> = {
  responder: { icon: InboxIcon, iconBg: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400", ring: "ring-amber-500" },
  agente: { icon: BotIcon, iconBg: "bg-primary/10 text-primary", ring: "ring-primary" },
  voce: { icon: UserCheckIcon, iconBg: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", ring: "ring-slate-500" },
  todas: { icon: LayersIcon, iconBg: "bg-muted text-muted-foreground", ring: "ring-foreground/40" },
}

export function ConversationTabs({
  active,
  counts,
  hrefFor,
}: {
  active: ConversationTab
  counts: Record<ConversationTab, number>
  hrefFor: (tab: ConversationTab) => string
}) {
  return (
    <nav aria-label="Filtrar conversas" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {(Object.keys(CONVERSATION_TABS) as ConversationTab[]).map((tab) => {
        const style = TAB_STYLE[tab]
        const isActive = tab === active
        const urgent = tab === "responder" && counts.responder > 0
        return (
          <Link
            key={tab}
            href={hrefFor(tab)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-xl bg-card p-3 transition-all sm:gap-3 sm:p-3.5",
              isActive ? cn("shadow-sm ring-2", style.ring) : "ring-1 ring-foreground/10 hover:ring-foreground/25"
            )}
          >
            <span className={cn("relative flex size-9 shrink-0 items-center justify-center rounded-lg sm:size-10", style.iconBg)}>
              <style.icon className="size-5" />
              {urgent ? <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-amber-500 ring-2 ring-card" /> : null}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-xl leading-none font-semibold tabular-nums sm:text-2xl">{formatNumber(counts[tab])}</span>
              <span className="mt-1 text-xs leading-tight text-muted-foreground sm:truncate sm:text-sm">{CONVERSATION_TABS[tab].label}</span>
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

export function ConversationToolbar({
  tab,
  total,
  search,
  hidden,
  clearSearchHref,
  accounts,
}: {
  tab: ConversationTab
  total: number
  search: string
  hidden: Record<string, string>
  clearSearchHref: string
  accounts: { id: string; nickname: string }[] | null
}) {
  return (
    <div className="shrink-0 border-b">
      <div className="flex flex-col gap-2 p-3 sm:flex-row">
        <QuestionSearch
          action="/pos-venda"
          placeholder="Buscar comprador, produto ou nº da venda"
          value={search}
          hidden={hidden}
          clearHref={clearSearchHref}
        />
        {accounts ? <AccountSelect allowAll accounts={accounts} resetParams={["pagina", "c"]} /> : null}
      </div>
      <div className="pb-1.5 pl-4 text-xs text-muted-foreground">
        <span className="font-medium text-foreground/80">{CONVERSATION_TABS[tab].label}</span>
        <span className="tabular-nums"> · {formatNumber(total)}</span>
        <span> · mais recentes primeiro</span>
      </div>
    </div>
  )
}

export function ConversationList({
  conversations,
  selectedId,
  accounts,
  showAccount,
  hrefFor,
}: {
  conversations: ListConversation[]
  selectedId: string | null
  accounts: Record<string, string>
  showAccount: boolean
  hrefFor: (id: string) => string
}) {
  const now = new Date()
  return (
    <ul className="flex flex-col">
      {conversations.map((conversation, index) => {
        const at = conversation.last_message_at ?? conversation.created_at
        const previous = conversations[index - 1]
        const newDay = !previous || dayKey(previous.last_message_at ?? previous.created_at) !== dayKey(at)
        const summary = conversationSummary(conversation)
        const style = CONVERSATION_TONE_STYLES[summary.tone]
        const selected = conversation.id === selectedId
        const late = isShippingLate(conversation, now)
        const chip = late ? "Envio atrasado" : shippingChip(conversation.shipping_status, conversation.shipping_substatus)
        const extraItems = conversation.items_count > 1 ? ` + ${conversation.items_count - 1}` : ""
        return (
          <Fragment key={conversation.id}>
            {newDay ? (
              <li className="sticky top-0 z-10 border-b bg-card/95 px-4 py-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur-sm">
                {dayLabel(at, now)}
              </li>
            ) : null}
            <li className={cn(!newDay && "border-t")}>
              <InboxRowLink
                href={hrefFor(conversation.id)}
                className={cn(
                  "relative flex gap-3 px-4 py-3 transition-colors hover:bg-muted/60",
                  selected && "lg:bg-primary/[0.06] lg:hover:bg-primary/[0.06]"
                )}
              >
                {selected ? <span className="absolute inset-y-0 left-0 hidden w-[3px] rounded-r bg-primary lg:block" aria-hidden /> : null}
                <ItemThumb src={conversation.item_thumbnail} size="sm" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-start justify-between gap-2">
                    <span className={cn("truncate text-sm", summary.tone === "open" ? "font-semibold" : "font-medium text-foreground/90")}>
                      {conversation.buyer_nickname ?? `Venda ${conversation.pack_id}`}
                      {conversation.pending_count > 1 && summary.tone === "open" ? (
                        <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-px text-[10px] font-semibold text-white tabular-nums">
                          {conversation.pending_count}
                        </span>
                      ) : null}
                    </span>
                    <time dateTime={at} className="shrink-0 pt-0.5 text-[11px] text-muted-foreground tabular-nums">
                      {listTime(at, now)}
                    </time>
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {(conversation.item_title ?? "Produto") + extraItems}
                    {showAccount && accounts[conversation.ml_account_id] ? ` · ${accounts[conversation.ml_account_id]}` : ""}
                  </span>
                  {summary.preview ? (
                    <span className="mt-1 line-clamp-2 text-xs leading-snug text-foreground/80">{summary.preview}</span>
                  ) : null}
                  <span className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <span className={cn("inline-flex shrink-0 items-center gap-1.5 font-medium", style.text)}>
                      <span className={cn("size-1.5 rounded-full", style.dot)} />
                      {summary.label}
                    </span>
                    {chip ? (
                      <span className={cn("inline-flex items-center gap-1", late ? "font-medium text-rose-600 dark:text-rose-400" : "text-muted-foreground")}>
                        <TruckIcon className="size-3" />
                        {chip}
                      </span>
                    ) : null}
                    {conversation.claim_open ? <span className="font-medium text-rose-600 dark:text-rose-400">Reclamação</span> : null}
                  </span>
                </span>
              </InboxRowLink>
            </li>
          </Fragment>
        )
      })}
    </ul>
  )
}
