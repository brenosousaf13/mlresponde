import { BotIcon, CircleAlertIcon, PackageIcon, StoreIcon, UserIcon } from "lucide-react"
import Image from "next/image"

import { AnswerDialog } from "@/components/perguntas/answer-dialog"
import { QuestionMenu } from "@/components/perguntas/question-menu"
import { Badge } from "@/components/ui/badge"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { composeAnswer } from "@/lib/answers/compose"
import { REVIEW_REASON_LABELS, type ReviewReason } from "@/lib/answers/decision"
import { timeAgo } from "@/lib/format"

export type QuestionRow = {
  id: string
  ml_account_id: string
  item_title: string | null
  item_permalink: string | null
  item_thumbnail: string | null
  question_text: string
  question_created_at: string | null
  created_at: string
  status: string
  review_reason: string | null
  ai_draft: string | null
  ai_confidence: number | null
  ai_reason: string | null
  answer_text: string | null
  answer_source: string | null
  answered_at: string | null
}

export type AccountInfo = { nickname: string; greeting: string; signature: string }

const STATUS_BADGES: Record<string, { label: string; variant: React.ComponentProps<typeof Badge>["variant"] }> = {
  pending: { label: "Na fila", variant: "secondary" },
  processing: { label: "IA analisando", variant: "secondary" },
  needs_review: { label: "Para você responder", variant: "outline" },
  failed: { label: "Para você responder", variant: "outline" },
  answered: { label: "Respondida", variant: "default" },
  answered_outside: { label: "Respondida no ML", variant: "secondary" },
  ignored: { label: "Arquivada", variant: "ghost" },
}

const SOURCE_LABELS: Record<string, { label: string; icon: typeof BotIcon }> = {
  ai: { label: "Respondida pela IA", icon: BotIcon },
  manual: { label: "Respondida por você", icon: UserIcon },
  external: { label: "Respondida direto no Mercado Livre", icon: StoreIcon },
}

export function QuestionList({
  questions,
  accounts,
  showAccount,
}: {
  questions: QuestionRow[]
  accounts: Record<string, AccountInfo>
  showAccount: boolean
}) {
  return (
    <ItemGroup className="gap-3">
      {questions.map((question) => {
        const account = accounts[question.ml_account_id]
        const status = STATUS_BADGES[question.status] ?? STATUS_BADGES.pending
        const isOpen = question.status === "needs_review" || question.status === "failed"
        const reason = question.review_reason ? REVIEW_REASON_LABELS[question.review_reason as ReviewReason] : null
        const source = question.answer_source ? SOURCE_LABELS[question.answer_source] : null
        const draft = question.ai_draft
          ? composeAnswer({ greeting: account?.greeting, body: question.ai_draft, signature: account?.signature })
          : ""

        return (
          <Item key={question.id} variant="outline" className="items-start">
            <ItemMedia variant="image">
              {question.item_thumbnail ? (
                <Image src={question.item_thumbnail} alt="" width={40} height={40} />
              ) : (
                <div className="flex size-full items-center justify-center bg-muted text-muted-foreground">
                  <PackageIcon className="size-4" />
                </div>
              )}
            </ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle className="text-base leading-snug font-medium">{question.question_text || "Pergunta ainda não carregada do Mercado Livre"}</ItemTitle>
              <ItemDescription className="line-clamp-1">
                {question.item_permalink ? (
                  <a href={question.item_permalink} target="_blank" rel="noreferrer" className="hover:underline">
                    {question.item_title ?? "Anúncio"}
                  </a>
                ) : (
                  (question.item_title ?? "Anúncio")
                )}
                {showAccount && account ? ` · ${account.nickname}` : ""}
                {` · ${timeAgo(question.question_created_at ?? question.created_at)}`}
              </ItemDescription>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Badge variant={status.variant}>{status.label}</Badge>
                {isOpen && reason ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <CircleAlertIcon className="size-3.5" />
                    {reason}
                  </span>
                ) : null}
              </div>
            </ItemContent>
            <ItemActions>
              {isOpen ? (
                <AnswerDialog
                  questionId={question.id}
                  questionText={question.question_text}
                  itemTitle={question.item_title}
                  initialText={draft}
                />
              ) : null}
              {isOpen || question.item_permalink ? (
                <QuestionMenu questionId={question.id} permalink={question.item_permalink} open={isOpen} />
              ) : null}
            </ItemActions>
            {question.answer_text && (question.status === "answered" || question.status === "answered_outside") ? (
              <ItemFooter className="basis-full">
                <div className="w-full rounded-lg bg-muted/60 px-3 py-2 text-sm">
                  {source ? (
                    <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <source.icon className="size-3.5" />
                      {source.label}
                      {question.answer_source === "ai" && question.ai_confidence !== null
                        ? ` · certeza ${Math.round(Number(question.ai_confidence) * 100)}%`
                        : ""}
                    </p>
                  ) : null}
                  <p>{question.answer_text}</p>
                </div>
              </ItemFooter>
            ) : null}
            {isOpen && draft ? (
              <ItemFooter className="basis-full">
                <div className="w-full rounded-lg border border-dashed px-3 py-2 text-sm">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <BotIcon className="size-3.5" />
                    Rascunho da IA
                    {question.ai_confidence !== null ? ` · certeza ${Math.round(Number(question.ai_confidence) * 100)}%` : ""}
                  </p>
                  <p className="text-muted-foreground">{draft}</p>
                </div>
              </ItemFooter>
            ) : null}
          </Item>
        )
      })}
    </ItemGroup>
  )
}
