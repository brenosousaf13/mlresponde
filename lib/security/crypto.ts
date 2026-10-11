import "server-only"

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const VERSION = "v1"
const ALGORITHM = "aes-256-gcm"
const IV_BYTES = 12

export function parseEncryptionKey(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, "base64")
  if (key.length !== 32) {
    throw new Error("A chave de criptografia precisa ter 32 bytes codificados em base64.")
  }
  return key
}

export function encryptSecret(
  plaintext: string,
  key: Buffer,
  associatedData: string
): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  cipher.setAAD(Buffer.from(associatedData, "utf8"))
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  return [
    VERSION,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".")
}

export function decryptSecret(
  payload: string,
  key: Buffer,
  associatedData: string
): string {
  const [version, iv, ciphertext, tag] = payload.split(".")
  if (version !== VERSION || !iv || ciphertext === undefined || !tag) {
    throw new Error("Segredo criptografado em formato inválido.")
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "base64url"))
  decipher.setAAD(Buffer.from(associatedData, "utf8"))
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8")
}
