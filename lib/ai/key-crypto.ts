import "server-only"

import { createHmac, hkdfSync } from "node:crypto"

import { aiKeyEncryptionContext, openAIKeyHint } from "@/lib/ai/keys"
import { decryptSecret, encryptSecret } from "@/lib/security/crypto"

/**
 * Criptografia das chaves de IA (testada em tests/unit/ai-keys.test.ts). AES-256-GCM com a chave-mestra e o id da linha
 * como dado associado; a "impressão digital" (para detectar cadastro repetido sem guardar a chave) usa uma subchave
 * derivada da mestra, nunca a mestra direto.
 */

export type SealedAiKey = { ciphertext: string; hint: string; fingerprint: string }

function fingerprintKey(masterKey: Buffer): Buffer {
  return Buffer.from(hkdfSync("sha256", masterKey, Buffer.alloc(0), "maanu:ai-keys:fingerprint", 32))
}

export function aiKeyFingerprint(apiKey: string, masterKey: Buffer): string {
  return createHmac("sha256", fingerprintKey(masterKey)).update(apiKey, "utf8").digest("hex")
}

export function sealAiKey(id: string, apiKey: string, masterKey: Buffer): SealedAiKey {
  return {
    ciphertext: encryptSecret(apiKey, masterKey, aiKeyEncryptionContext(id)),
    hint: openAIKeyHint(apiKey),
    fingerprint: aiKeyFingerprint(apiKey, masterKey),
  }
}

/** Abre a chave gravada (erro se a chave-mestra for outra, o conteúdo tiver sido trocado ou for de outra linha). */
export function openSealedAiKey(id: string, ciphertext: string, masterKey: Buffer): string {
  return decryptSecret(ciphertext, masterKey, aiKeyEncryptionContext(id))
}
