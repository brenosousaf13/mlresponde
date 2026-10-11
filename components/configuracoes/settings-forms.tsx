"use client"

import { useActionState } from "react"

import {
  changePassword,
  updateOrganization,
  updateProfile,
} from "@/app/(app)/configuracoes/actions"
import {
  FormMessage,
  SubmitButton,
  fieldErrors,
  hasFieldError,
} from "@/components/forms/form-feedback"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function ProfileForm({
  fullName,
  whatsapp,
  email,
}: {
  fullName: string
  whatsapp: string
  email: string
}) {
  const [state, formAction, pending] = useActionState(updateProfile, {})

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6">
      <FormMessage state={state} />
      <FieldGroup>
        <Field data-invalid={hasFieldError(state, "fullName") || undefined}>
          <FieldLabel htmlFor="fullName">Nome</FieldLabel>
          <Input
            id="fullName"
            name="fullName"
            autoComplete="name"
            defaultValue={state.values?.fullName ?? fullName}
            aria-invalid={hasFieldError(state, "fullName") || undefined}
          />
          <FieldError errors={fieldErrors(state, "fullName")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="email">E-mail</FieldLabel>
          <Input id="email" value={email} disabled readOnly />
          <FieldDescription>Para trocar o e-mail de acesso, fale com o suporte.</FieldDescription>
        </Field>
        <Field data-invalid={hasFieldError(state, "whatsapp") || undefined}>
          <FieldLabel htmlFor="whatsapp">WhatsApp</FieldLabel>
          <Input
            id="whatsapp"
            name="whatsapp"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            defaultValue={state.values?.whatsapp ?? whatsapp}
            aria-invalid={hasFieldError(state, "whatsapp") || undefined}
          />
          <FieldError errors={fieldErrors(state, "whatsapp")} />
        </Field>
        <div>
          <SubmitButton pending={pending} pendingLabel="Salvando...">
            Salvar
          </SubmitButton>
        </div>
      </FieldGroup>
    </form>
  )
}

export function OrganizationForm({ storeName }: { storeName: string }) {
  const [state, formAction, pending] = useActionState(updateOrganization, {})

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6">
      <FormMessage state={state} />
      <FieldGroup>
        <Field data-invalid={hasFieldError(state, "storeName") || undefined}>
          <FieldLabel htmlFor="storeName">Nome da loja ou empresa</FieldLabel>
          <Input
            id="storeName"
            name="storeName"
            autoComplete="organization"
            defaultValue={state.values?.storeName ?? storeName}
            aria-invalid={hasFieldError(state, "storeName") || undefined}
          />
          <FieldError errors={fieldErrors(state, "storeName")} />
        </Field>
        <div>
          <SubmitButton pending={pending} pendingLabel="Salvando...">
            Salvar
          </SubmitButton>
        </div>
      </FieldGroup>
    </form>
  )
}

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(changePassword, {})

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6">
      <FormMessage state={state} />
      <FieldGroup>
        <Field data-invalid={hasFieldError(state, "currentPassword") || undefined}>
          <FieldLabel htmlFor="currentPassword">Senha atual</FieldLabel>
          <Input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            aria-invalid={hasFieldError(state, "currentPassword") || undefined}
          />
          <FieldError errors={fieldErrors(state, "currentPassword")} />
        </Field>
        <Field data-invalid={hasFieldError(state, "password") || undefined}>
          <FieldLabel htmlFor="password">Nova senha</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={hasFieldError(state, "password") || undefined}
          />
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
          />
          <FieldError errors={fieldErrors(state, "confirmPassword")} />
        </Field>
        <div>
          <SubmitButton pending={pending} pendingLabel="Alterando...">
            Alterar senha
          </SubmitButton>
        </div>
      </FieldGroup>
    </form>
  )
}
