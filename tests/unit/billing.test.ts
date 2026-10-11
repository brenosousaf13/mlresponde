import { describe, expect, it } from "vitest"

import { parsePostalCodeResponse } from "@/lib/billing/cep"
import {
  formatDocument,
  isValidCnpj,
  isValidCpf,
  isValidDocument,
  maskDocument,
  maskPostalCode,
  normalizeDocument,
  normalizePostalCode,
} from "@/lib/billing/documents"
import { billingSaveError, parseBillingProfile } from "@/lib/validation/billing"

const ADDRESS = {
  legalName: " Maria   Souza ",
  postalCode: "01310-100",
  street: "Avenida Paulista",
  addressNumber: "1000",
  complement: "",
  district: "Bela Vista",
  city: "São Paulo",
  state: "sp",
}

describe("CPF", () => {
  it.each(["529.982.247-25", "52998224725", "111.444.777-35", "123.456.789-09"])("aceita %s", (cpf) => {
    expect(isValidCpf(cpf)).toBe(true)
  })

  it.each(["529.982.247-24", "111.111.111-11", "000.000.000-00", "1234567890", "5299822472A", ""])(
    "recusa %s",
    (cpf) => {
      expect(isValidCpf(cpf)).toBe(false)
    }
  )
})

describe("CNPJ", () => {
  it.each(["11.222.333/0001-81", "11222333000181", "12.ABC.345/01DE-35", "12abc34501de35"])("aceita %s", (cnpj) => {
    expect(isValidCnpj(cnpj)).toBe(true)
  })

  it.each(["11.222.333/0001-82", "12.ABC.345/01DE-36", "00.000.000/0000-00", "AA.AAA.AAA/AAAA-AA", "12ABC34501DE3A"])(
    "recusa %s",
    (cnpj) => {
      expect(isValidCnpj(cnpj)).toBe(false)
    }
  )

  it("não confunde CPF com CNPJ", () => {
    expect(isValidDocument("cpf", "11222333000181")).toBe(false)
    expect(isValidDocument("cnpj", "52998224725")).toBe(false)
  })
})

describe("máscaras", () => {
  it("formata CPF enquanto digita", () => {
    expect(maskDocument("cpf", "529")).toBe("529")
    expect(maskDocument("cpf", "5299")).toBe("529.9")
    expect(maskDocument("cpf", "5299822")).toBe("529.982.2")
    expect(maskDocument("cpf", "52998224725999")).toBe("529.982.247-25")
    expect(maskDocument("cpf", "529a982")).toBe("529.982")
  })

  it("formata CNPJ, inclusive o alfanumérico", () => {
    expect(maskDocument("cnpj", "11222333000181")).toBe("11.222.333/0001-81")
    expect(maskDocument("cnpj", "12abc34501de35")).toBe("12.ABC.345/01DE-35")
    expect(maskDocument("cnpj", "12ABC")).toBe("12.ABC")
    // Os 2 últimos são sempre números.
    expect(maskDocument("cnpj", "12ABC34501DEX3Y5")).toBe("12.ABC.345/01DE-35")
  })

  it("normaliza e formata para exibição", () => {
    expect(normalizeDocument(" 12.abc.345/01de-35 ")).toBe("12ABC34501DE35")
    expect(formatDocument("cpf", "52998224725")).toBe("529.982.247-25")
    expect(formatDocument("cnpj", "12ABC34501DE35")).toBe("12.ABC.345/01DE-35")
  })

  it("CEP", () => {
    expect(maskPostalCode("01310100")).toBe("01310-100")
    expect(maskPostalCode("0131")).toBe("0131")
    expect(normalizePostalCode("01310-100")).toBe("01310100")
    expect(normalizePostalCode("0131010")).toBeNull()
    expect(normalizePostalCode("00000-000")).toBeNull()
  })
})

describe("parseBillingProfile", () => {
  it("primeiro cadastro exige documento válido e normaliza tudo", () => {
    const result = parseBillingProfile({ ...ADDRESS, documentType: "cnpj", document: "12.abc.345/01de-35" }, {
      withDocument: true,
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.document).toEqual({ documentType: "cnpj", document: "12ABC34501DE35" })
    expect(result.data.address).toMatchObject({
      legalName: "Maria Souza",
      postalCode: "01310100",
      complement: null,
      state: "SP",
    })
  })

  it("mostra o erro do documento junto com os do endereço", () => {
    const result = parseBillingProfile(
      { ...ADDRESS, documentType: "cpf", document: "529.982.247-24", street: "", state: "XX" },
      { withDocument: true }
    )
    expect(result.success).toBe(false)
    const errors = result.success ? {} : result.fieldErrors
    expect(errors.document?.[0]).toContain("CPF inválido")
    expect(errors.street).toBeDefined()
    expect(errors.state).toBeDefined()
  })

  it("documento vazio pede o tipo certo", () => {
    const result = parseBillingProfile({ ...ADDRESS, documentType: "cnpj", document: "" }, { withDocument: true })
    expect(result.success ? [] : result.fieldErrors.document).toEqual(["Informe o CNPJ."])
  })

  it("depois do cadastro, ignora qualquer documento enviado", () => {
    const result = parseBillingProfile({ ...ADDRESS, documentType: "cpf", document: "lixo" }, { withDocument: false })
    expect(result.success && result.data.document).toBeNull()
  })

  it("aceita S/N e complemento", () => {
    const result = parseBillingProfile(
      { ...ADDRESS, addressNumber: "S/N", complement: " Sala  12 " },
      { withDocument: false }
    )
    expect(result.success && result.data.address.complement).toBe("Sala 12")
    expect(result.success && result.data.address.addressNumber).toBe("S/N")
  })

  it("recusa CEP incompleto e campos ausentes", () => {
    const result = parseBillingProfile({ postalCode: "0131" }, { withDocument: false })
    const errors = result.success ? {} : result.fieldErrors
    expect(errors.postalCode).toBeDefined()
    expect(errors.legalName).toBeDefined()
    expect(errors.city).toBeDefined()
  })

  it("mensagem de documento já cadastrado", () => {
    const state = billingSaveError("duplicate_document", "cnpj", {})
    expect(state.fieldErrors?.document?.[0]).toContain("Este CNPJ já está cadastrado em outra conta")
  })
})

describe("parsePostalCodeResponse", () => {
  it("lê o ViaCEP", () => {
    expect(
      parsePostalCodeResponse({ cep: "01310-100", logradouro: "Avenida Paulista", bairro: "Bela Vista", localidade: "São Paulo", uf: "SP" })
    ).toEqual({ street: "Avenida Paulista", district: "Bela Vista", city: "São Paulo", state: "SP" })
  })

  it("lê a BrasilAPI e CEP geral de cidade (sem rua)", () => {
    expect(parsePostalCodeResponse({ cep: "78175000", state: "MT", city: "Poconé", neighborhood: "", street: "" })).toEqual({
      street: "",
      district: "",
      city: "Poconé",
      state: "MT",
    })
  })

  it("CEP inexistente", () => {
    expect(parsePostalCodeResponse({ erro: true })).toBeNull()
    expect(parsePostalCodeResponse({ erro: "true" })).toBeNull()
    expect(parsePostalCodeResponse(null)).toBeNull()
  })
})
