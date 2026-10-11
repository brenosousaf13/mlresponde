"use client"

import { useActionState, useState } from "react"

import { updateExtraInfo } from "@/app/(app)/assistente/actions"
import { FormMessage, SubmitButton, fieldErrors, hasFieldError } from "@/components/forms/form-feedback"
import { Field, FieldDescription, FieldError } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"

export function ExtraInfoForm({ accountId, initial, disabled }: { accountId: string; initial: string; disabled?: boolean }) {
  const [state, formAction, pending] = useActionState(updateExtraInfo, {})
  const [briefing, setBriefing] = useState(initial)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="accountId" value={accountId} />
      <FormMessage state={state} />
      <Field data-invalid={hasFieldError(state, "briefing") || undefined}>
        <Textarea
          name="briefing"
          aria-label="Outras informações"
          value={briefing}
          onChange={(event) => setBriefing(event.target.value)}
          rows={6}
          maxLength={5000}
          disabled={disabled}
          placeholder={"Ex.:\nDe 20/12 a 05/01 os pedidos saem a partir do dia 06/01.\nO kit com 2 unidades tem anúncio próprio."}
        />
        <FieldDescription>{briefing.length}/5000</FieldDescription>
        <FieldError errors={fieldErrors(state, "briefing")} />
      </Field>
      {disabled ? null : (
        <div>
          <SubmitButton pending={pending} pendingLabel="Salvando...">
            Salvar
          </SubmitButton>
        </div>
      )}
    </form>
  )
}
