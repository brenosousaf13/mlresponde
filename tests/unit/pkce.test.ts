import { describe, expect, it } from "vitest"

import { codeChallengeS256, generateCodeVerifier, generateState } from "@/lib/mercadolivre/pkce"

describe("PKCE", () => {
  it("segue o vetor de teste da RFC 7636 (apêndice B)", () => {
    expect(codeChallengeS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    )
  })

  it("gera verifier dentro do tamanho permitido (43 a 128) e só com caracteres válidos", () => {
    const verifier = generateCodeVerifier()
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    expect(verifier.length).toBeLessThanOrEqual(128)
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/)
  })

  it("gera state imprevisível", () => {
    expect(generateState()).not.toBe(generateState())
  })
})
