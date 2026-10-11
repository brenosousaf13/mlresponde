"use client"

import Link from "next/link"
import { useActionState } from "react"

import { signIn } from "@/app/(auth)/actions"
import { ResendConfirmationForm } from "@/components/auth/resend-confirmation-form"
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

export function LoginForm({ next, notice }: { next?: string; notice?: FormState }) {
  const [state, formAction, pending] = useActionState(signIn, notice ?? {})

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Entrar</CardTitle>
          <CardDescription>Acesse sua conta para gerenciar suas respostas</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <FormMessage state={state} />
          {state.code === "email_not_confirmed" && state.values?.email ? (
            <ResendConfirmationForm email={state.values.email} />
          ) : null}
          <form action={formAction} noValidate>
            <input type="hidden" name="next" value={next ?? ""} />
            <FieldGroup>
              <Field data-invalid={hasFieldError(state, "email") || undefined}>
                <FieldLabel htmlFor="email">E-mail</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="voce@sualoja.com.br"
                  defaultValue={state.values?.email}
                  aria-invalid={hasFieldError(state, "email") || undefined}
                  required
                />
                <FieldError errors={fieldErrors(state, "email")} />
              </Field>
              <Field data-invalid={hasFieldError(state, "password") || undefined}>
                <div className="flex items-center">
                  <FieldLabel htmlFor="password">Senha</FieldLabel>
                  <Link
                    href="/recuperar-senha"
                    className="ml-auto text-sm underline-offset-4 hover:underline"
                  >
                    Esqueceu a senha?
                  </Link>
                </div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={hasFieldError(state, "password") || undefined}
                  required
                />
                <FieldError errors={fieldErrors(state, "password")} />
              </Field>
              <Field>
                <SubmitButton pending={pending} pendingLabel="Entrando...">
                  Entrar
                </SubmitButton>
                <FieldDescription className="text-center">
                  Ainda não tem conta? <Link href="/cadastro">Teste grátis por 7 dias</Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
