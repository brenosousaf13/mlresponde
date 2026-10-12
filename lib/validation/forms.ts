import { z } from "zod"

export type FormState = {
  ok?: boolean
  message?: string
  code?: string
  fieldErrors?: Record<string, string[] | undefined>
  values?: Record<string, string>
}

export function normalizeWhatsapp(input: string): string | null {
  let digits = input.replace(/\D/g, "")
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2)
  }
  if (digits.length !== 10 && digits.length !== 11) {
    return null
  }
  if (digits[0] === "0" || digits[1] === "0") {
    return null
  }
  if (digits.length === 11 && digits[2] !== "9") {
    return null
  }
  return digits
}

export function formatWhatsapp(digits: string | null | undefined): string {
  if (!digits) return ""
  const ddd = digits.slice(0, 2)
  const rest = digits.slice(2)
  const split = rest.length === 9 ? 5 : 4
  return `(${ddd}) ${rest.slice(0, split)}-${rest.slice(split)}`
}

export function safeRedirectPath(value: unknown, fallback: string): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\")
  ) {
    return fallback
  }
  return value
}

const email = z
  .string({ required_error: "Informe seu e-mail." })
  .trim()
  .toLowerCase()
  .email("Informe um e-mail válido.")
  .max(254, "E-mail muito longo.")

const newPassword = z
  .string({ required_error: "Informe uma senha." })
  .min(8, "A senha precisa ter pelo menos 8 caracteres.")
  .max(72, "A senha pode ter no máximo 72 caracteres.")
  // Mesma regra do Supabase Auth (letras e números): o aviso aparece antes de chegar ao servidor.
  .regex(/[A-Za-z]/, "Use pelo menos uma letra.")
  .regex(/[0-9]/, "Use pelo menos um número.")

const fullName = z
  .string({ required_error: "Informe seu nome." })
  .trim()
  .min(2, "Informe seu nome.")
  .max(120, "Nome muito longo.")

const storeName = z
  .string({ required_error: "Informe o nome da sua loja ou empresa." })
  .trim()
  .min(2, "Informe o nome da sua loja ou empresa.")
  .max(80, "Nome muito longo.")

const whatsapp = z
  .string({ required_error: "Informe seu WhatsApp." })
  .transform((value, ctx) => {
    const normalized = normalizeWhatsapp(value)
    if (!normalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe um WhatsApp válido com DDD, por exemplo (11) 91234-5678.",
      })
      return z.NEVER
    }
    return normalized
  })

const checkbox = (message: string) =>
  z.preprocess(
    (value) => value === "on" || value === "true" || value === true,
    z.literal(true, { errorMap: () => ({ message }) })
  )

export const loginSchema = z.object({
  email,
  password: z.string({ required_error: "Informe sua senha." }).min(1, "Informe sua senha."),
  next: z.string().optional(),
})

const confirmPassword = z.string({ required_error: "Confirme sua senha." })

export const signupSchema = z.object({
  fullName,
  email,
  password: newPassword,
  confirmPassword,
  acceptTerms: checkbox("Para continuar, aceite os Termos de Uso e a Política de Privacidade."),
})

export const emailOnlySchema = z.object({ email })

export const newPasswordSchema = z.object({ password: newPassword, confirmPassword })

export const changePasswordSchema = z.object({
  currentPassword: z
    .string({ required_error: "Informe sua senha atual." })
    .min(1, "Informe sua senha atual."),
  password: newPassword,
  confirmPassword,
})

type FieldErrors = Record<string, string[] | undefined>

export type ParseResult<T> = { success: true; data: T } | { success: false; fieldErrors: FieldErrors }

export function parseWithPasswordConfirmation<T extends z.ZodTypeAny>(
  schema: T,
  input: Record<string, unknown>
): ParseResult<z.infer<T>> {
  const result = schema.safeParse(input)
  const mismatch =
    typeof input.password === "string" &&
    input.password.length > 0 &&
    input.password !== input.confirmPassword
  if (result.success && !mismatch) {
    return { success: true, data: result.data }
  }
  const fieldErrors: FieldErrors = result.success ? {} : result.error.flatten().fieldErrors
  if (mismatch) {
    fieldErrors.confirmPassword = [...(fieldErrors.confirmPassword ?? []), "As senhas não conferem."]
  }
  return { success: false, fieldErrors }
}

export const onboardingSchema = z.object({ storeName, whatsapp })

export const profileSchema = z.object({ fullName, whatsapp })

export const organizationSchema = z.object({ storeName })

export function formValues(formData: FormData, keys: readonly string[]) {
  const values: Record<string, string> = {}
  for (const key of keys) {
    const value = formData.get(key)
    if (typeof value === "string") values[key] = value
  }
  return values
}
