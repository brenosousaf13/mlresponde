"use server"

import { randomUUID } from "node:crypto"

import type { PostgrestError } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { parseAiKeyForm } from "@/lib/admin/schemas"
import { checkOpenAIKey } from "@/lib/ai/key-check"
import { aiKeyFingerprint, sealAiKey } from "@/lib/ai/key-crypto"
import { clearOpenAIKeyCache, findAiKeyByFingerprint, readStoredAiKey } from "@/lib/ai/key-store"
import { ADMIN_SESSION_EXPIRED, adminActionIdentity, adminRequestContext } from "@/lib/dal/admin"
import { aiKeysEncryption } from "@/lib/security/keys"
import { createClient } from "@/lib/supabase/server"
import type { FormState } from "@/lib/validation/forms"

/**
 * Chaves de IA do painel do administrador. Cada ação confere a sessão de administrador (2 etapas recente); as mudanças
 * vão pelas funções admin_* do banco (que conferem de novo e gravam o histórico). A chave aberta só existe aqui, na
 * memória do servidor: é testada, criptografada e nunca volta para o navegador nem para os registros.
 */

export type AiKeyActionResult = { ok: boolean; message: string }

const uuid = z.string().uuid()
const NOT_FOUND = "Chave não encontrada. Recarregue a página."
const GENERIC = "Não foi possível salvar agora. Tente de novo."
const MASTER_KEY_MISSING =
  "Falta a chave-mestra AI_KEYS_ENCRYPTION_KEY no servidor (Vercel). Sem ela não dá para guardar chaves com segurança."
const UNREADABLE =
  "Não deu para abrir esta chave com a chave-mestra atual (AI_KEYS_ENCRYPTION_KEY foi trocada?). Cadastre a chave de novo."

function dbMessage(error: PostgrestError | null): string {
  if (!error) return GENERIC
  if (error.message.includes("ADMIN_REQUIRED")) return ADMIN_SESSION_EXPIRED
  if (error.message.includes("NOT_FOUND")) return NOT_FOUND
  if (error.message.includes("AI_KEY_DUPLICATE") || error.code === "23505") return "Essa chave já está cadastrada."
  if (error.message.includes("AI_KEY_ACTIVE")) return "A chave em uso não pode ser removida. Ponha outra em uso antes."
  if (error.code === "23514" || error.code === "22P02") return "Algum valor está fora do permitido."
  console.error("[admin] chaves de IA:", error.message)
  return GENERIC
}

function refresh() {
  clearOpenAIKeyCache()
  revalidatePath("/admin/chaves-ia")
  revalidatePath("/admin/auditoria")
}

export async function addAiKey(_state: FormState, formData: FormData): Promise<FormState> {
  if (!(await adminActionIdentity())) return { message: ADMIN_SESSION_EXPIRED }
  const encryption = aiKeysEncryption()
  if (!encryption.ok) return { message: MASTER_KEY_MISSING }

  const parsed = parseAiKeyForm(formData)
  if (!parsed.success) {
    return { message: "Confira os campos destacados.", fieldErrors: parsed.fieldErrors, values: { label: parsed.label } }
  }
  const { label, key, activate } = parsed.data
  const values = { label }

  const existing = await findAiKeyByFingerprint(aiKeyFingerprint(key, encryption.key))
  if (existing) {
    return { message: `Essa chave já está cadastrada como "${existing.label}".`, fieldErrors: { key: ["Chave repetida."] }, values }
  }

  const check = await checkOpenAIKey(key, null)
  if (!check.ok) {
    return { message: "A chave não passou no teste e não foi salva.", fieldErrors: { key: [check.message] }, values }
  }

  const id = randomUUID()
  const sealed = sealAiKey(id, key, encryption.key)
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("admin_add_ai_key", {
    p_id: id,
    p_label: label,
    p_ciphertext: sealed.ciphertext,
    p_hint: sealed.hint,
    p_fingerprint: sealed.fingerprint,
    p_activate: activate,
    p_context: await adminRequestContext(),
  })
  if (error) return { message: dbMessage(error), values }
  refresh()
  const status = (data as { status?: string } | null)?.status
  return {
    ok: true,
    message:
      status === "active"
        ? `Chave testada e salva. "${label}" já está em uso.`
        : `Chave testada e salva como reserva. Ela entra sozinha se a OpenAI recusar a chave em uso.`,
  }
}

/** Abre a chave gravada e testa na OpenAI (o resultado fica gravado na chave e no histórico). */
async function testStoredKey(id: string): Promise<{ ok: true; label: string } | { ok: false; message: string }> {
  const stored = await readStoredAiKey(id)
  if (!stored) return { ok: false, message: NOT_FOUND }
  if (stored === "unreadable") return { ok: false, message: UNREADABLE }
  const check = await checkOpenAIKey(stored.apiKey, stored.id)
  const supabase = await createClient()
  const { error } = await supabase.rpc("admin_record_ai_key_check", {
    p_key_id: id,
    p_ok: check.ok,
    p_error: check.ok ? undefined : check.message,
    p_context: await adminRequestContext(),
  })
  if (error) return { ok: false, message: dbMessage(error) }
  return check.ok ? { ok: true, label: stored.label } : { ok: false, message: `A chave não passou no teste. ${check.message}` }
}

export async function testAiKey(id: string): Promise<AiKeyActionResult> {
  if (!(await adminActionIdentity())) return { ok: false, message: ADMIN_SESSION_EXPIRED }
  if (!uuid.safeParse(id).success) return { ok: false, message: NOT_FOUND }
  const result = await testStoredKey(id)
  refresh()
  return result.ok ? { ok: true, message: `"${result.label}" está funcionando.` } : result
}

/** Em uso ou reserva: só depois de a chave passar no teste. Desativar não testa. */
export async function setAiKeyStatus(id: string, status: "active" | "standby" | "disabled"): Promise<AiKeyActionResult> {
  if (!(await adminActionIdentity())) return { ok: false, message: ADMIN_SESSION_EXPIRED }
  if (!uuid.safeParse(id).success || !["active", "standby", "disabled"].includes(status)) {
    return { ok: false, message: NOT_FOUND }
  }

  if (status !== "disabled") {
    const tested = await testStoredKey(id)
    if (!tested.ok) {
      refresh()
      return tested
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("admin_set_ai_key_status", {
    p_key_id: id,
    p_status: status,
    p_context: await adminRequestContext(),
  })
  if (error) return { ok: false, message: dbMessage(error) }
  refresh()
  const promoted = (data as { promoted_id?: string | null } | null)?.promoted_id
  if (status === "active") return { ok: true, message: "Chave testada e posta em uso. A anterior virou reserva." }
  if (status === "standby") return { ok: true, message: "Chave testada e deixada como reserva." }
  return {
    ok: true,
    message: promoted
      ? "Chave desativada. A reserva entrou em uso no lugar dela."
      : "Chave desativada. Sem chave em uso no painel, a IA usa a variável OPENAI_API_KEY (se existir).",
  }
}

export async function deleteAiKey(id: string): Promise<AiKeyActionResult> {
  if (!(await adminActionIdentity())) return { ok: false, message: ADMIN_SESSION_EXPIRED }
  if (!uuid.safeParse(id).success) return { ok: false, message: NOT_FOUND }
  const supabase = await createClient()
  const { error } = await supabase.rpc("admin_delete_ai_key", { p_key_id: id, p_context: await adminRequestContext() })
  if (error) return { ok: false, message: dbMessage(error) }
  refresh()
  return { ok: true, message: "Chave removida da maanu. Lembre de revogar a chave também no painel da OpenAI." }
}
