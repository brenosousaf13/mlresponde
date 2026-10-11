import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import Link from "next/link"

import { InboxRowLink } from "@/components/perguntas/inbox-row-link"
import { ItemThumb, type AccountInfo } from "@/components/perguntas/question-detail"
import { buttonVariants } from "@/components/ui/button"
import { timeAgo } from "@/lib/format"
import { TONE_STYLES, questionTone } from "@/lib/questions/presentation"
import { cn } from "@/lib/utils"

export type ListQuestion = {
  id: string
  ml_account_id: string
  item_title: string | null
  item_thumbnail: string | null
  question_text: string
  question_created_at: string | null
  created_at: string
  status: string
  answer_source: string | null
}

export function InboxList({
  questions,
  selectedId,
  accounts,
  showAccount,
  hrefFor,
  pagination,
}: {
  questions: ListQuestion[]
  selectedId: string | null
  accounts: Record<string, AccountInfo>
  showAccount: boolean
  hrefFor: (questionId: string) => string
  pagination: { page: number; totalPages: number; total: number; prevHref: string; nextHref: string } | null
}) {
  return (
    <>
      <ul className="flex flex-col divide-y">
        {questions.map((question) => {
          const tone = questionTone(question.status, question.answer_source)
          const style = TONE_STYLES[tone]
          const selected = question.id === selectedId
          return (
            <li key={question.id}>
              <InboxRowLink
                href={hrefFor(question.id)}
                className={cn(
                  "relative flex gap-3 px-4 py-3.5 transition-colors hover:bg-muted/60",
                  selected && "lg:bg-primary/[0.06] lg:hover:bg-primary/[0.06]"
                )}
              >
                {selected ? <span className="absolute inset-y-0 left-0 hidden w-[3px] rounded-r bg-primary lg:block" aria-hidden /> : null}
                <ItemThumb src={question.item_thumbnail} size="sm" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-start justify-between gap-2">
                    <span
                      className={cn(
                        "line-clamp-2 text-sm leading-snug",
                        tone === "open" ? "font-semibold text-foreground" : "font-medium text-foreground/90"
                      )}
                    >
                      {question.question_text || "Pergunta ainda não carregada"}
                    </span>
                    <time className="shrink-0 pt-0.5 text-[11px] text-muted-foreground">
                      {timeAgo(question.question_created_at ?? question.created_at)}
                    </time>
                  </span>
                  <span className="mt-0.5 truncate text-xs text-muted-foreground">
                    {question.item_title ?? "Anúncio"}
                    {showAccount && accounts[question.ml_account_id] ? ` · ${accounts[question.ml_account_id].nickname}` : ""}
                  </span>
                  <span className={cn("mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium", style.text)}>
                    <span className={cn("size-1.5 rounded-full", style.dot)} />
                    {style.label}
                  </span>
                </span>
              </InboxRowLink>
            </li>
          )
        })}
      </ul>
      {pagination && pagination.totalPages > 1 ? (
        <div className="flex items-center justify-between border-t px-4 py-2.5 text-xs text-muted-foreground">
          <span>
            Página {pagination.page} de {pagination.totalPages} · {pagination.total} perguntas
          </span>
          <div className="flex gap-1">
            <Link
              href={pagination.prevHref}
              aria-label="Página anterior"
              aria-disabled={pagination.page <= 1}
              className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }), pagination.page <= 1 && "pointer-events-none opacity-50")}
            >
              <ChevronLeftIcon />
            </Link>
            <Link
              href={pagination.nextHref}
              aria-label="Próxima página"
              aria-disabled={pagination.page >= pagination.totalPages}
              className={cn(
                buttonVariants({ variant: "outline", size: "icon-sm" }),
                pagination.page >= pagination.totalPages && "pointer-events-none opacity-50"
              )}
            >
              <ChevronRightIcon />
            </Link>
          </div>
        </div>
      ) : null}
    </>
  )
}
