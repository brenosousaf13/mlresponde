"use client"

import { SendIcon, SparklesIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { answerQuestion, generateSuggestion } from "@/app/(app)/perguntas/actions"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { ML_ANSWER_LIMIT } from "@/lib/answers/compose"
import { cn } from "@/lib/utils"

export function AnswerComposer({
  questionId,
  initialText,
  draftConfidence,
  nextHref,
}: {
  questionId: string
  initialText: string
  draftConfidence: number | null
  nextHref: string | null
}) {
  const router = useRouter()
  const [text, setText] = useState(initialText)
  const [teach, setTeach] = useState(true)
  const [fromAi, setFromAi] = useState(Boolean(initialText))
  const [sending, startSending] = useTransition()
  const [suggesting, startSuggesting] = useTransition()
  const length = text.replace(/\s+/g, " ").trim().length
  const busy = sending || suggesting

  function suggest() {
    startSuggesting(async () => {
      const result = await generateSuggestion(questionId)
      if (result.ok) {
        setText(result.composed)
        setFromAi(true)
        toast.success(`Sugestão pronta (certeza da IA: ${Math.round(result.confidence * 100)}%). Revise antes de enviar.`)
      } else {
        toast.error(result.message)
      }
    })
  }

  function send() {
    if (!length || length > ML_ANSWER_LIMIT || busy) return
    startSending(async () => {
      const result = await answerQuestion(questionId, text, teach)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(result.message)
      if (nextHref) router.push(nextHref, { scroll: false })
      else router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border bg-card shadow-xs transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">
            {fromAi
              ? `Rascunho da IA${draftConfidence !== null ? ` · certeza ${Math.round(draftConfidence * 100)}%` : ""} — revise antes de enviar`
              : "Sua resposta"}
          </span>
          <Button variant="ghost" size="sm" onClick={suggest} disabled={busy}>
            {suggesting ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
            {fromAi ? "Gerar outra" : "Sugestão da IA"}
          </Button>
        </div>
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault()
              send()
            }
          }}
          rows={5}
          maxLength={ML_ANSWER_LIMIT + 200}
          placeholder="Escreva a resposta para o comprador"
          aria-label="Resposta para o comprador"
          className="min-h-28 resize-none rounded-none border-0 bg-transparent px-3 py-2.5 text-base shadow-none focus-visible:ring-0 md:text-sm"
        />
        <div className="flex flex-col gap-3 border-t px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <Field orientation="horizontal" className="w-auto">
            <Checkbox id={`teach-${questionId}`} checked={teach} onCheckedChange={(checked) => setTeach(checked === true)} />
            <FieldLabel htmlFor={`teach-${questionId}`} className="text-sm font-normal">
              Ensinar a IA com esta resposta
            </FieldLabel>
          </Field>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <span className={cn("text-xs tabular-nums text-muted-foreground", length > ML_ANSWER_LIMIT && "text-destructive")}>
              {length}/{ML_ANSWER_LIMIT}
            </span>
            <Button onClick={send} disabled={busy || length === 0 || length > ML_ANSWER_LIMIT}>
              {sending ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
              {nextHref ? "Enviar e ir para a próxima" : "Enviar resposta"}
            </Button>
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {teach ? "A IA vai usar esta resposta em perguntas parecidas deste anúncio. " : ""}
        Ctrl + Enter envia. O Mercado Livre junta tudo em um parágrafo.
      </p>
    </div>
  )
}
