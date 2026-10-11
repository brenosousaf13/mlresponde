"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { canManageOrganization, getAppContext } from "@/lib/dal/app-context"
import { createServiceClient } from "@/lib/supabase/admin"
import { formValues, onboardingSchema, type FormState } from "@/lib/validation/forms"

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
    if (error) return { message: "Não foi possível salvar agora. Tente novamente.", values }
  }

  const { error } = await admin
    .from("profiles")
    .update({
      whatsapp: parsed.data.whatsapp,
      onboarding_completed_at: context.profile.onboardingCompletedAt ?? new Date().toISOString(),
    })
    .eq("id", context.user.id)
  if (error) return { message: "Não foi possível salvar agora. Tente novamente.", values }

  revalidatePath("/", "layout")
  redirect("/contas")
}
