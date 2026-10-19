"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { canManageOrganization, requireSection } from "@/lib/dal/app-context"
import type { PartialRefundOffers } from "@/lib/reputation/claim-details"
import {
  analyzeClaimNow,
  executeClaimAction,
  markExclusionRequested,
  partialRefundOffersFor,
  syncClaimNow,
} from "@/lib/reputation/claims-engine"
import { createServiceClient } from "@/lib/supabase/admin"

export type ClaimActionState = { ok: boolean; message: string }

const uuid = z.string().uuid()

function claimPath(claimRowId: string) {
  return "/reputacao/reclamacoes/" + claimRowId
}

async function claimBelongs(organizationId: string, claimRowId: string) {
  if (!uuid.safeParse(claimRowId).success) return false
  const { data } = await createServiceClient()
    .from("reputation_claims")
    .select("id")
    .eq("id", claimRowId)
    .eq("organization_id", organizationId)
    .maybeSingle()
  return Boolean(data)
}

function failure(error: unknown, label: string): ClaimActionState {
  console.error("[reputação] " + label + ":", error instanceof Error ? error.message : error)
  return { ok: false, message: "Não foi possível agora. Tente de novo em instantes." }
}

/** Mensagem ao comprador ou ao mediador, com anexos (qualquer membro da loja). */
export async function sendClaimMessageAction(formData: FormData): Promise<ClaimActionState> {
  const context = await requireSection("reputacao")
  const claimRowId = String(formData.get("claimRowId") ?? "")
  const receiver = String(formData.get("receiver") ?? "")
  if (receiver !== "message_buyer" && receiver !== "message_mediator") return { ok: false, message: "Escolha para quem enviar." }
  if (!(await claimBelongs(context.organization.id, claimRowId))) return { ok: false, message: "Reclamação não encontrada." }
  const files = formData.getAll("files").filter((value): value is File => value instanceof File && value.size > 0)
  try {
    const result = await executeClaimAction({
      organizationId: context.organization.id,
      userId: context.user.id,
      claimRowId,
      canManage: canManageOrganization(context.role),
      action: { kind: receiver, message: String(formData.get("message") ?? ""), files },
    })
    revalidatePath(claimPath(claimRowId))
    return result
  } catch (error) {
    return failure(error, "mensagem da reclamação")
  }
}

const moneyActions = z.enum(["refund", "partial_refund", "allow_return", "open_dispute"])

/** Reembolso total ou parcial, devolução ou mediação: só dono/administrador e só depois da 2ª confirmação na tela. */
export async function claimMoneyAction(input: {
  claimRowId: string
  kind: string
  percentage?: number
  confirmed: boolean
}): Promise<ClaimActionState> {
  const context = await requireSection("reputacao")
  if (!canManageOrganization(context.role)) {
    return { ok: false, message: "Só o dono ou um administrador da loja pode fazer esta ação." }
  }
  const kind = moneyActions.safeParse(input.kind)
  if (!kind.success) return { ok: false, message: "Ação desconhecida." }
  if (input.confirmed !== true) return { ok: false, message: "Confirme a ação para continuar." }
  if (!(await claimBelongs(context.organization.id, input.claimRowId))) return { ok: false, message: "Reclamação não encontrada." }
  const percentage = Number(input.percentage)
  if (kind.data === "partial_refund" && !(percentage > 0 && percentage < 100)) {
    return { ok: false, message: "Escolha um percentual de reembolso." }
  }
  try {
    const result = await executeClaimAction({
      organizationId: context.organization.id,
      userId: context.user.id,
      claimRowId: input.claimRowId,
      canManage: true,
      action: kind.data === "partial_refund" ? { kind: "partial_refund", percentage } : { kind: kind.data },
    })
    revalidatePath(claimPath(input.claimRowId))
    return result
  } catch (error) {
    return failure(error, "ação " + kind.data)
  }
}

/** Ofertas de reembolso parcial que o ML permite agora (só dono/administrador). */
export async function loadPartialRefundOffers(claimRowId: string): Promise<
  { ok: true; offers: PartialRefundOffers } | { ok: false; message: string }
> {
  const context = await requireSection("reputacao")
  if (!canManageOrganization(context.role)) return { ok: false, message: "Só o dono ou um administrador da loja pode ver as ofertas." }
  if (!(await claimBelongs(context.organization.id, claimRowId))) return { ok: false, message: "Reclamação não encontrada." }
  try {
    const offers = await partialRefundOffersFor(context.organization.id, claimRowId)
    if (!offers || !offers.offers.length) return { ok: false, message: "O Mercado Livre não liberou ofertas de reembolso parcial agora." }
    return { ok: true, offers }
  } catch (error) {
    console.error("[reputação] ofertas de reembolso:", error instanceof Error ? error.message : error)
    return { ok: false, message: "Não foi possível buscar as ofertas no Mercado Livre agora." }
  }
}

/** "Pedi a exclusão" (o pedido é feito pelo vendedor no ML; a maanu acompanha). */
export async function markExclusionAction(claimRowId: string): Promise<ClaimActionState> {
  const context = await requireSection("reputacao")
  if (!(await claimBelongs(context.organization.id, claimRowId))) return { ok: false, message: "Reclamação não encontrada." }
  try {
    const result = await markExclusionRequested({ organizationId: context.organization.id, userId: context.user.id, claimRowId })
    revalidatePath(claimPath(claimRowId))
    return result
  } catch (error) {
    return failure(error, "pedido de exclusão")
  }
}

/** Gera (ou refaz) a análise da IA agora (até 8 por reclamação). */
export async function analyzeClaimAction(claimRowId: string): Promise<ClaimActionState> {
  const context = await requireSection("reputacao")
  if (!(await claimBelongs(context.organization.id, claimRowId))) return { ok: false, message: "Reclamação não encontrada." }
  try {
    const result = await analyzeClaimNow(claimRowId)
    revalidatePath(claimPath(claimRowId))
    return result
  } catch (error) {
    return failure(error, "análise da reclamação")
  }
}

/** "Atualizar": lê a reclamação de novo no ML (no máximo 1 vez por minuto). */
export async function syncClaimAction(claimRowId: string): Promise<ClaimActionState> {
  const context = await requireSection("reputacao")
  if (!uuid.safeParse(claimRowId).success) return { ok: false, message: "Reclamação não encontrada." }
  const { data } = await createServiceClient()
    .from("reputation_claims")
    .select("id, details_synced_at")
    .eq("id", claimRowId)
    .eq("organization_id", context.organization.id)
    .maybeSingle()
  if (!data) return { ok: false, message: "Reclamação não encontrada." }
  if (data.details_synced_at && Date.now() - Date.parse(data.details_synced_at) < 60_000) {
    return { ok: true, message: "A reclamação acabou de ser atualizada." }
  }
  try {
    await syncClaimNow(context.organization.id, claimRowId)
    revalidatePath(claimPath(claimRowId))
    return { ok: true, message: "Reclamação atualizada." }
  } catch (error) {
    return failure(error, "atualizar reclamação")
  }
}
