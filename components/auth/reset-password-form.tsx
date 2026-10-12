"use client"

import Link from "next/link"
import { useActionState } from "react"

import { updatePassword } from "@/app/(auth)/actions"
import {
  FormMessage,
  SubmitButton,
  fieldErrors,
  hasFieldError,
} from "@/components/forms/form-feedback"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(updatePassword, {})

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Crie uma nova senha</CardTitle>
        <CardDescription>Depois disso você já entra na plataforma</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <FormMessage state={state} />
        {state.code === "session_missing" ? (
          <Link href="/recuperar-senha" className="text-center text-sm underline underline-offset-4">
            Pedir um novo link
          </Link>
        ) : null}
        <form action={formAction} noValidate>
          <FieldGroup>
            <Field data-invalid={hasFieldError(state, "password") || undefined}>
              <FieldLabel htmlFor="password">Nova senha</FieldLabel>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                aria-invalid={hasFieldError(state, "password") || undefined}
                required
              />
              <FieldDescription>Use pelo menos 8 caracteres, com letras e números.</FieldDescription>
              <FieldError errors={fieldErrors(state, "password")} />
            </Field>
            <Field data-invalid={hasFieldError(state, "confirmPassword") || undefined}>
              <FieldLabel htmlFor="confirmPassword">Confirme a nova senha</FieldLabel>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                aria-invalid={hasFieldError(state, "confirmPassword") || undefined}
                required
              />
              <FieldError errors={fieldErrors(state, "confirmPassword")} />
            </Field>
            <SubmitButton pending={pending} pendingLabel="Salvando...">
              Salvar nova senha
            </SubmitButton>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
