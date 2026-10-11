import { randomBytes } from "node:crypto"

import { describe, expect, it } from "vitest"

import { decryptSecret, encryptSecret, parseEncryptionKey } from "@/lib/security/crypto"

const key = randomBytes(32)

describe("criptografia de segredos", () => {
  it("criptografa e descriptografa o mesmo valor", () => {
    const payload = encryptSecret("APP_USR-token-de-teste", key, "ml_account:1:access")
    expect(payload.startsWith("v1.")).toBe(true)
    expect(payload).not.toContain("APP_USR")
    expect(decryptSecret(payload, key, "ml_account:1:access")).toBe("APP_USR-token-de-teste")
  })

  it("gera um resultado diferente a cada vez", () => {
    expect(encryptSecret("abc", key, "x")).not.toBe(encryptSecret("abc", key, "x"))
  })

  it("recusa outro contexto (impede trocar tokens entre contas)", () => {
    const payload = encryptSecret("segredo", key, "ml_account:1:access")
    expect(() => decryptSecret(payload, key, "ml_account:2:access")).toThrow()
  })

  it("recusa conteúdo adulterado", () => {
    const [version, iv, ciphertext, tag] = encryptSecret("segredo", key, "ctx").split(".")
    const flipped = Buffer.from(ciphertext, "base64url")
    flipped[0] ^= 1
    expect(() =>
      decryptSecret([version, iv, flipped.toString("base64url"), tag].join("."), key, "ctx")
    ).toThrow()
  })

  it("recusa chave errada", () => {
    const payload = encryptSecret("segredo", key, "ctx")
    expect(() => decryptSecret(payload, randomBytes(32), "ctx")).toThrow()
  })

  it("valida o tamanho da chave", () => {
    expect(() => parseEncryptionKey(randomBytes(16).toString("base64"))).toThrow()
    expect(parseEncryptionKey(key.toString("base64")).equals(key)).toBe(true)
  })
})
