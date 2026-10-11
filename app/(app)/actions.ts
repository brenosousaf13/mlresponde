"use server"

import { revalidatePath } from "next/cache"

import { getAppContext } from "@/lib/dal/app-context"
import { createServiceClient } from "@/lib/supabase/admin"

export async function completeTour() {
  const context = await getAppContext()
  if (context.profile.tourCompletedAt) return
  const admin = createServiceClient()
  const { error } = await admin
    .from("profiles")
    .update({ tour_completed_at: new Date().toISOString() })
    .eq("id", context.user.id)
  if (error) throw error
  revalidatePath("/", "layout")
}
