"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { saveBillingProfile } from "@/lib/dal/billing"
import { canManageOrganization, getAppContext } from "@/lib/dal/app-context"
import { createServiceClient } from "@/lib/supabase/admin"
import { BILLING_FIELDS, billingSaveError, parseBillingProfile } from "@/lib/validation/billing"
import { formValues, onboardingSchema, type FormState } from "@/lib/validation/forms"

const SAVE_ERROR = "Não foi possível salvar agora. Tente novamente."

/** Etapa 1: nome da loja + WhatsApp. Se ainda faltar o CPF/CNPJ, segue para a etapa 2. */
export async function completeOnboarding(_previous: FormState, formData: FormData): Promise<FormState> {
  const context = await getAppContext()
  const values = formValues(formData, ["storeName", "whatsapp"])
  const parsed = onboardingSchema.safeParse({
    storeName: formData.get("storeName"),
    whatsapp: formData.get("whatsapp"),
  })
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors, values }
  }

  const admin = createServiceClient()
  if (canManageOrganization(context.role)) {
    const { error } = await admin
      .from("organizations")
      .update({ name: parsed.data.storeName })
      .eq("id", context.organization.id)
    if (error) return { message: SAVE_ERROR, values }
  }

  const billingPending = context.billing.required && !context.billing.completed
  const { error } = await admin
    .from("profiles")
    .update({
      whatsapp: parsed.data.whatsapp,
      ...(billingPending
        ? {}
        : { onboarding_completed_at: context.profile.onboardingCompletedAt ?? new Date().toISOString() }),
    })
    .eq("id", context.user.id)
  if (error) return { message: SAVE_ERROR, values }

  revalidatePath("/", "layout")
  redirect(billingPending ? "/onboarding" : "/contas")
}

/** Etapa 2 (ou única, para contas antigas): CPF/CNPJ + endereço de cobrança. Conclui o cadastro. */
export async function completeBillingStep(_previous: FormState, formData: FormData): Promise<FormState> {
  const context = await getAppContext()
  const values = formValues(formData, BILLING_FIELDS)
  if (!canManageOrganization(context.role)) {
    return { message: "Só o dono ou um administrador da loja pode informar os dados de cobrança.", values }
  }

  const parsed = parseBillingProfile(Object.fromEntries(formData), { withDocument: !context.billing.completed })
  if (!parsed.success) return { fieldErrors: parsed.fieldErrors, values }

  const result = await saveBillingProfile({
    organizationId: context.organization.id,
    userId: context.user.id,
    address: parsed.data.address,
    document: parsed.data.document,
  })
  if (!result.ok) return billingSaveError(result.reason, values.documentType ?? "cpf", values)

  // A etapa 1 (WhatsApp) é obrigatória: sem ela, o cadastro não termina.
  if (!context.profile.whatsapp) {
    revalidatePath("/", "layout")
    redirect("/onboarding")
  }

  const firstTime = !context.profile.onboardingCompletedAt
  if (firstTime) {
    const { error } = await createServiceClient()
      .from("profiles")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", context.user.id)
    if (error) return { message: SAVE_ERROR, values }
  }

  revalidatePath("/", "layout")
  redirect(firstTime ? "/contas" : "/painel")
}
