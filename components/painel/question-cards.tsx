import { ArrowRightIcon, CheckCircle2Icon, ChevronRightIcon, MessageCircleQuestionIcon, PackageSearchIcon } from "lucide-react"
import Link from "next/link"

import { ItemThumb } from "@/components/perguntas/question-detail"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import type { DashboardQuestion } from "@/lib/dal/dashboard"
import { formatNumber, pluralize, timeAgo } from "@/lib/format"
import { TONE_STYLES, inboxHref, questionSummary, type InboxTab, type TopItem } from "@/lib/questions/presentation"
import { cn } from "@/lib/utils"

const askedAt = (question: DashboardQuestion) => question.question_created_at ?? question.created_at

/** Link direto para a pergunta aberta na caixa de entrada, na aba certa. */
function questionHref(question: DashboardQuestion) {
  const summary = questionSummary(question)
  const tab: InboxTab = summary.tone === "open" ? "responder" : summary.tone === "ai" ? "ia" : summary.tone === "manual" || summary.tone === "external" ? "voce" : "todas"
  return inboxHref({ tab, account: null, item: null, search: "", order: "recentes", page: 1, question: question.id })
}

function SeeAll({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-primary hover:text-primary")}>
      {label}
      <ArrowRightIcon data-icon="inline-end" />
    </Link>
  )
}

/** Perguntas que esperam o vendedor, com acesso direto para responder. */
export function AwaitingQuestionsCard({ questions, total }: { questions: DashboardQuestion[]; total: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Esperando você
          {total ? (
            <span className="rounded-md bg-brand-yellow px-1.5 text-xs font-semibold text-brand-navy tabular-nums">{formatNumber(total)}</span>
          ) : null}
        </CardTitle>
        <CardDescription>Perguntas que a IA deixou para você, já com rascunho</CardDescription>
        {total ? (
          <CardAction>
            <SeeAll href="/perguntas" label={total > questions.length ? `Ver todas (${formatNumber(total)})` : "Abrir"} />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="px-2">
        {questions.length ? (
          <ItemGroup className="gap-1">
            {questions.map((question) => (
              <Item key={question.id} size="sm" render={<Link href={questionHref(question)} />}>
                <ItemMedia>
                  <ItemThumb src={question.item_thumbnail} size="sm" />
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle className="w-full min-w-0">
                    <span className="truncate">{question.question_text || "Pergunta ainda não carregada"}</span>
                  </ItemTitle>
                  <ItemDescription className="line-clamp-1 text-xs">
                    {question.item_title ?? "Anúncio"} · {timeAgo(askedAt(question))}
                  </ItemDescription>
                  <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", TONE_STYLES.open.text)}>
                    <span className={cn("size-1.5 rounded-full", TONE_STYLES.open.dot)} />
                    {questionSummary(question).label}
                  </span>
                </ItemContent>
                <ItemActions className="text-xs font-medium text-primary">
                  <span className="hidden sm:inline">Responder</span>
                  <ChevronRightIcon className="size-4" />
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        ) : (
          <Empty className="gap-3 p-6">
            <EmptyHeader>
              <EmptyMedia variant="icon" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                <CheckCircle2Icon />
              </EmptyMedia>
              <EmptyTitle>Nada esperando você</EmptyTitle>
              <EmptyDescription>Quando a IA não tiver certeza, a pergunta aparece aqui com um rascunho pronto.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  )
}

/** As perguntas mais recentes, de qualquer situação, com quem respondeu. */
export function RecentQuestionsCard({ questions }: { questions: DashboardQuestion[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Últimas perguntas</CardTitle>
        <CardDescription>O que chegou por último e quem respondeu</CardDescription>
        {questions.length ? (
          <CardAction>
            <SeeAll href={inboxHref({ tab: "todas", account: null, item: null, search: "", order: "recentes", page: 1, question: null })} label="Ver todas" />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="px-2">
        {questions.length ? (
          <ItemGroup className="gap-1">
            {questions.map((question) => {
              const summary = questionSummary(question)
              const style = TONE_STYLES[summary.tone]
              return (
                <Item key={question.id} size="sm" render={<Link href={questionHref(question)} />}>
                  <ItemMedia>
                    <ItemThumb src={question.item_thumbnail} size="sm" />
                  </ItemMedia>
                  <ItemContent className="min-w-0">
                    <ItemTitle className="w-full min-w-0">
                      <span className="truncate">{question.question_text || "Pergunta ainda não carregada"}</span>
                    </ItemTitle>
                    <span className="flex min-w-0 items-center gap-1.5 text-xs">
                      <span className={cn("inline-flex shrink-0 items-center gap-1.5 font-medium", style.text)}>
                        <span className={cn("size-1.5 rounded-full", style.dot)} />
                        {summary.label}
                      </span>
                      <span className="truncate text-muted-foreground">{summary.preview ?? question.item_title ?? ""}</span>
                    </span>
                  </ItemContent>
                  <ItemActions className="self-start pt-0.5 text-[11px] whitespace-nowrap text-muted-foreground">
                    {timeAgo(askedAt(question))}
                  </ItemActions>
                </Item>
              )
            })}
          </ItemGroup>
        ) : (
          <Empty className="gap-3 p-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageCircleQuestionIcon />
              </EmptyMedia>
              <EmptyTitle>Nenhuma pergunta ainda</EmptyTitle>
              <EmptyDescription>As perguntas dos seus anúncios aparecem aqui assim que chegarem.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  )
}

/** Anúncios que mais receberam perguntas na semana; cada um abre a caixa de entrada filtrada. */
export function TopItemsCard({ items, sampled, days }: { items: TopItem[]; sampled: boolean; days: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Anúncios mais perguntados</CardTitle>
        <CardDescription>
          {sampled ? `Nas últimas ${formatNumber(1000)} perguntas` : `Últimos ${days} dias`} · se um anúncio gera muitas dúvidas, vale
          melhorar a descrição
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2">
        {items.length ? (
          <ItemGroup className="gap-1">
            {items.map((item) => (
              <Item
                key={item.itemId}
                size="sm"
                render={
                  <Link
                    href={inboxHref({ tab: "todas", account: null, item: item.itemId, search: "", order: "recentes", page: 1, question: null })}
                  />
                }
              >
                <ItemMedia>
                  <ItemThumb src={item.thumbnail} size="sm" />
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle className="w-full min-w-0">
                    <span className="truncate">{item.title ?? item.itemId}</span>
                  </ItemTitle>
                  <ItemDescription className="text-xs">
                    {pluralize(item.total, "pergunta", "perguntas")}
                    {item.open ? (
                      <span className="font-medium text-amber-700 dark:text-amber-400"> · {item.open} para responder</span>
                    ) : null}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <ChevronRightIcon className="size-4 text-muted-foreground" />
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        ) : (
          <Empty className="gap-3 p-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PackageSearchIcon />
              </EmptyMedia>
              <EmptyDescription>Nenhuma pergunta nos últimos {days} dias.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  )
}
