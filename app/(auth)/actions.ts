"use server"

import { redirect } from "next/navigation"

import { siteConfig } from "@/lib/config/site"
import { authCallbackUrl } from "@/lib/http/site-url"
import {
  emailOnlySchema,
  formValues,
  loginSchema,
  newPasswordSchema,
  parseWithPasswordConfirmation,
  safeRedirectPath,
  signupSchema,
  type FormState,
} from "@/lib/validation/forms"
import { createClient } from "@/lib/supabase/server"

const GENERIC_ERROR = "Não foi possível concluir agora. Tente novamente em instantes."

function rateLimitMessage(code: string | undefined) {
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit") {
    return "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo."
  }
  return null
}

export async function signIn(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["email"])
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  })
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors, values }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    if (error.code === "email_not_confirmed") {
      return {
        code: "email_not_confirmed",
        message: "Seu e-mail ainda não foi confirmado. Abra o link que enviamos para entrar.",
        values,
      }
    }
    if (error.code === "invalid_credentials") {
      return { message: "E-mail ou senha incorretos.", values }
    }
    return { message: rateLimitMessage(error.code) ?? GENERIC_ERROR, values }
  }

  redirect(safeRedirectPath(parsed.data.next, "/painel"))
}

export async function signUp(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["fullName", "email"])
  const parsed = parseWithPasswordConfirmation(signupSchema, {
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    acceptTerms: formData.get("acceptTerms"),
  })
  if (!parsed.success) {
    return { fieldErrors: parsed.fieldErrors, values }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: await authCallbackUrl("/onboarding"),
      data: {
        full_name: parsed.data.fullName,
        terms_version: siteConfig.termsVersion,
      },
    },
  })

  if (error) {
    if (error.code === "weak_password") {
      return {
        fieldErrors: { password: ["Escolha uma senha mais forte."] },
        values,
      }
    }
    if (error.code === "email_address_invalid") {
      return { fieldErrors: { email: ["Esse e-mail não é aceito. Use outro endereço."] }, values }
    }
    if (error.code === "email_address_not_authorized") {
      return {
        message: "Não conseguimos enviar o e-mail de confirmação para esse endereço agora. Tente outro e-mail.",
        values,
      }
    }
    return { message: rateLimitMessage(error.code) ?? GENERIC_ERROR, values }
  }

  redirect(`/verificar-email?email=${encodeURIComponent(parsed.data.email)}`)
}

export async function resendConfirmation(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = emailOnlySchema.safeParse({ email: formData.get("email") })
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo: await authCallbackUrl("/onboarding") },
  })
  if (error) {
    const limited = rateLimitMessage(error.code)
    if (limited) return { message: limited }
  }

  return {
    ok: true,
    message: "Se houver um cadastro pendente com esse e-mail, enviamos um novo link de confirmação.",
  }
}

export async function requestPasswordReset(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["email"])
  const parsed = emailOnlySchema.safeParse({ email: formData.get("email") })
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors, values }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: await authCallbackUrl("/redefinir-senha"),
  })
  if (error) {
    const limited = rateLimitMessage(error.code)
    if (limited) return { message: limited, values }
  }

  return {
    ok: true,
    message: "Se existir uma conta com esse e-mail, você vai receber um link para criar uma nova senha.",
    values,
  }
}

export async function updatePassword(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseWithPasswordConfirmation(newPasswordSchema, {
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  })
  if (!parsed.success) {
    return { fieldErrors: parsed.fieldErrors }
  }

  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) {
    return {
      message: "Seu link expirou. Peça um novo link de redefinição de senha.",
      code: "session_missing",
    }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    if (error.code === "same_password") {
      return { fieldErrors: { password: ["A nova senha precisa ser diferente da atual."] } }
    }
    if (error.code === "weak_password") {
      return { fieldErrors: { password: ["Escolha uma senha mais forte."] } }
    }
    return { message: GENERIC_ERROR }
  }

  redirect("/painel")
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}
