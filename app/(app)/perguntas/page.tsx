import { InboxIcon, SearchXIcon } from "lucide-react"
import type { Metadata } from "next"

import { AccountSelect } from "@/components/app/account-select"
import { PageHeader } from "@/components/app/page-header"
import { InboxList } from "@/components/perguntas/inbox-list"
import { InboxTabs } from "@/components/perguntas/inbox-tabs"
import { LiveRefresh } from "@/components/perguntas/live-refresh"
import { QuestionDetail, type AccountInfo } from "@/components/perguntas/question-detail"
import { QuestionSearch } from "@/components/perguntas/question-search"
import { SyncButton } from "@/components/perguntas/sync-button"
import { Card } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { requireSection } from "@/lib/dal/app-context"
import { INBOX_TABS, parseInboxTab, sanitizeSearch, type InboxTab } from "@/lib/questions/presentation"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Perguntas" }

const PAGE_SIZE = 20
const LIST_FIELDS =
  "id, ml_account_id, item_id, item_title, item_permalink, item_thumbnail, question_text, question_created_at, created_at, status, review_reason, ai_draft, ai_confidence, ai_reason, answer_text, answer_source, answered_at"
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
  const tab = parseInboxTab(params.aba)
  const page = Math.max(1, Number.parseInt(String(params.pagina ?? "1"), 10) || 1)
  const search = sanitizeSearch(params.busca)
  const requestedId = typeof params.q === "string" && UUID.test(params.q) ? params.q : null
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
  const accountFilter = typeof params.conta === "string" && accounts[params.conta] ? params.conta : null
  const showAccount = accountRows.length > 1

  // Mesmo filtro (organização + conta) para a lista e os contadores.
  const scoped = <T extends { eq: (column: string, value: string) => T }>(query: T) =>
    accountFilter ? query.eq("ml_account_id", accountFilter) : query
  const byTab = <T extends { eq: (c: string, v: string) => T; in: (c: string, v: string[]) => T }>(query: T, key: InboxTab) => {
    if (key === "responder") return query.in("status", ["needs_review", "failed"])
    if (key === "ia") return query.eq("status", "answered").eq("answer_source", "ai")
    if (key === "voce") return query.in("status", ["answered", "answered_outside"]).in("answer_source", ["manual", "external"])
    return query
  }
  const countFor = (key: InboxTab) =>
    byTab(scoped(supabase.from("ml_questions").select("id", { count: "exact", head: true }).eq("organization_id", organizationId)), key)

  let listQuery = byTab(
    scoped(
      supabase
        .from("ml_questions")
        .select(LIST_FIELDS, { count: "exact" })
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    ),
    tab
  )
  if (search) listQuery = listQuery.or(`question_text.ilike.%${search}%,item_title.ilike.%${search}%`)

  const [listResult, responder, ia, voce, todas, requested] = await Promise.all([
    listQuery,
    countFor("responder"),
    countFor("ia"),
    countFor("voce"),
    countFor("todas"),
    requestedId
      ? supabase.from("ml_questions").select(LIST_FIELDS).eq("organization_id", organizationId).eq("id", requestedId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  if (listResult.error) throw listResult.error
  if (requested.error) throw requested.error

  const questions = listResult.data
  const total = listResult.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
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

  const hrefFor = (change: { aba?: InboxTab; pagina?: number; q?: string | null; busca?: string }) => {
    const query = new URLSearchParams()
    const nextTab = change.aba ?? tab
    if (nextTab !== "responder") query.set("aba", nextTab)
    if (accountFilter) query.set("conta", accountFilter)
    const nextSearch = change.busca ?? (change.aba ? "" : search)
    if (nextSearch) query.set("busca", nextSearch)
    const nextPage = change.pagina ?? (change.aba ? 1 : page)
    if (nextPage > 1) query.set("pagina", String(nextPage))
    if (change.q) query.set("q", change.q)
    const value = query.toString()
    return value ? `/perguntas?${value}` : "/perguntas"
  }

  const hidden: Record<string, string> = {}
  if (tab !== "responder") hidden.aba = tab
  if (accountFilter) hidden.conta = accountFilter

  return (
    <>
      <LiveRefresh organizationId={organizationId} />
      <PageHeader
        title="Perguntas"
        description="Tudo o que os compradores perguntaram, quem respondeu e o que ainda está esperando você."
        actions={<SyncButton />}
      />

      <InboxTabs active={tab} counts={counts} hrefFor={(key) => hrefFor({ aba: key })} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(320px,2fr)_minmax(0,3fr)]">
        <Card className={cn("gap-0 py-0", explicit ? "hidden lg:flex" : "flex")}>
          <div className="flex flex-col gap-2 border-b p-3 sm:flex-row">
            <QuestionSearch value={search} hidden={hidden} clearHref={hrefFor({ busca: "", pagina: 1 })} />
            {showAccount ? (
              <AccountSelect
                allowAll
                accounts={accountRows.map((account) => ({ id: account.id, nickname: accounts[account.id].nickname }))}
              />
            ) : null}
          </div>
          <div className="flex items-center justify-between px-4 pt-3 pb-1 text-xs font-medium text-muted-foreground">
            <span>{INBOX_TABS[tab].label}</span>
            <span className="tabular-nums">{total}</span>
          </div>
          {questions.length ? (
            <InboxList
              questions={questions}
              selectedId={selected?.id ?? null}
              accounts={accounts}
              showAccount={showAccount}
              hrefFor={(id) => hrefFor({ q: id })}
              pagination={{
                page,
                totalPages,
                total,
                prevHref: hrefFor({ pagina: page - 1 }),
                nextHref: hrefFor({ pagina: page + 1 }),
              }}
            />
          ) : (
            <Empty className="py-12">
              <EmptyHeader>
                <EmptyMedia variant="icon">{search ? <SearchXIcon /> : <InboxIcon />}</EmptyMedia>
                <EmptyTitle>{search ? "Nada encontrado" : EMPTY[tab].title}</EmptyTitle>
                <EmptyDescription>
                  {search ? `Nenhuma pergunta com "${search}" nesta aba.` : EMPTY[tab].description}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </Card>

        {selected ? (
          <QuestionDetail
            question={selected}
            account={accounts[selected.ml_account_id]}
            showAccount={showAccount}
            backHref={hrefFor({})}
            nextHref={next ? hrefFor({ q: next.id }) : null}
            className={cn("lg:sticky lg:top-4", explicit ? "flex" : "hidden lg:flex")}
          />
        ) : (
          <Card className="hidden min-h-80 items-center justify-center lg:flex">
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
