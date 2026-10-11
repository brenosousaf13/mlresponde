import "server-only"

import { serverEnv } from "@/lib/env"
import { parseEncryptionKey } from "@/lib/security/crypto"

let cachedKey: Buffer | null = null

export function getTokenEncryptionKey(): Buffer {
  cachedKey ??= parseEncryptionKey(serverEnv.tokenEncryptionKey())
  return cachedKey
}
