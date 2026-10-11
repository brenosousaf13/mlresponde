"use client"

import { useActionState } from "react"

import { resendConfirmation } from "@/app/(auth)/actions"
import { FormMessage, SubmitButton } from "@/components/forms/form-feedback"

export function ResendConfirmationForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(resendConfirmation, {})

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="email" value={email} />
      <FormMessage state={state} />
      <SubmitButton pending={pending} variant="outline" pendingLabel="Enviando...">
        Reenviar e-mail de confirmação
      </SubmitButton>
    </form>
  )
}
