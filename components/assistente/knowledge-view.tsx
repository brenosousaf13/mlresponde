import { BookOpenTextIcon, CheckCircle2Icon, CircleDashedIcon, ListRestartIcon } from "lucide-react"
import Link from "next/link"

import { EditAnswerDialog } from "@/components/assistente/edit-answer-dialog"
import { ExtraInfoForm } from "@/components/assistente/extra-info-form"
import { PromptPreviewDialog } from "@/components/assistente/prompt-preview-dialog"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { compileStoreKnowledge, isAnswered, optionLabels, profileProgress, type StoreProfile } from "@/lib/assistant/profile"
import { PROFILE_QUESTIONS, SETUP_SECTIONS } from "@/lib/assistant/questions"
import { cn } from "@/lib/utils"

export function KnowledgeView({
  accountId,
  profile,
  extraInfo,
  canManage,
}: {
  accountId: string
  profile: StoreProfile
  extraInfo: string
  canManage: boolean
}) {
  const progress = profileProgress(profile)
  const sections = SETUP_SECTIONS.filter((section) => section.id !== "estilo")

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpenTextIcon className="size-4 text-primary" />O que a IA sabe sobre a sua loja
          </CardTitle>
          <CardDescription>
            Estas respostas viram as instruções da IA. Ela também lê cada anúncio (ficha técnica, variações, estoque e
            descrição) e as respostas ensinadas. O que não estiver em nenhum desses lugares, ela não inventa: deixa
            para você.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-sm">
            <div className="flex justify-between text-sm">
              <span className="font-medium">
                {progress.answered} de {progress.total} perguntas respondidas
              </span>
              <span className="text-muted-foreground tabular-nums">
                {Math.round((progress.answered / progress.total) * 100)}%
              </span>
            </div>
            <Progress value={(progress.answered / progress.total) * 100} aria-label="Perguntas respondidas" />
          </div>
          <div className="flex flex-wrap gap-2">
            <PromptPreviewDialog knowledge={compileStoreKnowledge(profile, extraInfo)} />
            {canManage ? (
              <Link
                href={`/assistente?conta=${accountId}&configurar=1`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                <ListRestartIcon data-icon="inline-start" />
                Revisar passo a passo
              </Link>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        {sections.map((section) => {
          const questions = PROFILE_QUESTIONS.filter((question) => question.section === section.id)
          const answered = questions.filter((question) => isAnswered(profile[question.id])).length
          return (
            <Card key={section.id}>
              <CardHeader className="border-b">
                <CardTitle>{section.label}</CardTitle>
                <CardDescription>
                  {answered === questions.length ? "Tudo respondido" : `${answered} de ${questions.length} respondidas`}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col divide-y">
                {questions.map((question) => {
                  const answer = profile[question.id]
                  const has = isAnswered(answer)
                  return (
                    <div key={question.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                      {has ? (
                        <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                      ) : (
                        <CircleDashedIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <p className="text-sm font-medium">{question.label}</p>
                        {has ? (
                          <>
                            {answer.options.length ? (
                              <div className="flex flex-wrap gap-1">
                                {optionLabels(question, answer).map((label) => (
                                  <Badge key={label} variant="secondary">
                                    {label}
                                  </Badge>
                                ))}
                              </div>
                            ) : null}
                            {answer.text ? (
                              <p className="line-clamp-4 text-sm whitespace-pre-line text-muted-foreground">{answer.text}</p>
                            ) : null}
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground">Não informado — a IA deixa para você.</p>
                        )}
                      </div>
                      {canManage ? (
                        <EditAnswerDialog accountId={accountId} questionId={question.id} value={answer ?? null} answered={has} />
                      ) : null}
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Outras informações</CardTitle>
          <CardDescription>
            Qualquer outra coisa que a IA deve saber e não coube nas perguntas: campanhas, kits, avisos de férias,
            regras de um produto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExtraInfoForm accountId={accountId} initial={extraInfo} disabled={!canManage} />
        </CardContent>
      </Card>
    </div>
  )
}
