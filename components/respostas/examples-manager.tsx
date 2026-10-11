"use client"

import { GraduationCapIcon, Trash2Icon } from "lucide-react"
import { useActionState, useTransition } from "react"
import { toast } from "sonner"

import { addExample, deleteExample } from "@/app/(app)/respostas/actions"
import { FormMessage, SubmitButton, fieldErrors, hasFieldError } from "@/components/forms/form-feedback"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Textarea } from "@/components/ui/textarea"

export type ExampleEntry = {
  id: string
  item_id: string | null
  item_title: string | null
  question_text: string
  answer_text: string
}

export function ExamplesManager({ accountId, examples }: { accountId: string; examples: ExampleEntry[] }) {
  const [state, formAction, pending] = useActionState(addExample, {})
  const [removing, startRemoving] = useTransition()

  return (
    <div className="flex flex-col gap-4">
      <Collapsible>
        <CollapsibleTrigger render={<Button variant="outline" size="sm" />}>
          <GraduationCapIcon data-icon="inline-start" />
          Ensinar uma resposta
        </CollapsibleTrigger>
        <CollapsibleContent>
          <form action={formAction} className="mt-4 flex flex-col gap-4" key={state.ok ? state.message : "form"}>
            <input type="hidden" name="accountId" value={accountId} />
            <FormMessage state={state} />
            <FieldGroup>
              <Field data-invalid={hasFieldError(state, "question") || undefined}>
                <FieldLabel htmlFor="example-question">Quando perguntarem...</FieldLabel>
                <Input
                  id="example-question"
                  name="question"
                  placeholder="Vocês emitem nota fiscal?"
                  defaultValue={state.ok ? "" : state.values?.question}
                />
                <FieldError errors={fieldErrors(state, "question")} />
              </Field>
              <Field data-invalid={hasFieldError(state, "answer") || undefined}>
                <FieldLabel htmlFor="example-answer">...a IA deve responder</FieldLabel>
                <Textarea
                  id="example-answer"
                  name="answer"
                  rows={3}
                  placeholder="Sim, todos os pedidos saem com nota fiscal."
                  defaultValue={state.ok ? "" : state.values?.answer}
                />
                <FieldError errors={fieldErrors(state, "answer")} />
              </Field>
              <div>
                <SubmitButton pending={pending} pendingLabel="Salvando...">
                  Salvar
                </SubmitButton>
              </div>
            </FieldGroup>
          </form>
        </CollapsibleContent>
      </Collapsible>
      {examples.length ? (
        <ItemGroup className="gap-2">
          {examples.map((example) => (
            <Item key={example.id} variant="outline" size="sm" className="items-start">
              <ItemContent className="min-w-0">
                <ItemTitle className="leading-snug">{example.question_text}</ItemTitle>
                <ItemDescription className="line-clamp-3 text-foreground/80">{example.answer_text}</ItemDescription>
                <p className="text-xs text-muted-foreground">
                  {example.item_id ? `Só no anúncio ${example.item_title ?? example.item_id}` : "Vale para todos os anúncios"}
                </p>
              </ItemContent>
              <ItemActions>
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
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nenhuma resposta ensinada ainda. Ao responder uma pergunta, marque &quot;Ensinar a IA&quot; para ela aprender.
        </p>
      )}
    </div>
  )
}
