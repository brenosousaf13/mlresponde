"use client"

import { SparklesIcon } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { answerQuestion, generateSuggestion } from "@/app/(app)/perguntas/actions"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { ML_ANSWER_LIMIT } from "@/lib/answers/compose"

export function AnswerDialog({
  questionId,
  questionText,
  itemTitle,
  initialText,
}: {
  questionId: string
  questionText: string
  itemTitle: string | null
  initialText: string
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(initialText)
  const [teach, setTeach] = useState(true)
  const [sending, startSending] = useTransition()
  const [suggesting, startSuggesting] = useTransition()
  const length = text.replace(/\s+/g, " ").trim().length

  function suggest() {
    startSuggesting(async () => {
      const result = await generateSuggestion(questionId)
      if (result.ok) {
        setText(result.composed)
        toast.success(`Sugestão pronta (certeza da IA: ${Math.round(result.confidence * 100)}%). Revise antes de enviar.`)
      } else {
        toast.error(result.message)
      }
    })
  }

  function send() {
    startSending(async () => {
      const result = await answerQuestion(questionId, text, teach)
      if (result.ok) {
        toast.success(result.message)
        setOpen(false)
      } else {
        toast.error(result.message)
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setText(initialText)
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>Responder</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Responder pergunta</DialogTitle>
          <DialogDescription>{itemTitle ?? "Anúncio do Mercado Livre"}</DialogDescription>
        </DialogHeader>
        <blockquote className="rounded-lg border bg-muted/50 px-3 py-2 text-sm">{questionText}</blockquote>
        <Field>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel htmlFor={`answer-${questionId}`}>Sua resposta</FieldLabel>
            <Button variant="ghost" size="sm" onClick={suggest} disabled={suggesting || sending}>
              {suggesting ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
              Sugestão da IA
            </Button>
          </div>
          <Textarea
            id={`answer-${questionId}`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={6}
            maxLength={ML_ANSWER_LIMIT + 200}
            placeholder="Escreva a resposta para o comprador"
          />
          <FieldDescription className={length > ML_ANSWER_LIMIT ? "text-destructive" : undefined}>
            {length}/{ML_ANSWER_LIMIT} caracteres. O Mercado Livre junta tudo em um parágrafo.
          </FieldDescription>
        </Field>
        <Field orientation="horizontal">
          <Checkbox id={`teach-${questionId}`} checked={teach} onCheckedChange={(checked) => setTeach(checked === true)} />
          <FieldLabel htmlFor={`teach-${questionId}`} className="font-normal">
            Ensinar a IA com esta resposta (vale para perguntas parecidas neste anúncio)
          </FieldLabel>
        </Field>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
          <Button onClick={send} disabled={sending || suggesting || length === 0 || length > ML_ANSWER_LIMIT}>
            {sending && <Spinner data-icon="inline-start" />}
            Enviar resposta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
