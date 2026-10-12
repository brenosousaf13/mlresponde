import { describe, expect, it } from "vitest"

import {
  formatWhatsapp,
  normalizeWhatsapp,
  onboardingSchema,
  parseWithPasswordConfirmation,
  safeRedirectPath,
  signupSchema,
} from "@/lib/validation/forms"

describe("normalizeWhatsapp", () => {
  it.each([
    ["(11) 91234-5678", "11912345678"],
    ["+55 11 91234-5678", "11912345678"],
    ["5511912345678", "11912345678"],
    ["(31) 3333-4444", "3133334444"],
  ])("aceita %s", (input, expected) => {
    expect(normalizeWhatsapp(input)).toBe(expected)
  })

  it.each(["123", "(01) 91234-5678", "(10) 91234-5678", "(11) 81234-5678", "119123456789012"])(
    "recusa %s",
    (input) => {
      expect(normalizeWhatsapp(input)).toBeNull()
    }
  )

  it("formata para exibição", () => {
    expect(formatWhatsapp("11912345678")).toBe("(11) 91234-5678")
    expect(formatWhatsapp("3133334444")).toBe("(31) 3333-4444")
    expect(formatWhatsapp(null)).toBe("")
  })
})

describe("safeRedirectPath", () => {
  it("aceita caminhos internos", () => {
    expect(safeRedirectPath("/contas?ml=conectada", "/painel")).toBe("/contas?ml=conectada")
  })

  it.each(["https://evil.com", "//evil.com", "/\\evil.com", "painel", undefined, 42])(
    "recusa %s",
    (input) => {
      expect(safeRedirectPath(input, "/painel")).toBe("/painel")
    }
  )
})

describe("schemas", () => {
  it("cadastro exige aceite dos termos e senhas iguais", () => {
    const result = parseWithPasswordConfirmation(signupSchema, {
      fullName: "Maria",
      email: "MARIA@LOJA.COM",
      password: "12345678",
      confirmPassword: "87654321",
      acceptTerms: null,
    })
    expect(result.success).toBe(false)
    const errors = result.success ? {} : result.fieldErrors
    expect(errors.acceptTerms).toBeDefined()
    expect(errors.confirmPassword).toBeDefined()
  })

  it("cadastro válido normaliza o e-mail", () => {
    const result = parseWithPasswordConfirmation(signupSchema, {
      fullName: " Maria Souza ",
      email: " MARIA@LOJA.COM ",
      password: "loja2026ok",
      confirmPassword: "loja2026ok",
      acceptTerms: "on",
    })
    expect(result.success && result.data.email).toBe("maria@loja.com")
  })

  it("senha nova exige letras e números (mesma regra do Supabase Auth)", () => {
    const base = { fullName: "Maria", email: "maria@loja.com", acceptTerms: "on" }
    const onlyNumbers = parseWithPasswordConfirmation(signupSchema, {
      ...base,
      password: "12345678",
      confirmPassword: "12345678",
    })
    expect(onlyNumbers.success).toBe(false)
    expect(onlyNumbers.success ? undefined : onlyNumbers.fieldErrors.password).toEqual(["Use pelo menos uma letra."])

    const onlyLetters = parseWithPasswordConfirmation(signupSchema, {
      ...base,
      password: "senhasemnumero",
      confirmPassword: "senhasemnumero",
    })
    expect(onlyLetters.success ? undefined : onlyLetters.fieldErrors.password).toEqual(["Use pelo menos um número."])

    const ok = parseWithPasswordConfirmation(signupSchema, { ...base, password: "Loja2026", confirmPassword: "Loja2026" })
    expect(ok.success).toBe(true)
  })

  it("onboarding normaliza o WhatsApp", () => {
    const result = onboardingSchema.safeParse({ storeName: "Casa da Bike", whatsapp: "(11) 91234-5678" })
    expect(result.success && result.data.whatsapp).toBe("11912345678")
  })
})
