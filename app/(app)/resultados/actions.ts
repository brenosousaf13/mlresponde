"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { canManageOrganization, requireSection } from "@/lib/dal/app-context"
import { ASSUMPTION_LIMITS } from "@/lib/results/metrics"
import { createServiceClient } from "@/lib/supabase/admin"

export type AssumptionsResult = {
  ok: boolean
  message?: string
  fieldErrors?: Partial<Record<"minutesPerAnswer" | "hourlyCost", string>>
}

const decimal = (label: string, limits: { min: number; max: number }, unit: string) =>
  z.preprocess(
    (value) => (typeof value === "string" ? Number(value.replace(/\s/g, "").replace(",", ".")) : value),
    z
      .number({ invalid_type_error: `Informe ${label}.` })
      .min(limits.min, `Use pelo menos ${String(limits.min).replace(".", ",")} ${unit}.`)
      .max(limits.max, `Use no máximo ${limits.max.toLocaleString("pt-BR")} ${unit}.`)
  )

const schema = z.object({
  minutesPerAnswer: decimal("os minutos por resposta", ASSUMPTION_LIMITS.minutesPerAnswer, "min"),
  hourlyCost: decimal("o custo da hora", ASSUMPTION_LIMITS.hourlyCost, "reais"),
})

/** Salva as premissas do cálculo de economia (valem para toda a organização). */
export async function updateAssumptions(input: { minutesPerAnswer: string; hourlyCost: string }): Promise<AssumptionsResult> {
  const context = await requireSection("resultados")
  if (!canManageOrganization(context.role)) {
    return { ok: false, message: "Só o dono ou um administrador pode alterar o cálculo." }
  }

  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors
    return {
      ok: false,
      fieldErrors: { minutesPerAnswer: errors.minutesPerAnswer?.[0], hourlyCost: errors.hourlyCost?.[0] },
    }
  }

  const admin = createServiceClient()
  const { error } = await admin
    .from("organizations")
    .update({
      analytics_minutes_per_answer: Math.round(parsed.data.minutesPerAnswer * 10) / 10,
      analytics_hourly_cost: Math.round(parsed.data.hourlyCost * 100) / 100,
    })
    .eq("id", context.organization.id)
  if (error) {
    console.error("[resultados] premissas:", error.message)
    return { ok: false, message: "Não foi possível salvar agora. Tente novamente." }
  }

  revalidatePath("/resultados")
  return { ok: true, message: "Cálculo atualizado." }
}