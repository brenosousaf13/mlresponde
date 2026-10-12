import { InboxIcon, MessagesSquareIcon, SearchXIcon, Settings2Icon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { PageHeader } from "@/components/app/page-header"
import { InboxListFooter } from "@/components/perguntas/inbox-list"
import { LiveRefresh } from "@/components/perguntas/live-refresh"
import { ConversationDetail } from "@/components/pos-venda/conversation-detail"
import { ConversationList, ConversationTabs, ConversationToolbar } from "@/components/pos-venda/conversation-list"
import { AfterSaleSyncButton } from "@/components/pos-venda/sync-button"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  TAB_FILTERS,
  conversationHref,
  conversationSearchFilter,
  parseConversationTab,
  type ConversationInboxState,
  type ConversationTab,
} from "@/lib/after-sale/presentation"
import { requireSection } from "@/lib/dal/app-context"
import { pageRange, parsePage, sanitizeSearch } from "@/lib/questions/presentation"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Pós-venda" }

const PAGE_SIZE = 50
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LIST_FIELDS =
  "id, ml_account_id, pack_id, buyer_nickname, item_title, item_thumbnail, items_count, status, review_reason, last_answer_source, last_message_at, last_message_from, last_message_text, pending_count, shipping_status, shipping_substatus, estimated_delivery_at, claim_open, created_at"
const DETAIL_FIELDS =
  "id, ml_account_id, pack_id, order_ids, buyer_nickname, item_title, item_thumbnail, item_permalink, order_summary, status, review_reason, last_answer_source, ml_substatus, claim_open, max_message_length, ai_draft, ai_confidence, ai_reason, ai_topic, pending_count, shipping_status, estimated_delivery_at, last_error"

const EMPTY: Record<ConversationTab, { title: string; description: string }> = {
  responder: {
    title: "Nenhum comprador esperando",
    description: "Quando o agente deixar uma conversa para você, ela aparece aqui com um rascunho pronto.",
  },
  agente: { title: "O agente ainda não respondeu ninguém", description: "As conversas que o agente responder sozinho aparecem aqui." },
  voce: { title: "Nada por aqui", description: "As conversas que você responder (aqui ou no Mercado Livre) aparecem aqui." },
  todas: {
    title: "Nenhuma conversa ainda",
    description: "Quando um comprador mandar mensagem sobre uma compra, a conversa chega aqui automaticamente.",
  },
}

export default async function AfterSalePage({ searchParams }: PageProps<"/pos-venda">) {
  const context = await requireSection("pos_venda")
  const params = await searchParams
  const organizationId = context.organization.id

  const supabase = await createClient()
  const { data: accountRows, error: accountsError } = await supabase
    .from("ml_accounts")
    .select("id, nickname, ml_user_id, status, after_sale_enabled, after_sale_signature")
    .eq("organization_id", organizationId)
    .neq("status", "disconnected")
    .order("created_at")
  if (accountsError) throw accountsError

  const nicknames: Record<string, string> = Object.fromEntries(
    accountRows.map((account) => [account.id, account.nickname || `Conta ${account.ml_user_id}`])
  )
  const showAccount = accountRows.length > 1
  const activeAccounts = accountRows.filter((account) => account.status === "active")
  const agentsOn = activeAccounts.filter((account) => account.after_sale_enabled).length

  const state: ConversationInboxState = {
    tab: parseConversationTab(params.aba),
    account: typeof params.conta === "string" && nicknames[params.conta] ? params.conta : null,
    search: sanitizeSearch(params.busca),
    page: parsePage(params.pagina),
    conversation: null,
  }
  const { tab, search, page } = state
  const requestedId = typeof params.c === "string" && UUID.test(params.c) ? params.c : null
  const href = (change: Partial<ConversationInboxState>) => conversationHref({ ...state, ...change })

  const scoped = <T extends { eq: (column: string, value: string) => T }>(query: T) => {
    let next = query.eq("organization_id", organizationId)
    if (state.account) next = next.eq("ml_account_id", state.account)
    return next
  }
  const byTab = <T extends { in: (column: string, values: string[]) => T }>(query: T, key: ConversationTab) => {
    const filter = TAB_FILTERS[key]
    let next = query
    if (filter.statuses) next = next.in("status", filter.statuses)
    if (filter.sources) next = next.in("last_answer_source", filter.sources)
    return next
  }
  const countFor = (key: ConversationTab) =>
    byTab(scoped(supabase.from("ml_conversations").select("id", { count: "exact", head: true })), key)

  let listQuery = byTab(scoped(supabase.from("ml_conversations").select(LIST_FIELDS, { count: "exact" })), tab)
  const searchFilter = conversationSearchFilter(search)
  if (searchFilter) listQuery = listQuery.or(searchFilter)
  listQuery = listQuery
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  const [listResult, responder, agente, voce, todas, requested] = await Promise.all([
    listQuery,
    countFor("responder"),
    countFor("agente"),
    countFor("voce"),
    countFor("todas"),
    requestedId
      ? supabase.from("ml_conversations").select(DETAIL_FIELDS).eq("organization_id", organizationId).eq("id", requestedId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  if (listResult.error?.code === "PGRST103" && page > 1) redirect(href({ page: 1, conversation: requestedId }))
  if (listResult.error) throw listResult.error
  if (requested.error) throw requested.error

  const conversations = listResult.data
  const total = listResult.count ?? 0
  const range = pageRange(page, PAGE_SIZE, total)
  const counts: Record<ConversationTab, number> = {
    responder: responder.count ?? 0,
    agente: agente.count ?? 0,
    voce: voce.count ?? 0,
    todas: todas.count ?? 0,
  }

  // Conversa aberta: a pedida na URL ou a primeira da lista.
  const selectedId = requested.data?.id ?? conversations[0]?.id ?? null
  const explicit = Boolean(requested.data)
  const [selectedResult, messagesResult] = await Promise.all([
    requested.data || !selectedId
      ? Promise.resolve({ data: requested.data, error: null })
      : supabase.from("ml_conversations").select(DETAIL_FIELDS).eq("organization_id", organizationId).eq("id", selectedId).maybeSingle(),
    selectedId
      ? supabase
          .from("ml_conversation_messages")
          .select("id, ml_message_id, sender, source, text, attachments, ml_status, moderation_status, moderation_reason, sent_at")
          .eq("conversation_id", selectedId)
          .order("sent_at", { ascending: true })
          .order("created_at", { ascending: true })
          .limit(500)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (selectedResult.error) throw selectedResult.error
  if (messagesResult.error) throw messagesResult.error
  const selected = selectedResult.data

  const position = selected ? conversations.findIndex((row) => row.id === selected.id) : -1
  const next = position >= 0 ? (conversations[position + 1] ?? conversations[position - 1] ?? null) : null
  const selectedAccount = selected ? accountRows.find((account) => account.id === selected.ml_account_id) : null

  const hidden: Record<string, string> = {}
  if (tab !== "responder") hidden.aba = tab
  if (state.account) hidden.conta = state.account

  return (
    <>
      <LiveRefresh organizationId={organizationId} table="ml_conversations" />
      <PageHeader
        title="Pós-venda"
        description="Mensagens de quem já comprou: o agente responde com base no pedido, no envio e no histórico da conversa."
        actions={
          <>
            <AfterSaleSyncButton />
            <Link href="/pos-venda/agente" className={cn(buttonVariants({ variant: "outline" }), "bg-card")}>
              <Settings2Icon data-icon="inline-start" />
              Agente
              <Badge variant={agentsOn ? "default" : "secondary"} className={cn("ml-0.5", agentsOn && "bg-emerald-600")}>
                {agentsOn ? "ligado" : "pausado"}
              </Badge>
            </Link>
          </>
        }
      />

      {!agentsOn && activeAccounts.length ? (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/15 bg-primary/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2.5">
            <MessagesSquareIcon className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              <span className="font-medium">O agente de pós-venda está pausado.</span>{" "}
              <span className="text-muted-foreground">
                As mensagens chegam aqui para você responder. Configure e ligue o agente para ele responder sozinho.
              </span>
            </span>
          </p>
          <Link href="/pos-venda/agente" className={cn(buttonVariants({ size: "sm" }), "shrink-0")}>
            Configurar agente
          </Link>
        </div>
      ) : null}

      <ConversationTabs active={tab} counts={counts} hrefFor={(key) => href({ tab: key, search: "", page: 1 })} />

      <div
        data-fill-viewport
        className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(320px,2fr)_minmax(0,3fr)] lg:grid-rows-[minmax(0,1fr)]"
      >
        <Card className={cn("gap-0 py-0 lg:min-h-0", explicit ? "hidden lg:flex" : "flex")}>
          <ConversationToolbar
            tab={tab}
            total={total}
            search={search}
            hidden={hidden}
            clearSearchHref={href({ search: "", page: 1 })}
            accounts={showAccount ? accountRows.map((account) => ({ id: account.id, nickname: nicknames[account.id] })) : null}
          />
          {conversations.length ? (
            <>
              <ScrollArea key={[tab, state.account, search, page].join("|")} className="lg:min-h-0 lg:flex-1">
                <ConversationList
                  conversations={conversations}
                  selectedId={selected?.id ?? null}
                  accounts={nicknames}
                  showAccount={showAccount}
                  hrefFor={(id) => href({ conversation: id })}
                />
              </ScrollArea>
              <InboxListFooter
                from={range.from}
                to={range.to}
                total={total}
                prevHref={page > 1 ? href({ page: page - 1 }) : null}
                nextHref={page < range.totalPages ? href({ page: page + 1 }) : null}
              />
            </>
          ) : (
            <Empty className="py-12 lg:flex-1">
              <EmptyHeader>
                <EmptyMedia variant="icon">{search ? <SearchXIcon /> : <InboxIcon />}</EmptyMedia>
                <EmptyTitle>{search ? "Nada encontrado" : EMPTY[tab].title}</EmptyTitle>
                <EmptyDescription>{search ? `Nenhuma conversa com "${search}" nesta aba.` : EMPTY[tab].description}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </Card>

        {selected ? (
          <ConversationDetail
            conversation={selected}
            messages={messagesResult.data ?? []}
            accountNickname={showAccount ? (nicknames[selected.ml_account_id] ?? null) : null}
            signature={selectedAccount?.after_sale_signature ?? ""}
            backHref={href({})}
            nextHref={next ? href({ conversation: next.id }) : null}
            className={cn("lg:min-h-0", explicit ? "flex" : "hidden lg:flex")}
          />
        ) : (
          <Card className="hidden items-center justify-center lg:flex">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessagesSquareIcon />
                </EmptyMedia>
                <EmptyTitle>Nenhuma conversa selecionada</EmptyTitle>
                <EmptyDescription>Escolha uma conversa na lista para ver o histórico e responder.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </Card>
        )}
      </div>
    </>
  )
}
