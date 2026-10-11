import { ArrowLeftIcon, BotIcon, CircleAlertIcon, ExternalLinkIcon, LoaderIcon, PackageIcon, StoreIcon, UserIcon, UserCheckIcon } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

import { AnswerComposer } from "@/components/perguntas/answer-composer"
import { QuestionMenu } from "@/components/perguntas/question-menu"
import { Card } from "@/components/ui/card"
import { composeAnswer } from "@/lib/answers/compose"
import { REVIEW_REASON_LABELS, type ReviewReason } from "@/lib/answers/decision"
import { formatDateTime, timeAgo } from "@/lib/format"
import { TONE_STYLES, questionTone } from "@/lib/questions/presentation"
import { cn } from "@/lib/utils"

export type DetailQuestion = {
  id: string
  ml_account_id: string
  item_id: string | null
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

const SOURCE = {
  ai: { label: "IA", icon: BotIcon, avatar: "bg-primary text-primary-foreground" },
  manual: { label: "Você", icon: UserCheckIcon, avatar: "bg-emerald-600 text-white" },
  external: { label: "Você, direto no Mercado Livre", icon: StoreIcon, avatar: "bg-teal-600 text-white" },
} as const

export function ItemThumb({ src, size }: { src: string | null; size: "sm" | "lg" }) {
  const box = size === "lg" ? "size-14" : "size-10"
  return src ? (
    <Image
      src={src}
      alt=""
      width={size === "lg" ? 56 : 40}
      height={size === "lg" ? 56 : 40}
      className={cn(box, "shrink-0 rounded-lg bg-white object-contain ring-1 ring-foreground/10")}
    />
  ) : (
    <span className={cn(box, "flex shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-foreground/5")}>
      <PackageIcon className={size === "lg" ? "size-5" : "size-4"} />
    </span>
  )
}

export function QuestionDetail({
  question,
  account,
  showAccount,
  backHref,
  nextHref,
  className,
}: {
  question: DetailQuestion
  account: AccountInfo | undefined
  showAccount: boolean
  backHref: string
  nextHref: string | null
  className?: string
}) {
  const tone = questionTone(question.status, question.answer_source)
  const style = TONE_STYLES[tone]
  const reason = question.review_reason ? REVIEW_REASON_LABELS[question.review_reason as ReviewReason] : null
  const askedAt = question.question_created_at ?? question.created_at
  const draft = question.ai_draft
    ? composeAnswer({ greeting: account?.greeting, body: question.ai_draft, signature: account?.signature })
    : ""
  const answered = (tone === "ai" || tone === "manual" || tone === "external") && question.answer_text
  const source = SOURCE[(question.answer_source ?? "manual") as keyof typeof SOURCE] ?? SOURCE.manual

  return (
    <Card className={cn("gap-0 py-0", className)}>
      <div className="flex items-start gap-3 border-b p-4 sm:p-5">
        <Link
          href={backHref}
          scroll={false}
          className="-ml-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted lg:hidden"
          aria-label="Voltar para a lista"
        >
          <ArrowLeftIcon className="size-4" />
        </Link>
        <ItemThumb src={question.item_thumbnail} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {question.item_permalink ? (
            <a
              href={question.item_permalink}
              target="_blank"
              rel="noreferrer"
              className="group inline-flex items-start gap-1 font-medium leading-snug hover:text-primary"
            >
              <span className="line-clamp-2">{question.item_title ?? "Anúncio"}</span>
              <ExternalLinkIcon className="mt-0.5 size-3.5 shrink-0 opacity-50 group-hover:opacity-100" />
            </a>
          ) : (
            <p className="line-clamp-2 font-medium leading-snug">{question.item_title ?? "Anúncio do Mercado Livre"}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {[showAccount ? account?.nickname : null, question.item_id, formatDateTime(askedAt)].filter(Boolean).join(" · ")}
          </p>
          <p className={cn("mt-1 inline-flex items-center gap-1.5 text-xs font-medium", style.text)}>
            <span className={cn("size-2 rounded-full", style.dot)} />
            {style.label}
          </p>
        </div>
        <QuestionMenu
          questionId={question.id}
          permalink={question.item_permalink}
          open={tone === "open"}
          archived={question.status === "ignored"}
        />
      </div>

      <div className="flex flex-col gap-5 p-4 sm:p-5">
        {tone === "open" ? (
          <div className={cn("flex items-start gap-2.5 rounded-xl border p-3.5 text-sm", style.soft)}>
            <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div className="flex flex-col gap-0.5">
              <p className="font-medium">{reason ?? "Esta pergunta está esperando você"}</p>
              {question.ai_reason ? <p className="opacity-80">{question.ai_reason}</p> : null}
            </div>
          </div>
        ) : null}
        {tone === "queue" ? (
          <div className={cn("flex items-center gap-2.5 rounded-xl border p-3.5 text-sm", style.soft)}>
            <LoaderIcon className="size-4 shrink-0 animate-spin" />
            A IA está analisando esta pergunta. A tela atualiza sozinha.
          </div>
        ) : null}
        {tone === "archived" ? (
          <div className={cn("rounded-xl border p-3.5 text-sm", style.soft)}>
            Arquivada sem resposta. Ela continua sem resposta no Mercado Livre.
          </div>
        ) : null}

        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <UserIcon className="size-4" />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Comprador</span> · {timeAgo(askedAt)}
              </p>
              <p className="w-fit max-w-full rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2.5 text-[15px] leading-relaxed">
                {question.question_text || "Pergunta ainda não carregada do Mercado Livre"}
              </p>
            </div>
          </div>

          {answered ? (
            <div className="flex flex-row-reverse items-start gap-2.5">
              <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", source.avatar)}>
                <source.icon className="size-4" />
              </span>
              <div className="flex min-w-0 flex-col items-end gap-1">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{source.label}</span>
                  {question.answered_at ? ` · ${timeAgo(question.answered_at)}` : ""}
                  {question.answer_source === "ai" && question.ai_confidence !== null
                    ? ` · certeza ${Math.round(Number(question.ai_confidence) * 100)}%`
                    : ""}
                </p>
                <p className={cn("w-fit max-w-full rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-[15px] leading-relaxed", style.bubble)}>
                  {question.answer_text}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {tone === "open" ? (
          <AnswerComposer
            key={question.id}
            questionId={question.id}
            initialText={draft}
            draftConfidence={question.ai_draft && question.ai_confidence !== null ? Number(question.ai_confidence) : null}
            nextHref={nextHref}
          />
        ) : null}
      </div>
    </Card>
  )
}
