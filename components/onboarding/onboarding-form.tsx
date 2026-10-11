"use client"

import { useActionState } from "react"

import { completeOnboarding } from "@/app/onboarding/actions"
import {
  FormMessage,
  SubmitButton,
  fieldErrors,
  hasFieldError,
} from "@/components/forms/form-feedback"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function OnboardingForm({
  defaultStoreName,
  defaultWhatsapp,
  submitLabel = "Continuar",
}: {
  defaultStoreName: string
  defaultWhatsapp: string
  submitLabel?: string
}) {
  const [state, formAction, pending] = useActionState(completeOnboarding, {})

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6">
      <FormMessage state={state} />
      <FieldGroup>
        <Field data-invalid={hasFieldError(state, "storeName") || undefined}>
          <FieldLabel htmlFor="storeName">Nome da sua loja ou empresa</FieldLabel>
          <Input
            id="storeName"
            name="storeName"
            autoComplete="organization"
            placeholder="Ex.: Casa da Bike"
            defaultValue={state.values?.storeName ?? defaultStoreName}
            aria-invalid={hasFieldError(state, "storeName") || undefined}
            required
          />
          <FieldError errors={fieldErrors(state, "storeName")} />
        </Field>
        <Field data-invalid={hasFieldError(state, "whatsapp") || undefined}>
          <FieldLabel htmlFor="whatsapp">WhatsApp</FieldLabel>
          <Input
            id="whatsapp"
            name="whatsapp"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="(11) 91234-5678"
            defaultValue={state.values?.whatsapp ?? defaultWhatsapp}
            aria-invalid={hasFieldError(state, "whatsapp") || undefined}
            required
          />
          <FieldDescription>
            Usamos para avisos importantes da sua conta. Nada de spam.
          </FieldDescription>
          <FieldError errors={fieldErrors(state, "whatsapp")} />
        </Field>
        <SubmitButton pending={pending} pendingLabel="Salvando...">
          {submitLabel}
        </SubmitButton>
      </FieldGroup>
    </form>
  )
}
