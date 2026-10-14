import { InboxIcon, SearchXIcon } from "lucide-react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { PageHeader } from "@/components/app/page-header"
import { InboxList, InboxListFooter, InboxListToolbar } from "@/components/perguntas/inbox-list"
import { InboxTabs } from "@/components/perguntas/inbox-tabs"
import { LiveRefresh } from "@/components/perguntas/live-refresh"
import { QuestionDetail, type AccountInfo } from "@/components/perguntas/question-detail"
import { SyncButton } from "@/components/perguntas/sync-button"
import { Card } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { ScrollArea } from "@/components/ui/scroll-area"
import { requireSection } from "@/lib/dal/app-context"
import {
  DEFAULT_INBOX_TAB,
  inboxHref,
  pageRange,
  parseInboxOrder,
  parseInboxTab,
  parseItemFilter,
  parsePage,
  sanitizeSearch,
  type InboxState,
  type InboxTab,
} from "@/lib/questions/presentation"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Perguntas" }

const PAGE_SIZE = 50
const LIST_FIELDS =
  "id, ml_account_id, item_id, item_title, item_permalink, item_thumbnail, question_text, question_created_at, created_at, status, review_reason, ai_draft, ai_confidence, ai_reason, answer_text, answer_source, answered_at, fallback_reason"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const EMPTY: Record<InboxTab, { title: string; description: string }> = {
  responder: {
    title: "Tudo respondido",
    description: "Quando a IA deixar uma pergunta para você, ela aparece aqui com um rascunho pronto.",
  },
  ia: { title: "Nenhuma resposta da IA ainda", description: "As respostas que a IA enviar sozinha aparecem aqui." },
  voce: { title: "Nada por aqui", description: "As perguntas que você responder (aqui ou no Mercado Livre) aparecem aqui." },
  todas: { title: "Nenhuma pergunta ainda", description: "As perguntas novas dos seus anúncios chegam aqui automaticamente." },
}

export default async function QuestionsPage({ searchParams }: PageProps<"/perguntas">) {
  const context = await requireSection("perguntas")
  const params = await searchParams
  const organizationId = context.organization.id

  const supabase = await createClient()
  const { data: accountRows, error: accountsError } = await supabase
    .from("ml_accounts")
    .select("id, nickname, ml_user_id, answer_greeting, answer_signature")
    .eq("organization_id", organizationId)
    .order("created_at")
  if (accountsError) throw accountsError

  const accounts: Record<string, AccountInfo> = Object.fromEntries(
    accountRows.map((account) => [
      account.id,
      {
        nickname: account.nickname || `Conta ${account.ml_user_id}`,
        greeting: account.answer_greeting,
        signature: account.answer_signature,
      },
    ])
  )
  const showAccount = accountRows.length > 1

  const state: InboxState = {
    tab: parseInboxTab(params.aba),
    account: typeof params.conta === "string" && accounts[params.conta] ? params.conta : null,
    item: parseItemFilter(params.anuncio),
    search: sanitizeSearch(params.busca),
    order: parseInboxOrder(params.ordem),
    page: parsePage(params.pagina),
    question: null,
    fallback: params.padrao === "1",
  }
  const { tab, item, search, order, page } = state
  const requestedId = typeof params.q === "string" && UUID.test(params.q) ? params.q : null
  /** Link para outro estado da caixa de entrada (sem pergunta aberta, a menos que se peça). */
  const href = (change: Partial<InboxState>) => inboxHref({ ...state, ...change })

  // Mesmo recorte (organização + conta + anúncio) para a lista e para os contadores dos filtros.
  const scoped = <T extends { eq: (column: string, value: string) => T }>(query: T) => {
    let next = query.eq("organization_id", organizationId)
    if (state.account) next = next.eq("ml_account_id", state.account)
    if (item) next = next.eq("item_id", item)
    return next
  }
  const byTab = <T extends { eq: (c: string, v: string) => T; in: (c: string, v: string[]) => T }>(query: T, key: InboxTab) => {
    if (key === "responder") return query.in("status", ["needs_review", "failed"])
    if (key === "ia") return query.eq("status", "answered").eq("answer_source", "ai")
    if (key === "voce") return query.in("status", ["answered", "answered_outside"]).in("answer_source", ["manual", "external"])
    return query
  }
  const countFor = (key: InboxTab) => byTab(scoped(supabase.from("ml_questions").select("id", { count: "exact", head: true })), key)

  // Ordem pela data em que o comprador perguntou (perguntas ainda sem data = recém-chegadas, ficam como mais novas).
  const ascending = order === "antigas"
  // "Só mensagem padrão": respostas do modo "responder sempre" em que a IA não tinha a informação.
  const onlyFallback = tab === "ia" && Boolean(state.fallback)
  let listQuery = byTab(scoped(supabase.from("ml_questions").select(LIST_FIELDS, { count: "exact" })), tab)
  if (onlyFallback) listQuery = listQuery.not("fallback_reason", "is", null)
  listQuery = listQuery
    .order("question_created_at", { ascending, nullsFirst: !ascending })
    .order("created_at", { ascending })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
  if (search) {
    listQuery = listQuery.or(`question_text.ilike.%${search}%,item_title.ilike.%${search}%,item_id.ilike.%${search}%`)
  }

  const [listResult, responder, ia, voce, todas, fallbackCount, requested, itemInfo] = await Promise.all([
    listQuery,
    countFor("responder"),
    countFor("ia"),
    countFor("voce"),
    countFor("todas"),
    tab === "ia" ? countFor("ia").not("fallback_reason", "is", null) : Promise.resolve({ count: 0, error: null }),
    requestedId
      ? supabase.from("ml_questions").select(LIST_FIELDS).eq("organization_id", organizationId).eq("id", requestedId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    item
      ? supabase
          .from("ml_questions")
          .select("item_title, item_thumbnail")
          .eq("organization_id", organizationId)
          .eq("item_id", item)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  // Página que deixou de existir (ex.: as perguntas foram respondidas): volta para a primeira.
  if (listResult.error?.code === "PGRST103" && page > 1) redirect(href({ page: 1, question: requestedId }))
  if (listResult.error) throw listResult.error
  if (requested.error) throw requested.error
  if (itemInfo.error) throw itemInfo.error

  const questions = listResult.data
  const total = listResult.count ?? 0
  const range = pageRange(page, PAGE_SIZE, total)
  const counts: Record<InboxTab, number> = {
    responder: responder.count ?? 0,
    ia: ia.count ?? 0,
    voce: voce.count ?? 0,
    todas: todas.count ?? 0,
  }

  const selected = requested.data ?? questions[0] ?? null
  const explicit = Boolean(requested.data)
  const position = selected ? questions.findIndex((question) => question.id === selected.id) : -1
  const next =
    position >= 0 ? (questions[position + 1] ?? questions[position - 1] ?? null) : (questions.find((q) => q.id !== selected?.id) ?? null)

  // Pergunta respondida com a mensagem padrão: carrega a resposta já ensinada a partir dela (para editar).
  let taught: { answer: string; allItems: boolean } | null = null
  if (selected?.fallback_reason && selected.status === "answered" && selected.answer_source === "ai") {
    const { data: example, error: exampleError } = await supabase
      .from("ai_examples")
      .select("answer_text, item_id")
      .eq("organization_id", organizationId)
      .eq("source_question_id", selected.id)
      .limit(1)
      .maybeSingle()
    if (exampleError) throw exampleError
    if (example) taught = { answer: example.answer_text, allItems: example.item_id === null }
  }

  const hidden: Record<string, string> = {}
  if (tab !== DEFAULT_INBOX_TAB) hidden.aba = tab
  if (state.account) hidden.conta = state.account
  if (item) hidden.anuncio = item
  if (order !== "recentes") hidden.ordem = order
  if (onlyFallback) hidden.padrao = "1"

  return (
    <>
      <LiveRefresh organizationId={organizationId} />
      <PageHeader
        title="Perguntas"
        description="Tudo o que os compradores perguntaram, quem respondeu e o que ainda está esperando você."
        actions={<SyncButton />}
      />

      <InboxTabs active={tab} counts={counts} hrefFor={(key) => href({ tab: key, search: "", page: 1 })} />

      {/* No computador as duas colunas ocupam o resto da tela e rolam por conta própria (ver layout da área logada). */}
      <div
        data-fill-viewport
        className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(320px,2fr)_minmax(0,3fr)] lg:grid-rows-[minmax(0,1fr)]"
      >
        <Card className={cn("gap-0 py-0 lg:min-h-0", explicit ? "hidden lg:flex" : "flex")}>
          <InboxListToolbar
            tab={tab}
            total={total}
            search={search}
            hidden={hidden}
            clearSearchHref={href({ search: "", page: 1 })}
            order={order}
            toggleOrderHref={href({ order: ascending ? "recentes" : "antigas", page: 1 })}
            item={item ? { id: item, title: itemInfo.data?.item_title ?? null, thumbnail: itemInfo.data?.item_thumbnail ?? null } : null}
            clearItemHref={href({ item: null, page: 1 })}
            fallbackFilter={
              tab === "ia" && (onlyFallback || (fallbackCount.count ?? 0) > 0)
                ? { active: onlyFallback, count: fallbackCount.count ?? 0, href: href({ fallback: !onlyFallback, page: 1 }) }
                : null
            }
            accounts={showAccount ? accountRows.map((account) => ({ id: account.id, nickname: accounts[account.id].nickname })) : null}
          />
          {questions.length ? (
            <>
              <ScrollArea
                key={[tab, state.account, item, search, order, page].join("|")}
                className="lg:min-h-0 lg:flex-1"
              >
                <InboxList
                  questions={questions}
                  selectedId={selected?.id ?? null}
                  accounts={accounts}
                  showAccount={showAccount}
                  hrefFor={(id) => href({ question: id })}
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
                <EmptyDescription>
                  {search
                    ? `Nenhuma pergunta com "${search}" nesta aba.`
                    : item
                      ? "Nenhuma pergunta deste anúncio nesta aba."
                      : EMPTY[tab].description}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </Card>

        {selected ? (
          <QuestionDetail
            question={selected}
            account={accounts[selected.ml_account_id]}
            taught={taught}
            showAccount={showAccount}
            backHref={href({})}
            nextHref={next ? href({ question: next.id }) : null}
            itemHref={
              selected.item_id && selected.item_id !== item
                ? href({ tab: "todas", item: selected.item_id, search: "", page: 1, question: selected.id })
                : null
            }
            className={cn("lg:min-h-0", explicit ? "flex" : "hidden lg:flex")}
          />
        ) : (
          <Card className="hidden items-center justify-center lg:flex">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <InboxIcon />
                </EmptyMedia>
                <EmptyTitle>Nenhuma pergunta selecionada</EmptyTitle>
                <EmptyDescription>Escolha uma pergunta na lista para ver a conversa.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </Card>
        )}
      </div>
    </>
  )
}
