"use client"

import Link from "next/link"
import { useActionState } from "react"

import { signUp } from "@/app/(auth)/actions"
import {
  FormMessage,
  SubmitButton,
  fieldErrors,
  hasFieldError,
} from "@/components/forms/form-feedback"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { siteConfig } from "@/lib/config/site"

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signUp, {})

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Crie sua conta</CardTitle>
          <CardDescription>
            Teste grátis por {siteConfig.trialDays} dias. Não pedimos cartão.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <FormMessage state={state} />
          <form action={formAction} noValidate>
            <FieldGroup>
              <Field data-invalid={hasFieldError(state, "fullName") || undefined}>
                <FieldLabel htmlFor="fullName">Seu nome</FieldLabel>
                <Input
                  id="fullName"
                  name="fullName"
                  autoComplete="name"
                  placeholder="Maria Souza"
                  defaultValue={state.values?.fullName}
                  aria-invalid={hasFieldError(state, "fullName") || undefined}
                  required
                />
                <FieldError errors={fieldErrors(state, "fullName")} />
              </Field>
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
              <Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field data-invalid={hasFieldError(state, "password") || undefined}>
                    <FieldLabel htmlFor="password">Senha</FieldLabel>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      aria-invalid={hasFieldError(state, "password") || undefined}
                      required
                    />
                  </Field>
                  <Field data-invalid={hasFieldError(state, "confirmPassword") || undefined}>
                    <FieldLabel htmlFor="confirmPassword">Confirme a senha</FieldLabel>
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      aria-invalid={hasFieldError(state, "confirmPassword") || undefined}
                      required
                    />
                  </Field>
                </div>
                <FieldError errors={fieldErrors(state, "password")} />
                <FieldError errors={fieldErrors(state, "confirmPassword")} />
                <FieldDescription>Use pelo menos 8 caracteres.</FieldDescription>
              </Field>
              <Field
                orientation="horizontal"
                data-invalid={hasFieldError(state, "acceptTerms") || undefined}
              >
                <Checkbox
                  id="acceptTerms"
                  name="acceptTerms"
                  value="on"
                  aria-invalid={hasFieldError(state, "acceptTerms") || undefined}
                />
                <FieldLabel htmlFor="acceptTerms" className="font-normal leading-snug">
                  <span>
                    Li e aceito os{" "}
                    <Link href="/termos" target="_blank" className="underline underline-offset-4">
                      Termos de Uso
                    </Link>{" "}
                    e a{" "}
                    <Link href="/privacidade" target="_blank" className="underline underline-offset-4">
                      Política de Privacidade
                    </Link>
                    .
                  </span>
                </FieldLabel>
              </Field>
              <FieldError errors={fieldErrors(state, "acceptTerms")} />
              <Field>
                <SubmitButton pending={pending} pendingLabel="Criando conta...">
                  Criar conta e começar o teste
                </SubmitButton>
                <FieldDescription className="text-center">
                  Já tem conta? <Link href="/login">Entrar</Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
