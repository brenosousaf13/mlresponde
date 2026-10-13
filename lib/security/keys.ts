import "server-only"

import { serverEnv } from "@/lib/env"
import { parseEncryptionKey } from "@/lib/security/crypto"

let cachedKey: Buffer | null = null

export function getTokenEncryptionKey(): Buffer {
  cachedKey ??= parseEncryptionKey(serverEnv.tokenEncryptionKey())
  return cachedKey
}

export type AiKeysEncryption = { ok: true; key: Buffer } | { ok: false; reason: "missing" | "invalid" }

let cachedAiKeys: AiKeysEncryption | null = null

/**
 * Chave-mestra das chaves de IA (AI_KEYS_ENCRYPTION_KEY). Separada da ML_TOKEN_ENCRYPTION_KEY de propósito: trocar uma
 * não derruba a outra. Sem ela (ou inválida), as chaves do painel não abrem e a IA usa a variável OPENAI_API_KEY.
 */
export function aiKeysEncryption(): AiKeysEncryption {
  if (cachedAiKeys) return cachedAiKeys
  const raw = serverEnv.aiKeysEncryptionKey()
  if (!raw) {
    cachedAiKeys = { ok: false, reason: "missing" }
  } else {
    try {
      cachedAiKeys = { ok: true, key: parseEncryptionKey(raw) }
    } catch {
      console.error("[ia] AI_KEYS_ENCRYPTION_KEY inválida (precisa ter 32 bytes em base64)")
      cachedAiKeys = { ok: false, reason: "invalid" }
    }
  }
  return cachedAiKeys
}
