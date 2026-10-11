import { ArrowDownWideNarrowIcon, ArrowUpNarrowWideIcon, ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react"
import Link from "next/link"
import { Fragment } from "react"

import { AccountSelect } from "@/components/app/account-select"
import { InboxRowLink } from "@/components/perguntas/inbox-row-link"
import { ItemThumb, type AccountInfo } from "@/components/perguntas/question-detail"
import { QuestionSearch } from "@/components/perguntas/question-search"
import { buttonVariants } from "@/components/ui/button"
import { dayKey, dayLabel, formatNumber, listTime } from "@/lib/format"
import { INBOX_ORDERS, INBOX_TABS, TONE_STYLES, questionSummary, type InboxOrder, type InboxTab } from "@/lib/questions/presentation"
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
  review_reason: string | null
  answer_text: string | null
  answer_source: string | null
}

/** Topo da lista: busca, conta, filtro de anúncio ativo, total e ordenação. */
export function InboxListToolbar({
  tab,
  total,
  search,
  hidden,
  clearSearchHref,
  order,
  toggleOrderHref,
  item,
  clearItemHref,
  accounts,
}: {
  tab: InboxTab
  total: number
  search: string
  hidden: Record<string, string>
  clearSearchHref: string
  order: InboxOrder
  toggleOrderHref: string
  item: { id: string; title: string | null; thumbnail: string | null } | null
  clearItemHref: string
  accounts: { id: string; nickname: string }[] | null
}) {
  const OrderIcon = order === "antigas" ? ArrowUpNarrowWideIcon : ArrowDownWideNarrowIcon
  return (
    <div className="shrink-0 border-b">
      <div className="flex flex-col gap-2 p-3 sm:flex-row">
        <QuestionSearch value={search} hidden={hidden} clearHref={clearSearchHref} />
        {accounts ? <AccountSelect allowAll accounts={accounts} resetParams={["pagina", "q", "anuncio"]} /> : null}
      </div>
      {item ? (
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2 rounded-lg bg-primary/[0.06] py-1.5 pr-1.5 pl-2 ring-1 ring-primary/15">
            <ItemThumb src={item.thumbnail} size="xs" />
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="text-[11px] text-muted-foreground">Só deste anúncio · {item.id}</span>
              <span className="truncate text-xs font-medium">{item.title ?? "Anúncio"}</span>
            </span>
            <Link
              href={clearItemHref}
              aria-label="Mostrar todos os anúncios"
              title="Mostrar todos os anúncios"
              className={buttonVariants({ variant: "ghost", size: "icon-xs" })}
            >
              <XIcon />
            </Link>
          </div>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2 pr-2 pb-1.5 pl-4 text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-foreground/80">{INBOX_TABS[tab].label}</span>
          <span className="tabular-nums"> · {formatNumber(total)}</span>
        </span>
        <Link
          href={toggleOrderHref}
          scroll={false}
          title={`${INBOX_ORDERS[order].label}. Clique para inverter.`}
          className={cn(buttonVariants({ variant: "ghost", size: "xs" }), "text-muted-foreground")}
        >
          <OrderIcon data-icon="inline-start" />
          {INBOX_ORDERS[order].short}
        </Link>
      </div>
    </div>
  )
}

/** Linhas da caixa de entrada, agrupadas por dia (o cabeçalho do dia fica preso no topo ao rolar). */
export function InboxList({
  questions,
  selectedId,
  accounts,
  showAccount,
  hrefFor,
}: {
  questions: ListQuestion[]
  selectedId: string | null
  accounts: Record<string, AccountInfo>
  showAccount: boolean
  hrefFor: (questionId: string) => string
}) {
  const now = new Date()
  return (
    <ul className="flex flex-col">
      {questions.map((question, index) => {
        const askedAt = question.question_created_at ?? question.created_at
        const previous = questions[index - 1]
        const newDay = !previous || dayKey(previous.question_created_at ?? previous.created_at) !== dayKey(askedAt)
        const summary = questionSummary(question)
        const style = TONE_STYLES[summary.tone]
        const selected = question.id === selectedId
        return (
          <Fragment key={question.id}>
            {newDay ? (
              <li
                className="sticky top-0 z-10 border-b bg-card/95 px-4 py-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur-sm"
              >
                {dayLabel(askedAt, now)}
              </li>
            ) : null}
            <li className={cn(!newDay && "border-t")}>
              <InboxRowLink
                href={hrefFor(question.id)}
                className={cn(
                  "relative flex gap-3 px-4 py-3 transition-colors hover:bg-muted/60",
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
                        summary.tone === "open" ? "font-semibold text-foreground" : "font-medium text-foreground/90"
                      )}
                    >
                      {question.question_text || "Pergunta ainda não carregada"}
                    </span>
                    <time dateTime={askedAt} className="shrink-0 pt-0.5 text-[11px] text-muted-foreground tabular-nums">
                      {listTime(askedAt, now)}
                    </time>
                  </span>
                  <span className="mt-0.5 truncate text-xs text-muted-foreground">
                    {question.item_title ?? "Anúncio"}
                    {showAccount && accounts[question.ml_account_id] ? ` · ${accounts[question.ml_account_id].nickname}` : ""}
                  </span>
                  <span className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs">
                    <span className={cn("inline-flex shrink-0 items-center gap-1.5 font-medium", style.text)}>
                      <span className={cn("size-1.5 rounded-full", style.dot)} />
                      {summary.label}
                    </span>
                    {summary.preview ? <span className="truncate text-muted-foreground">{summary.preview}</span> : null}
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

/** Rodapé fixo da lista: "1–50 de 1.234" e as setas de página. */
export function InboxListFooter({
  from,
  to,
  total,
  prevHref,
  nextHref,
}: {
  from: number
  to: number
  total: number
  prevHref: string | null
  nextHref: string | null
}) {
  const arrow = (href: string | null, label: string, Icon: typeof ChevronLeftIcon) =>
    href ? (
      <Link href={href} scroll={false} aria-label={label} title={label} className={buttonVariants({ variant: "outline", size: "icon-sm" })}>
        <Icon />
      </Link>
    ) : (
      <span aria-hidden className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }), "pointer-events-none opacity-40")}>
        <Icon />
      </span>
    )

  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
      <span className="tabular-nums">
        {formatNumber(from)}–{formatNumber(to)} de {formatNumber(total)}
      </span>
      <div className="flex gap-1">
        {arrow(prevHref, "Página anterior", ChevronLeftIcon)}
        {arrow(nextHref, "Próxima página", ChevronRightIcon)}
      </div>
    </div>
  )
}
