"use server"

import { revalidatePath } from "next/cache"

import { canManageOrganization, requireSection } from "@/lib/dal/app-context"
import { createServiceClient, createStatelessAuthClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import {
  changePasswordSchema,
  formValues,
  organizationSchema,
  parseWithPasswordConfirmation,
  profileSchema,
  type FormState,
} from "@/lib/validation/forms"

const SAVE_ERROR = "Não foi possível salvar agora. Tente novamente."

export async function updateProfile(_previous: FormState, formData: FormData): Promise<FormState> {
  const context = await requireSection("configuracoes")
  const values = formValues(formData, ["fullName", "whatsapp"])
  const parsed = profileSchema.safeParse({
    fullName: formData.get("fullName"),
    whatsapp: formData.get("whatsapp"),
  })
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors, values }

  const { error } = await createServiceClient()
    .from("profiles")
    .update({ full_name: parsed.data.fullName, whatsapp: parsed.data.whatsapp })
    .eq("id", context.user.id)
  if (error) return { message: SAVE_ERROR, values }

  revalidatePath("/", "layout")
  return { ok: true, message: "Dados atualizados.", values }
}

export async function updateOrganization(_previous: FormState, formData: FormData): Promise<FormState> {
  const context = await requireSection("configuracoes")
  const values = formValues(formData, ["storeName"])
  if (!canManageOrganization(context.role)) {
    return { message: "Só o dono ou um administrador pode alterar os dados da loja.", values }
  }
  const parsed = organizationSchema.safeParse({ storeName: formData.get("storeName") })
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors, values }

  const { error } = await createServiceClient()
    .from("organizations")
    .update({ name: parsed.data.storeName })
    .eq("id", context.organization.id)
  if (error) return { message: SAVE_ERROR, values }

  revalidatePath("/", "layout")
  return { ok: true, message: "Nome da loja atualizado.", values }
}

export async function changePassword(_previous: FormState, formData: FormData): Promise<FormState> {
  const context = await requireSection("configuracoes")
  const parsed = parseWithPasswordConfirmation(changePasswordSchema, {
    currentPassword: formData.get("currentPassword"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  })
  if (!parsed.success) return { fieldErrors: parsed.fieldErrors }

  const verifier = createStatelessAuthClient()
  const { error: verifyError } = await verifier.auth.signInWithPassword({
    email: context.user.email,
    password: parsed.data.currentPassword,
  })
  if (verifyError) {
    return { fieldErrors: { currentPassword: ["Senha atual incorreta."] } }
  }
  await verifier.auth.signOut({ scope: "local" })

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    if (error.code === "same_password") {
      return { fieldErrors: { password: ["A nova senha precisa ser diferente da atual."] } }
    }
    if (error.code === "weak_password") {
      return { fieldErrors: { password: ["Escolha uma senha mais forte."] } }
    }
    return { message: SAVE_ERROR }
  }

  return { ok: true, message: "Senha alterada." }
}
