"use client"

import Link from "next/link"
import { useActionState } from "react"

import { requestPasswordReset } from "@/app/(auth)/actions"
import {
  FormMessage,
  SubmitButton,
  fieldErrors,
  hasFieldError,
} from "@/components/forms/form-feedback"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { FormState } from "@/lib/validation/forms"

export function ForgotPasswordForm({ notice }: { notice?: FormState }) {
  const [state, formAction, pending] = useActionState(requestPasswordReset, notice ?? {})

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Esqueceu a senha?</CardTitle>
        <CardDescription>Enviaremos um link para você criar uma nova senha</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <FormMessage state={state} />
        <form action={formAction} noValidate>
          <FieldGroup>
            <Field data-invalid={hasFieldError(state, "email") || undefined}>
              <FieldLabel htmlFor="email">E-mail da conta</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={state.values?.email}
                aria-invalid={hasFieldError(state, "email") || undefined}
                required
              />
              <FieldError errors={fieldErrors(state, "email")} />
            </Field>
            <Field>
              <SubmitButton pending={pending} pendingLabel="Enviando...">
                Enviar link
              </SubmitButton>
              <FieldDescription className="text-center">
                Lembrou? <Link href="/login">Voltar para o login</Link>
              </FieldDescription>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
