import "server-only"

import OpenAI from "openai"

import { openSealedAiKey } from "@/lib/ai/key-crypto"
import { AI_KEY_PROVIDER, type AiKeySource, type AiKeyStatus } from "@/lib/ai/keys"
import { serverEnv } from "@/lib/env"
import { aiKeysEncryption } from "@/lib/security/keys"
import { createServiceClient } from "@/lib/supabase/admin"

/**
 * Qual chave da OpenAI cada chamada usa (só servidor):
 *   1. a chave "em uso" cadastrada no painel do administrador (Chaves de IA), aberta com AI_KEYS_ENCRYPTION_KEY;
 *   2. sem ela (nenhuma em uso, banco fora do ar, chave-mestra ausente ou diferente), a variável OPENAI_API_KEY;
 *   3. sem nenhuma das duas, MissingOpenAIKeyError (a pergunta/conversa volta para a fila e tenta de novo).
 * A escolha fica 1 minuto na memória de cada servidor: trocar no painel vale na hora no servidor que fez a troca e em
 * até 1 minuto nos demais. A chave aberta nunca sai daqui (nem para o navegador, nem para os registros).
 */

export type ResolvedOpenAIKey = { id: string | null; source: AiKeySource; label: string; apiKey: string }

export class MissingOpenAIKeyError extends Error {
  constructor() {
    super("Nenhuma chave da OpenAI configurada: cadastre uma em Chaves de IA (painel do administrador) ou defina OPENAI_API_KEY.")
    this.name = "MissingOpenAIKeyError"
  }
}

export const KEY_CACHE_MS = 60_000

let cached: { key: ResolvedOpenAIKey; expiresAt: number } | null = null
let inflight: Promise<ResolvedOpenAIKey | null> | null = null
const clients = new Map<string, OpenAI>()

/** A variável OPENAI_API_KEY (também usada pelos testes com a IA real, que não falam com o banco). */
export function envOpenAIKey(): ResolvedOpenAIKey | null {
  const apiKey = serverEnv.openaiApiKey()
  return apiKey ? { id: null, source: "env", label: "OPENAI_API_KEY", apiKey } : null
}

async function loadPanelKey(): Promise<ResolvedOpenAIKey | null> {
  const encryption = aiKeysEncryption()
  if (!encryption.ok) return null
  const { data, error } = await createServiceClient()
    .from("ai_provider_keys")
    .select("id, label, key_ciphertext")
    .eq("provider", AI_KEY_PROVIDER)
    .eq("status", "active")
    .maybeSingle()
  if (error) {
    console.error("[ia] chave em uso:", error.message)
    return null
  }
  if (!data) return null
  try {
    return { id: data.id, source: "panel", label: data.label, apiKey: openSealedAiKey(data.id, data.key_ciphertext, encryption.key) }
  } catch {
    console.error("[ia] não foi possível abrir a chave em uso (AI_KEYS_ENCRYPTION_KEY diferente da que a gravou?)")
    return null
  }
}

/** Chave para a próxima chamada. `fresh` ignora a memória (depois de uma troca). */
export async function resolveOpenAIKey(options: { fresh?: boolean } = {}): Promise<ResolvedOpenAIKey> {
  if (!options.fresh && cached && cached.expiresAt > Date.now()) return cached.key
  let panelKey: ResolvedOpenAIKey | null
  if (options.fresh) {
    panelKey = await loadPanelKey()
  } else {
    inflight ??= loadPanelKey().finally(() => {
      inflight = null
    })
    panelKey = await inflight
  }
  const key = panelKey ?? envOpenAIKey()
  if (!key) {
    cached = null
    throw new MissingOpenAIKeyError()
  }
  cached = { key, expiresAt: Date.now() + KEY_CACHE_MS }
  return key
}

/** Esquece a chave guardada na memória (o painel chama depois de cadastrar, trocar ou desativar). */
export function clearOpenAIKeyCache() {
  cached = null
}

export function openAIClientFor(key: ResolvedOpenAIKey): OpenAI {
  const id = key.source === "panel" ? `panel:${key.id}` : "env"
  let client = clients.get(id)
  if (!client) {
    if (clients.size >= 20) clients.clear()
    client = new OpenAI({ apiKey: key.apiKey })
    clients.set(id, client)
  }
  return client
}

/**
 * A OpenAI recusou a chave do painel (HTTP 401): o banco a desativa e põe a reserva mais nova no lugar, com trava de
 * no máximo 1 troca automática a cada 10 minutos (função ai_key_report_invalid). Fica no histórico do painel.
 */
export async function reportRejectedOpenAIKey(key: ResolvedOpenAIKey, message: string): Promise<void> {
  if (key.source !== "panel" || !key.id) return
  const { data, error } = await createServiceClient().rpc("ai_key_report_invalid", {
    p_key_id: key.id,
    p_error: message.slice(0, 240),
  })
  clearOpenAIKeyCache()
  if (error) {
    console.error("[ia] troca automática de chave:", error.message)
    return
  }
  const result = (data ?? {}) as { changed?: boolean; throttled?: boolean }
  if (result.changed) console.warn(`[ia] a OpenAI recusou a chave "${key.label}": desativada e trocada pela reserva (se houver)`)
  else if (result.throttled) console.warn("[ia] chave recusada, mas já houve troca automática há menos de 10 minutos")
}

export type StoredAiKey = { id: string; label: string; status: AiKeyStatus; apiKey: string }

/** Abre uma chave gravada para o painel testar. null = não existe; "unreadable" = chave-mestra ausente ou diferente. */
export async function readStoredAiKey(id: string): Promise<StoredAiKey | null | "unreadable"> {
  const encryption = aiKeysEncryption()
  const { data, error } = await createServiceClient()
    .from("ai_provider_keys")
    .select("id, label, status, key_ciphertext")
    .eq("id", id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  if (!encryption.ok) return "unreadable"
  try {
    return {
      id: data.id,
      label: data.label,
      status: data.status as AiKeyStatus,
      apiKey: openSealedAiKey(data.id, data.key_ciphertext, encryption.key),
    }
  } catch {
    return "unreadable"
  }
}

/** Já existe chave com esta impressão digital? (para avisar antes de gastar o teste). */
export async function findAiKeyByFingerprint(fingerprint: string): Promise<{ label: string } | null> {
  const { data, error } = await createServiceClient()
    .from("ai_provider_keys")
    .select("label")
    .eq("provider", AI_KEY_PROVIDER)
    .eq("key_fingerprint", fingerprint)
    .maybeSingle()
  if (error) throw error
  return data
}
