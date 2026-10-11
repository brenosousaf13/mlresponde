"use client"

import { PencilIcon, PlusIcon } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { saveProfileAnswer } from "@/app/(app)/assistente/actions"
import { EMPTY_ANSWER, ProfileQuestionInput } from "@/components/assistente/question-input"
import { Button } from "@/components/ui/button"
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
import { Spinner } from "@/components/ui/spinner"
import type { ProfileAnswer } from "@/lib/assistant/profile"
import { findQuestion } from "@/lib/assistant/questions"

export function EditAnswerDialog({
  accountId,
  questionId,
  value,
  answered,
}: {
  accountId: string
  questionId: string
  value: ProfileAnswer | null
  answered: boolean
}) {
  const question = findQuestion(questionId)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<ProfileAnswer>(value ?? EMPTY_ANSWER)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  if (!question) return null

  function save() {
    setError(null)
    startTransition(async () => {
      const result = await saveProfileAnswer(accountId, questionId, draft)
      if (result.ok) {
        toast.success(result.message)
        setOpen(false)
      } else {
        setError(result.message)
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setDraft(value ?? EMPTY_ANSWER)
          setError(null)
        }
      }}
    >
      <DialogTrigger
        render={
          answered ? (
            <Button variant="ghost" size="icon-sm" aria-label={`Editar: ${question.label}`} />
          ) : (
            <Button variant="outline" size="sm" />
          )
        }
      >
        {answered ? (
          <PencilIcon />
        ) : (
          <>
            <PlusIcon data-icon="inline-start" />
            Responder
          </>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{question.title}</DialogTitle>
          <DialogDescription>{question.description}</DialogDescription>
        </DialogHeader>
        <ProfileQuestionInput question={question} value={draft} onChange={setDraft} onSubmit={save} autoFocus disabled={pending} />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
          <Button onClick={save} disabled={pending}>
            {pending ? <Spinner data-icon="inline-start" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
