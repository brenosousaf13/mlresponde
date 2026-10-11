import "server-only"

import { decryptSecret, encryptSecret } from "@/lib/security/crypto"
import { getTokenEncryptionKey } from "@/lib/security/keys"

export const ML_OAUTH_COOKIE = "mlr_ml_oauth"
export const ML_OAUTH_COOKIE_PATH = "/api/auth/callback/mercadolivre"
export const ML_OAUTH_MAX_AGE_SECONDS = 600

const ASSOCIATED_DATA = "ml-oauth-state"

export type MlOAuthPayload = {
  state: string
  verifier: string
  userId: string
  organizationId: string
  expiresAt: number
}

export function sealOAuthPayload(payload: MlOAuthPayload): string {
  return encryptSecret(JSON.stringify(payload), getTokenEncryptionKey(), ASSOCIATED_DATA)
}

export function unsealOAuthPayload(value: string | undefined): MlOAuthPayload | null {
  if (!value) return null
  try {
    const payload = JSON.parse(
      decryptSecret(value, getTokenEncryptionKey(), ASSOCIATED_DATA)
    ) as MlOAuthPayload
    if (
      typeof payload.state !== "string" ||
      typeof payload.verifier !== "string" ||
      typeof payload.userId !== "string" ||
      typeof payload.organizationId !== "string" ||
      typeof payload.expiresAt !== "number"
    ) {
      return null
    }
    return payload
  } catch {
    return null
  }
}
