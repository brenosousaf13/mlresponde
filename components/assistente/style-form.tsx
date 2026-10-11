"use client"

import { useActionState, useState } from "react"

import { updateStyle } from "@/app/(app)/assistente/actions"
import { AffixesFields, ThresholdOptions, ToneOptions, type StyleValues } from "@/components/assistente/style-fields"
import { FormMessage, SubmitButton, fieldErrors } from "@/components/forms/form-feedback"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldError } from "@/components/ui/field"

export function StyleForm({ accountId, initial, disabled }: { accountId: string; initial: StyleValues; disabled?: boolean }) {
  const [state, formAction, pending] = useActionState(updateStyle, {})
  const [values, setValues] = useState<StyleValues>(initial)

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="tone" value={values.tone} />
      <input type="hidden" name="threshold" value={values.threshold} />
      <FormMessage state={state} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tom das respostas</CardTitle>
            <CardDescription>Como a IA escreve para os compradores.</CardDescription>
          </CardHeader>
          <CardContent>
            <ToneOptions value={values.tone} onChange={(tone) => setValues({ ...values, tone })} disabled={disabled} />
            <FieldError errors={fieldErrors(state, "tone")} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Quando a IA responde sozinha</CardTitle>
            <CardDescription>
              Abaixo do nível escolhido, a pergunta fica para você em Perguntas, já com um rascunho.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ThresholdOptions
              value={values.threshold}
              onChange={(threshold) => setValues({ ...values, threshold })}
              disabled={disabled}
            />
            <FieldError errors={fieldErrors(state, "threshold")} />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Saudação e assinatura</CardTitle>
          <CardDescription>
            Entram em todas as respostas, inclusive para quem já comprou. Evite &ldquo;Aguardamos sua compra&rdquo;.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AffixesFields
            greeting={values.greeting}
            signature={values.signature}
            onChange={(affixes) => setValues({ ...values, ...affixes })}
            disabled={disabled}
            errors={{
              greeting: <FieldError errors={fieldErrors(state, "greeting")} />,
              signature: <FieldError errors={fieldErrors(state, "signature")} />,
            }}
          />
        </CardContent>
      </Card>
      {disabled ? null : (
        <div>
          <SubmitButton pending={pending} pendingLabel="Salvando...">
            Salvar jeito de responder
          </SubmitButton>
        </div>
      )}
    </form>
  )
}
