"use client"

import { CheckIcon, CopyIcon, PencilLineIcon } from "lucide-react"
import { useOptimistic, useState, useTransition } from "react"
import { toast } from "sonner"

import { setSuggestionDone } from "@/app/(app)/melhorias/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import type { ImprovementSuggestion } from "@/lib/listing-improvements/parse"
import { AREA_LABELS, PRIORITY_LABELS } from "@/lib/listing-improvements/presentation"
import { cn } from "@/lib/utils"

const PRIORITY_STYLE = {
  alta: "border-primary/30 bg-primary/10 text-primary",
  media: "border-border text-foreground",
  baixa: "border-border text-muted-foreground",
} as const

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      size="xs"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        } catch {
          toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.")
        }
      }}
    >
      {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
      {copied ? "Copiado" : "Copiar texto"}
    </Button>
  )
}

/** Uma sugestão da análise: o problema, o que mudar, o texto pronto e "já fiz". */
export function SuggestionCard({
  improvementId,
  index,
  suggestion,
  done,
}: {
  improvementId: string
  index: number
  suggestion: ImprovementSuggestion
  done: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [optimisticDone, setOptimisticDone] = useOptimistic(done)
  const checkboxId = `sugestao-${index}`

  return (
    <Card className={cn("transition-opacity", optimisticDone && "opacity-70")}>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{AREA_LABELS[suggestion.area]}</Badge>
          <Badge variant="outline" className={PRIORITY_STYLE[suggestion.priority]}>
            {PRIORITY_LABELS[suggestion.priority]}
          </Badge>
          {suggestion.questionCount > 0 ? (
            <span className="text-xs text-muted-foreground">
              evitaria {suggestion.questionCount} {suggestion.questionCount === 1 ? "pergunta" : "perguntas"} das analisadas
            </span>
          ) : null}
        </div>
        <CardTitle className={cn("mt-1 text-base leading-snug", optimisticDone && "line-through decoration-muted-foreground/60")}>
          {index + 1}. {suggestion.title}
        </CardTitle>
        {suggestion.problem ? <CardDescription>{suggestion.problem}</CardDescription> : null}
        <CardAction>
          <div className="flex items-center gap-2">
            <Checkbox
              id={checkboxId}
              checked={optimisticDone}
              disabled={pending}
              onCheckedChange={(checked) =>
                startTransition(async () => {
                  setOptimisticDone(Boolean(checked))
                  const result = await setSuggestionDone(improvementId, index, Boolean(checked))
                  if (!result.ok) toast.error(result.message ?? "Não foi possível salvar.")
                })
              }
            />
            <Label htmlFor={checkboxId} className="text-xs font-normal text-muted-foreground">
              Já fiz
            </Label>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start gap-2.5 text-sm">
          <PencilLineIcon className="mt-0.5 size-4 shrink-0 text-primary" />
          <p>{suggestion.action}</p>
        </div>

        {suggestion.readyText ? (
          <div className="flex flex-col gap-2 rounded-xl border bg-muted/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Texto pronto para o anúncio</span>
              <CopyButton text={suggestion.readyText} />
            </div>
            <p className="whitespace-pre-line text-sm">{suggestion.readyText}</p>
            {suggestion.needsSellerInfo ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Complete o que está entre [colchetes] antes de colar: a IA não encontrou essa informação no anúncio nem nas
                suas respostas.
              </p>
            ) : null}
          </div>
        ) : null}

        {suggestion.exampleQuestions.length ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">O que os compradores perguntaram</span>
            <ul className="flex flex-col gap-1">
              {suggestion.exampleQuestions.map((question) => (
                <li key={question} className="rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
                  &ldquo;{question}&rdquo;
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
