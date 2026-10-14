"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import {
  cancelOrganizationSubscription,
  requestPlanChange,
  startCheckout,
  type BillingActionResult,
  type BillingActor,
} from "@/lib/billing/engine"
import { canManageOrganization, requireSection, type AppContext } from "@/lib/dal/app-context"
import { BILLING_CYCLES } from "@/lib/plans/plans"

/**
 * Assinatura pela AbacatePay. Só o dono ou um administrador da loja contrata, troca ou cancela; o servidor confere de
 * novo o plano, o preço e a situação antes de falar com a AbacatePay (lib/billing/engine.ts).
 */

const planSchema = z.enum(["starter", "pro", "escala"])
const cycleSchema = z.enum(BILLING_CYCLES)
const GENERIC = "Não foi possível concluir agora. Tente de novo em instantes."

function actorOf(context: AppContext): BillingActor {
  return {
    organizationId: context.organization.id,
    organizationPlan: context.organization.plan,
    userId: context.user.id,
    email: context.user.email,
    whatsapp: context.profile.whatsapp,
    isPlatformAdmin: context.profile.isPlatformAdmin,
  }
}

async function managerContext(): Promise<AppContext | BillingActionResult> {
  const context = await requireSection("assinatura")
  if (!canManageOrganization(context.role)) {
    return { ok: false, message: "Só o dono ou um administrador da loja pode mudar a assinatura." }
  }
  return context
}

async function run(task: () => Promise<BillingActionResult>): Promise<BillingActionResult> {
  try {
    return await task()
  } catch (error) {
    console.error("[assinatura]", error instanceof Error ? error.message : error)
    return { ok: false, message: GENERIC }
  }
}

/** Página de pagamento da AbacatePay para assinar (ou assinar de novo). Devolve o endereço para o navegador abrir. */
export async function subscribeToPlan(plan: string, cycle: string): Promise<BillingActionResult> {
  const context = await managerContext()
  if ("ok" in context) return context
  const parsedPlan = planSchema.safeParse(plan)
  const parsedCycle = cycleSchema.safeParse(cycle)
  if (!parsedPlan.success || !parsedCycle.success) return { ok: false, message: "Plano inválido." }
  return run(() => startCheckout(actorOf(context), parsedPlan.data, parsedCycle.data))
}

/** Troca de plano na assinatura atual (mesma forma de pagamento). */
export async function changePlan(plan: string): Promise<BillingActionResult> {
  const context = await managerContext()
  if ("ok" in context) return context
  const parsed = planSchema.safeParse(plan)
  if (!parsed.success) return { ok: false, message: "Plano inválido." }
  const result = await run(() => requestPlanChange(actorOf(context), parsed.data))
  if (result.ok) revalidatePath("/", "layout")
  return result
}

/** Cancela a assinatura (o acesso continua até o fim do período pago). */
export async function cancelMySubscription(): Promise<BillingActionResult> {
  const context = await managerContext()
  if ("ok" in context) return context
  const result = await run(() => cancelOrganizationSubscription(context.organization.id))
  if (result.ok) revalidatePath("/", "layout")
  return result
}