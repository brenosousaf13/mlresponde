"use client"

import { GraduationCapIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useActionState, useState, useTransition } from "react"
import { toast } from "sonner"

import { addExample, deleteExample, updateExample } from "@/app/(app)/assistente/actions"
import { FormMessage, SubmitButton, fieldErrors, hasFieldError } from "@/components/forms/form-feedback"
import { Badge } from "@/components/ui/badge"
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
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

export type ExampleEntry = {
  id: string
  item_id: string | null
  item_title: string | null
  question_text: string
  answer_text: string
}

function AddExampleDialog({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<"all" | "item">("all")
  const [state, formAction, pending] = useActionState(async (previous: Parameters<typeof addExample>[0], formData: FormData) => {
    const result = await addExample(previous, formData)
    if (result.ok) {
      toast.success(result.message)
      setOpen(false)
    }
    return result
  }, {})

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <PlusIcon data-icon="inline-start" />
        Ensinar uma resposta
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ensinar uma resposta</DialogTitle>
          <DialogDescription>Quando um comprador perguntar algo parecido, a IA responde com base nisto.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="accountId" value={accountId} />
          <input type="hidden" name="scope" value={scope} />
          <FormMessage state={state.ok ? {} : state} />
          <FieldGroup>
            <Field data-invalid={hasFieldError(state, "question") || undefined}>
              <FieldLabel htmlFor="example-question">Quando perguntarem...</FieldLabel>
              <Input id="example-question" name="question" placeholder="Vocês emitem nota fiscal?" defaultValue={state.values?.question} />
              <FieldError errors={fieldErrors(state, "question")} />
            </Field>
            <Field data-invalid={hasFieldError(state, "answer") || undefined}>
              <FieldLabel htmlFor="example-answer">...a IA deve responder</FieldLabel>
              <Textarea
                id="example-answer"
                name="answer"
                rows={3}
                placeholder="Sim, todos os pedidos saem com nota fiscal."
                defaultValue={state.values?.answer}
              />
              <FieldError errors={fieldErrors(state, "answer")} />
            </Field>
            <Field>
              <FieldLabel>Vale para</FieldLabel>
              <ToggleGroup
                value={[scope]}
                onValueChange={(value) => value[0] && setScope(value[0] as "all" | "item")}
                variant="outline"
                spacing={0}
              >
                <ToggleGroupItem value="all" className="px-3 aria-pressed:bg-primary/10 aria-pressed:text-primary">
                  Todos os anúncios
                </ToggleGroupItem>
                <ToggleGroupItem value="item" className="px-3 aria-pressed:bg-primary/10 aria-pressed:text-primary">
                  Um anúncio
                </ToggleGroupItem>
              </ToggleGroup>
            </Field>
            {scope === "item" ? (
              <Field data-invalid={hasFieldError(state, "item") || undefined}>
                <FieldLabel htmlFor="example-item">Código ou link do anúncio</FieldLabel>
                <Input id="example-item" name="item" placeholder="MLB1234567890" defaultValue={state.values?.item} />
                <FieldError errors={fieldErrors(state, "item")} />
              </Field>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancelar</DialogClose>
            <SubmitButton pending={pending} pendingLabel="Salvando...">
              Salvar
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditExampleDialog({ example }: { example: ExampleEntry }) {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState(example.question_text)
  const [answer, setAnswer] = useState(example.answer_text)
  const [pending, startTransition] = useTransition()

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setQuestion(example.question_text)
          setAnswer(example.answer_text)
        }
      }}
    >
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Editar resposta ensinada" />}>
        <PencilIcon />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar resposta ensinada</DialogTitle>
          <DialogDescription>
            {example.item_id ? `Vale só para o anúncio ${example.item_title ?? example.item_id}.` : "Vale para todos os anúncios."}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`q-${example.id}`}>Quando perguntarem...</FieldLabel>
            <Input id={`q-${example.id}`} value={question} onChange={(event) => setQuestion(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor={`a-${example.id}`}>...a IA deve responder</FieldLabel>
            <Textarea id={`a-${example.id}`} rows={4} value={answer} onChange={(event) => setAnswer(event.target.value)} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await updateExample(example.id, question, answer)
                if (result.ok) {
                  toast.success(result.message)
                  setOpen(false)
                } else {
                  toast.error(result.message)
                }
              })
            }
          >
            {pending ? <Spinner data-icon="inline-start" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ExamplesManager({
  accountId,
  examples,
  canManage,
}: {
  accountId: string
  examples: ExampleEntry[]
  canManage: boolean
}) {
  const [removing, startRemoving] = useTransition()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {examples.length
            ? `${examples.length} resposta${examples.length === 1 ? "" : "s"} ensinada${examples.length === 1 ? "" : "s"}`
            : "Nenhuma resposta ensinada ainda"}
        </p>
        {canManage ? <AddExampleDialog accountId={accountId} /> : null}
      </div>
      {examples.length ? (
        <div className="flex flex-col divide-y rounded-xl border bg-card">
          {examples.map((example) => (
            <div key={example.id} className="flex items-start gap-3 p-4">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <p className="text-sm font-medium">{example.question_text}</p>
                <p className="text-sm text-muted-foreground">{example.answer_text}</p>
                <div>
                  <Badge variant={example.item_id ? "outline" : "secondary"}>
                    {example.item_id ? `Só no anúncio ${example.item_title ?? example.item_id}` : "Todos os anúncios"}
                  </Badge>
                </div>
              </div>
              {canManage ? (
                <div className="flex shrink-0 gap-1">
                  <EditExampleDialog example={example} />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remover resposta ensinada"
                    disabled={removing}
                    onClick={() =>
                      startRemoving(async () => {
                        const result = await deleteExample(example.id)
                        if (result.ok) toast.success(result.message)
                        else toast.error(result.message)
                      })
                    }
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <Empty className="border border-dashed bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GraduationCapIcon />
            </EmptyMedia>
            <EmptyTitle>A IA aprende com você</EmptyTitle>
            <EmptyDescription>
              Ao responder uma pergunta em Perguntas, deixe marcado &ldquo;Ensinar a IA&rdquo;. Ou ensine aqui uma
              resposta para as dúvidas mais comuns.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  )
}
