import { ChevronLeftIcon, ChevronRightIcon, InboxIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/app/page-header"
import { AccountFilter } from "@/components/perguntas/account-filter"
import { LiveRefresh } from "@/components/perguntas/live-refresh"
import { QuestionList, type AccountInfo } from "@/components/perguntas/question-list"
import { SyncButton } from "@/components/perguntas/sync-button"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { requireSection } from "@/lib/dal/app-context"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Perguntas" }

const PAGE_SIZE = 20

const TABS = {
  revisar: { label: "Para responder", statuses: ["needs_review", "failed"] },
  respondidas: { label: "Respondidas", statuses: ["answered", "answered_outside"] },
  todas: { label: "Todas", statuses: null },
} as const

type TabKey = keyof typeof TABS

const EMPTY: Record<TabKey, { title: string; description: string }> = {
  revisar: { title: "Nada para responder", description: "Quando a IA deixar uma pergunta para você, ela aparece aqui." },
  respondidas: { title: "Nenhuma resposta ainda", description: "As perguntas respondidas aparecem aqui." },
  todas: {
    title: "Nenhuma pergunta ainda",
    description: "As perguntas novas dos seus anúncios chegam aqui automaticamente.",
  },
}

export default async function QuestionsPage({ searchParams }: PageProps<"/perguntas">) {
  const context = await requireSection("perguntas")
  const params = await searchParams
  const tab: TabKey = typeof params.aba === "string" && params.aba in TABS ? (params.aba as TabKey) : "revisar"
  const page = Math.max(1, Number.parseInt(String(params.pagina ?? "1"), 10) || 1)
  const accountFilter = typeof params.conta === "string" ? params.conta : null

  const supabase = await createClient()
  const { data: accountRows, error: accountsError } = await supabase
    .from("ml_accounts")
    .select("id, nickname, ml_user_id, answer_greeting, answer_signature")
    .eq("organization_id", context.organization.id)
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
  const validFilter = accountFilter && accounts[accountFilter] ? accountFilter : null

  let query = supabase
    .from("ml_questions")
    .select(
      "id, ml_account_id, item_title, item_permalink, item_thumbnail, question_text, question_created_at, created_at, status, review_reason, ai_draft, ai_confidence, ai_reason, answer_text, answer_source, answered_at",
      { count: "exact" }
    )
    .eq("organization_id", context.organization.id)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
  const statuses = TABS[tab].statuses
  if (statuses) query = query.in("status", [...statuses])
  if (validFilter) query = query.eq("ml_account_id", validFilter)

  let reviewQuery = supabase
    .from("ml_questions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", context.organization.id)
    .in("status", [...TABS.revisar.statuses])
  if (validFilter) reviewQuery = reviewQuery.eq("ml_account_id", validFilter)

  const [{ data: questions, count, error }, { count: reviewCount }] = await Promise.all([query, reviewQuery])
  if (error) throw error

  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const hrefFor = (next: { aba?: TabKey; pagina?: number }) => {
    const search = new URLSearchParams()
    search.set("aba", next.aba ?? tab)
    if (validFilter) search.set("conta", validFilter)
    if (next.pagina && next.pagina > 1) search.set("pagina", String(next.pagina))
    return `/perguntas?${search}`
  }

  return (
    <>
      <LiveRefresh organizationId={context.organization.id} />
      <PageHeader
        title="Perguntas"
        description="Acompanhe o que a IA respondeu e responda as perguntas que ficaram para você."
        actions={<SyncButton />}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav className="flex flex-wrap gap-1" aria-label="Filtrar perguntas">
          {(Object.keys(TABS) as TabKey[]).map((key) => (
            <Link
              key={key}
              href={hrefFor({ aba: key })}
              aria-current={key === tab ? "page" : undefined}
              className={cn(buttonVariants({ variant: key === tab ? "secondary" : "ghost", size: "sm" }))}
            >
              {TABS[key].label}
              {key === "revisar" && reviewCount ? <Badge className="ml-1">{reviewCount}</Badge> : null}
            </Link>
          ))}
        </nav>
        {accountRows.length > 1 ? (
          <AccountFilter accounts={accountRows.map((a) => ({ id: a.id, nickname: accounts[a.id].nickname }))} />
        ) : null}
      </div>

      {questions.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <InboxIcon />
            </EmptyMedia>
            <EmptyTitle>{EMPTY[tab].title}</EmptyTitle>
            <EmptyDescription>{EMPTY[tab].description}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <QuestionList questions={questions} accounts={accounts} showAccount={accountRows.length > 1} />
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Página {page} de {totalPages} · {total} perguntas
          </span>
          <div className="flex gap-2">
            <Link
              href={hrefFor({ pagina: page - 1 })}
              aria-disabled={page <= 1}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), page <= 1 && "pointer-events-none opacity-50")}
            >
              <ChevronLeftIcon data-icon="inline-start" />
              Anterior
            </Link>
            <Link
              href={hrefFor({ pagina: page + 1 })}
              aria-disabled={page >= totalPages}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                page >= totalPages && "pointer-events-none opacity-50"
              )}
            >
              Próxima
              <ChevronRightIcon data-icon="inline-end" />
            </Link>
          </div>
        </div>
      ) : null}
    </>
  )
}
