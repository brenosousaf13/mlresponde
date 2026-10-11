"use client"

import { CheckIcon, GraduationCapIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { teachFromQuestion } from "@/app/(app)/perguntas/actions"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"

/** Ensinar a resposta certa a partir de uma pergunta que recebeu a mensagem padrão. */
export function TeachFallback({
  questionId,
  taught,
}: {
  questionId: string
  /** Resposta já ensinada a partir desta pergunta (para editar). */
  taught: { answer: string; allItems: boolean } | null
}) {
  const router = useRouter()
  const [text, setText] = useState(taught?.answer ?? "")
  const [allItems, setAllItems] = useState(taught?.allItems ?? false)
  const [pending, startTransition] = useTransition()
  const length = text.replace(/\s+/g, " ").trim().length

  function teach() {
    if (length < 2 || pending) return
    startTransition(async () => {
      const result = await teachFromQuestion(questionId, text, allItems)
      if (result.ok) {
        toast.success(result.message)
        router.refresh()
      } else {
        toast.error(result.message)
      }
    })
  }

  return (
    <div className="rounded-xl border bg-card shadow-xs transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-xs font-medium text-muted-foreground">
        <GraduationCapIcon className="size-3.5" />
        {taught ? "Resposta ensinada — a IA já usa nas próximas perguntas parecidas" : "Ensine a resposta certa para as próximas vezes"}
      </div>
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            teach()
          }
        }}
        maxLength={2000}
        placeholder="Ex.: Sim, aguenta até 120 kg."
        aria-label="Resposta certa para ensinar a IA"
        className="max-h-44 min-h-20 resize-none overflow-y-auto rounded-none border-0 bg-transparent px-3 py-2.5 text-base shadow-none focus-visible:ring-0 md:text-sm"
      />
      <div className="flex flex-col gap-3 border-t px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <Field orientation="horizontal" className="w-auto">
          <Checkbox
            id={`teach-all-${questionId}`}
            checked={allItems}
            onCheckedChange={(checked) => setAllItems(checked === true)}
          />
          <FieldLabel htmlFor={`teach-all-${questionId}`} className="text-sm font-normal">
            Vale para todos os anúncios
          </FieldLabel>
        </Field>
        <Button onClick={teach} disabled={pending || length < 2} title="Ctrl + Enter">
          {pending ? <Spinner data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" />}
          {taught ? "Atualizar resposta ensinada" : "Ensinar a IA"}
        </Button>
      </div>
    </div>
  )
}
