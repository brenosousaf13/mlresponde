// CPF/CNPJ, CEP e UFs: validação e formatação puras (servidor e navegador).
// CNPJ alfanumérico (Receita Federal, emitido desde julho/2026): 12 posições com A–Z ou 0–9 + 2 dígitos
// verificadores numéricos; cada caractere vale "código ASCII − 48" no módulo 11 (dígitos continuam valendo 0–9).

export type DocumentType = "cpf" | "cnpj"

export const DOCUMENT_TYPES: readonly DocumentType[] = ["cpf", "cnpj"]

export const DOCUMENT_LABELS: Record<DocumentType, string> = { cpf: "CPF", cnpj: "CNPJ" }

const DOCUMENT_LENGTH: Record<DocumentType, number> = { cpf: 11, cnpj: 14 }

/** Maiúsculas, sem pontuação nem espaços. Não decide se é válido. */
export function normalizeDocument(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, "")
}

function charValue(char: string) {
  return char.charCodeAt(0) - 48
}

function allSame(value: string) {
  return value.split("").every((char) => char === value[0])
}

function mod11Digit(sum: number) {
  const rest = sum % 11
  return rest < 2 ? 0 : 11 - rest
}

export function isValidCpf(input: string): boolean {
  const cpf = normalizeDocument(input)
  if (!/^\d{11}$/.test(cpf) || allSame(cpf)) return false
  const digit = (length: number) => {
    let sum = 0
    for (let index = 0; index < length; index += 1) sum += charValue(cpf[index]) * (length + 1 - index)
    return mod11Digit(sum)
  }
  return digit(9) === charValue(cpf[9]) && digit(10) === charValue(cpf[10])
}

const CNPJ_WEIGHTS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
const CNPJ_WEIGHTS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

export function isValidCnpj(input: string): boolean {
  const cnpj = normalizeDocument(input)
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || allSame(cnpj)) return false
  const digit = (weights: number[]) =>
    mod11Digit(weights.reduce((sum, weight, index) => sum + charValue(cnpj[index]) * weight, 0))
  return digit(CNPJ_WEIGHTS_1) === charValue(cnpj[12]) && digit(CNPJ_WEIGHTS_2) === charValue(cnpj[13])
}

export function isValidDocument(type: DocumentType, input: string): boolean {
  return type === "cpf" ? isValidCpf(input) : isValidCnpj(input)
}

/** Formata enquanto a pessoa digita (aceita valor parcial). CNPJ aceita letras nas 12 primeiras posições. */
export function maskDocument(type: DocumentType, input: string): string {
  let value = normalizeDocument(input)
  if (type === "cpf") {
    value = value.replace(/\D/g, "").slice(0, 11)
    return value
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2")
  }
  // CNPJ: letras só nas 12 primeiras posições; os 2 últimos são sempre números.
  let cnpj = ""
  for (const char of value) {
    if (cnpj.length >= 14) break
    if (cnpj.length >= 12 && !/\d/.test(char)) continue
    cnpj += char
  }
  const parts = [cnpj.slice(0, 2), cnpj.slice(2, 5), cnpj.slice(5, 8), cnpj.slice(8, 12), cnpj.slice(12, 14)]
  let formatted = parts[0]
  if (parts[1]) formatted += `.${parts[1]}`
  if (parts[2]) formatted += `.${parts[2]}`
  if (parts[3]) formatted += `/${parts[3]}`
  if (parts[4]) formatted += `-${parts[4]}`
  return formatted
}

export function formatDocument(type: DocumentType, value: string): string {
  const normalized = normalizeDocument(value)
  if (normalized.length !== DOCUMENT_LENGTH[type]) return normalized
  return maskDocument(type, normalized)
}

export function normalizePostalCode(input: string): string | null {
  const digits = input.replace(/\D/g, "")
  if (digits.length !== 8 || digits === "00000000") return null
  return digits
}

export function maskPostalCode(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 8)
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits
}

export const BRAZIL_STATES = [
  { uf: "AC", name: "Acre" },
  { uf: "AL", name: "Alagoas" },
  { uf: "AP", name: "Amapá" },
  { uf: "AM", name: "Amazonas" },
  { uf: "BA", name: "Bahia" },
  { uf: "CE", name: "Ceará" },
  { uf: "DF", name: "Distrito Federal" },
  { uf: "ES", name: "Espírito Santo" },
  { uf: "GO", name: "Goiás" },
  { uf: "MA", name: "Maranhão" },
  { uf: "MT", name: "Mato Grosso" },
  { uf: "MS", name: "Mato Grosso do Sul" },
  { uf: "MG", name: "Minas Gerais" },
  { uf: "PA", name: "Pará" },
  { uf: "PB", name: "Paraíba" },
  { uf: "PR", name: "Paraná" },
  { uf: "PE", name: "Pernambuco" },
  { uf: "PI", name: "Piauí" },
  { uf: "RJ", name: "Rio de Janeiro" },
  { uf: "RN", name: "Rio Grande do Norte" },
  { uf: "RS", name: "Rio Grande do Sul" },
  { uf: "RO", name: "Rondônia" },
  { uf: "RR", name: "Roraima" },
  { uf: "SC", name: "Santa Catarina" },
  { uf: "SP", name: "São Paulo" },
  { uf: "SE", name: "Sergipe" },
  { uf: "TO", name: "Tocantins" },
] as const

export type BrazilState = (typeof BRAZIL_STATES)[number]["uf"]

export function isBrazilState(value: string): value is BrazilState {
  return BRAZIL_STATES.some((state) => state.uf === value)
}
