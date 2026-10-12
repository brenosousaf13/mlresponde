"use server"

import { redirect } from "next/navigation"
import { z } from "zod"

import { ADMIN_MFA_MAX_FAILURES, ADMIN_MFA_WINDOW_MINUTES, normalizeTotpCode } from "@/lib/admin/session"
import { adminIdentityWithoutMfa, countRecentMfaFailures, recordAdminAccessEvent } from "@/lib/dal/admin"
import { createClient } from "@/lib/supabase/server"
import type { FormState } from "@/lib/validation/forms"

export type MfaEnrollment =
  | { ok: true; factorId: string; qrCode: string; secret: string }
  | { ok: false; message: string }

const DENIED = "Acesso negado."
const TOO_MANY = `Muitos códigos errados. Aguarde ${ADMIN_MFA_WINDOW_MINUTES} minutos e tente de novo.`

/** Primeiro acesso: cria o cadastro do app autenticador (QR code + código secreto). */
export async function startMfaEnrollment(): Promise<MfaEnrollment> {
  const identity = await adminIdentityWithoutMfa()
  if (!identity) return { ok: false, message: DENIED }

  const supabase = await createClient()
  const { data: factors, error } = await supabase.auth.mfa.listFactors()
  if (error) return { ok: false, message: "Não foi possível consultar a verificação em 2 etapas. Tente de novo." }
  if (factors.totp.length) {
    return { ok: false, message: "A verificação em 2 etapas já está cadastrada. Recarregue a página e digite o código." }
  }

  // Cadastros iniciados e não concluídos (QR code gerado e abandonado) são descartados antes de criar outro.
  for (const factor of factors.all) {
    if (factor.factor_type === "totp" && factor.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id })
    }
  }

  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ")
  const { data, error: enrollError } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `maanu admin ${stamp}`,
    issuer: "maanu admin",
  })
  if (enrollError || !data) {
    console.error("[admin] cadastro 2 etapas:", enrollError?.message)
    return { ok: false, message: "Não foi possível gerar o QR code. Tente de novo em instantes." }
  }
  return { ok: true, factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret }
}

/** Confere o código do app autenticador (cadastro ou entrada) e libera o painel por 12 horas. */
export async function verifyMfaCode(_state: FormState, formData: FormData): Promise<FormState> {
  const identity = await adminIdentityWithoutMfa()
  if (!identity) return { message: DENIED }

  const code = normalizeTotpCode(formData.get("code"))
  if (!code) return { message: "Digite os 6 números que aparecem no app autenticador.", fieldErrors: { code: ["Código inválido."] } }
  if ((await countRecentMfaFailures(identity.userId)) >= ADMIN_MFA_MAX_FAILURES) return { message: TOO_MANY }

  const supabase = await createClient()
  const { data: factors, error } = await supabase.auth.mfa.listFactors()
  if (error) return { message: "Não foi possível conferir o código agora. Tente de novo." }

  const requested = z.string().uuid().safeParse(formData.get("factorId"))
  const enrolling = requested.success
  const factor = enrolling
    ? factors.all.find((item) => item.id === requested.data && item.factor_type === "totp")
    : factors.totp[0]
  if (!factor) return { message: "Cadastro da verificação não encontrado. Recarregue a página e comece de novo." }

  const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code })
  if (verifyError) {
    await recordAdminAccessEvent(identity, "admin.mfa_failed", "Código de verificação errado")
    return {
      message: "Código incorreto ou expirado. Confira se o horário do celular está automático e tente de novo.",
      fieldErrors: { code: ["Código incorreto."] },
    }
  }

  await recordAdminAccessEvent(
    identity,
    enrolling ? "admin.mfa_enrolled" : "admin.login",
    enrolling ? "Verificação em 2 etapas cadastrada" : "Entrada no painel com verificação em 2 etapas"
  )
  redirect("/admin")
}
