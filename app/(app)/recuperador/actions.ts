"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { canManageOrganization, requireSection } from "@/lib/dal/app-context"
import { reviewReturnPhotos, suggestReturnAction, type PhotoReviewResult } from "@/lib/recovery/assist"
import { draftReturnMessage, returnReasonsFor, submitReturnReviewFor, syncRecoveryNow, syncReturnNow } from "@/lib/recovery/engine"
import { validatePhotos, type ReturnReason } from "@/lib/recovery/review"
import type { ReturnSuggestion } from "@/lib/recovery/suggest"
import { createServiceClient } from "@/lib/supabase/admin"

export type RecoveryActionState = { ok: boolean; message: string }

const uuid = z.string().uuid()

function returnPath(returnRowId: string) {
  return "/recuperador/devolucoes/" + returnRowId
}

async function returnBelongs(organizationId: string, returnRowId: string) {
  if (!uuid.safeParse(returnRowId).success) return null
  const { data } = await createServiceClient()
    .from("recovery_returns")
    .select("id, synced_at")
    .eq("id", returnRowId)
    .eq("organization_id", organizationId)
    .maybeSingle()
  return data
}

function failure(error: unknown, label: string): { ok: false; message: string } {
  console.error("[recuperador] " + label + ":", error instanceof Error ? error.message : error)
  return { ok: false, message: "Não foi possível agora. Tente de novo em instantes." }
}

/** "Atualizar agora": lê as devoluções da conta no ML (no máximo 1 vez por minuto). */
export async function refreshRecovery(accountId: string): Promise<RecoveryActionState> {
  const context = await requireSection("recuperador")
  if (!uuid.safeParse(accountId).success) return { ok: false, message: "Conta não encontrada." }
  const admin = createServiceClient()
  const { data: account } = await admin
    .from("ml_accounts")
    .select("id")
    .eq("id", accountId)
    .eq("organization_id", context.organization.id)
    .maybeSingle()
  if (!account) return { ok: false, message: "Conta não encontrada." }
  const { data: sync } = await admin.from("recovery_sync").select("last_returns_at").eq("ml_account_id", accountId).maybeSingle()
  if (sync?.last_returns_at && Date.now() - Date.parse(sync.last_returns_at) < 60_000) {
    return { ok: true, message: "As devoluções acabaram de ser atualizadas." }
  }
  try {
    const result = await syncRecoveryNow(accountId)
    revalidatePath("/recuperador")
    if (result === "busy") return { ok: true, message: "A atualização já está em andamento. Aguarde um instante." }
    if (result === "unavailable") return { ok: false, message: "Esta conta não está disponível agora." }
    return { ok: true, message: "Devoluções atualizadas." }
  } catch (error) {
    return failure(error, "atualizar devoluções")
  }
}

/** "Atualizar" na devolução: lê de novo no ML (no máximo 1 vez por minuto). */
export async function syncReturnAction(returnRowId: string): Promise<RecoveryActionState> {
  const context = await requireSection("recuperador")
  const row = await returnBelongs(context.organization.id, returnRowId)
  if (!row) return { ok: false, message: "Devolução não encontrada." }
  if (Date.now() - Date.parse(row.synced_at) < 60_000) return { ok: true, message: "A devolução acabou de ser atualizada." }
  try {
    await syncReturnNow(context.organization.id, returnRowId)
    revalidatePath(returnPath(returnRowId))
    return { ok: true, message: "Devolução atualizada." }
  } catch (error) {
    return failure(error, "atualizar devolução")
  }
}

/** Motivos que o ML aceita para "chegou com problema". */
export async function loadReturnReasons(
  returnRowId: string
): Promise<{ ok: true; reasons: ReturnReason[] } | { ok: false; message: string }> {
  const context = await requireSection("recuperador")
  if (!(await returnBelongs(context.organization.id, returnRowId))) return { ok: false, message: "Devolução não encontrada." }
  try {
    const reasons = await returnReasonsFor(context.organization.id, returnRowId)
    if (!reasons?.length) return { ok: false, message: "O Mercado Livre não liberou motivos para esta devolução. Revise pelo app do ML." }
    return { ok: true, reasons }
  } catch (error) {
    return failure(error, "motivos da devolução")
  }
}

const draftSchema = z.object({
  returnRowId: z.string().uuid(),
  reasonId: z.string().min(2).max(20),
  reasonLabel: z.string().min(1).max(200),
  checks: z.array(z.string().max(40)).max(10),
  notes: z.string().max(600),
  photos: z.number().int().min(0).max(10),
})

/** A IA escreve o relato a partir do motivo e do que o dono marcou (o dono edita antes de enviar). */
export async function draftReturnMessageAction(
  input: z.infer<typeof draftSchema>
): Promise<{ ok: true; message: string; fromAi: boolean } | { ok: false; message: string }> {
  const context = await requireSection("recuperador")
  const parsed = draftSchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: "Escolha o motivo antes de escrever o relato." }
  if (!(await returnBelongs(context.organization.id, parsed.data.returnRowId))) return { ok: false, message: "Devolução não encontrada." }
  try {
    const draft = await draftReturnMessage(context.organization.id, parsed.data.returnRowId, parsed.data)
    if (!draft) return { ok: false, message: "Devolução não encontrada." }
    return { ok: true, ...draft }
  } catch (error) {
    return failure(error, "relato da devolução")
  }
}

/**
 * "Sugerir ação": a maanu recomenda contestar, não contestar ou pedir ressarcimento parcial (regras + IA, plano B por regras).
 * Só lê: não envia nada ao ML e não grava nada além do uso da IA. Os fatos vêm do banco, nunca da tela.
 */
export async function suggestReturnActionAction(
  returnRowId: string
): Promise<{ ok: true; suggestion: ReturnSuggestion } | { ok: false; message: string }> {
  const context = await requireSection("recuperador")
  if (!uuid.safeParse(returnRowId).success) return { ok: false, message: "Devolução não encontrada." }
  try {
    return await suggestReturnAction(context.organization.id, returnRowId)
  } catch (error) {
    return failure(error, "sugestão de ação")
  }
}

const photoReviewSchema = z.object({
  returnRowId: z.string().uuid(),
  reasonId: z.string().min(2).max(20),
  reasonLabel: z.string().min(1).max(200),
  checks: z.array(z.string().max(40)).max(10),
})

/**
 * "Ver as fotos": a IA com visão confere as fotos anexadas (o que cada uma mostra, o que falta no guia do motivo) ANTES do
 * envio. Não envia nada ao ML e não guarda as fotos. Se a IA não puder conferir, `unavailable` = true e a tela não trava o envio.
 */
export async function reviewReturnPhotosAction(formData: FormData): Promise<PhotoReviewResult> {
  const context = await requireSection("recuperador")
  const parsed = photoReviewSchema.safeParse({
    returnRowId: String(formData.get("returnRowId") ?? ""),
    reasonId: String(formData.get("reasonId") ?? ""),
    reasonLabel: String(formData.get("reasonLabel") ?? ""),
    checks: formData.getAll("checks").map(String),
  })
  if (!parsed.success) return { ok: false, message: "Escolha o motivo antes de conferir as fotos.", unavailable: false }
  if (!(await returnBelongs(context.organization.id, parsed.data.returnRowId))) {
    return { ok: false, message: "Devolução não encontrada.", unavailable: false }
  }
  const photos = formData.getAll("photos").filter((value): value is File => value instanceof File && value.size > 0)
  const invalid = validatePhotos(photos, null)
  if (invalid) return { ok: false, message: invalid, unavailable: false }
  try {
    return await reviewReturnPhotos(context.organization.id, parsed.data.returnRowId, { ...parsed.data, photos })
  } catch (error) {
    console.error("[recuperador] conferência das fotos:", error instanceof Error ? error.message : error)
    return { ok: false, message: "Não foi possível conferir as fotos agora. Você pode enviar mesmo assim.", unavailable: true }
  }
}

/** Envia a revisão ao ML: só dono/administrador e só depois da confirmação na tela. */
export async function submitReturnReviewAction(formData: FormData): Promise<RecoveryActionState> {
  const context = await requireSection("recuperador")
  if (!canManageOrganization(context.role)) {
    return { ok: false, message: "Só o dono ou um administrador da loja pode enviar a revisão." }
  }
  const returnRowId = String(formData.get("returnRowId") ?? "")
  const decision = String(formData.get("decision") ?? "")
  if (decision !== "ok" && decision !== "fail") return { ok: false, message: "Escolha como a devolução chegou." }
  if (formData.get("confirmed") !== "true") return { ok: false, message: "Confirme o envio para continuar." }
  if (!(await returnBelongs(context.organization.id, returnRowId))) return { ok: false, message: "Devolução não encontrada." }
  const photos = formData.getAll("photos").filter((value): value is File => value instanceof File && value.size > 0)
  try {
    const result = await submitReturnReviewFor({
      organizationId: context.organization.id,
      userId: context.user.id,
      returnRowId,
      canManage: true,
      decision,
      reasonId: decision === "fail" ? String(formData.get("reasonId") ?? "") || null : null,
      message: String(formData.get("message") ?? ""),
      photos,
    })
    revalidatePath(returnPath(returnRowId))
    revalidatePath("/recuperador")
    return result
  } catch (error) {
    return failure(error, "revisão da devolução")
  }
}
