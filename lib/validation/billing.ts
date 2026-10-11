import { z } from "zod"

import {
  DOCUMENT_LABELS,
  isBrazilState,
  isValidDocument,
  normalizeDocument,
  normalizePostalCode,
  type BrazilState,
  type DocumentType,
} from "@/lib/billing/documents"
import type { FormState, ParseResult } from "@/lib/validation/forms"

/** Nomes dos campos do formulário de dados de cobrança (cadastro e Configurações). */
export const BILLING_FIELDS = [
  "documentType",
  "document",
  "legalName",
  "postalCode",
  "street",
  "addressNumber",
  "complement",
  "district",
  "city",
  "state",
] as const

export type BillingAddressInput = {
  legalName: string
  postalCode: string
  street: string
  addressNumber: string
  complement: string | null
  district: string
  city: string
  state: BrazilState
}

export type BillingDocumentInput = { documentType: DocumentType; document: string }

const text = (message: string, min: number, max: number) =>
  z
    .string({ required_error: message, invalid_type_error: message })
    .trim()
    .transform((value) => value.replace(/\s+/g, " "))
    .pipe(z.string().min(min, message).max(max, `Use no máximo ${max} caracteres.`))

const billingAddressSchema = z.object({
  legalName: text("Informe o nome completo ou a razão social.", 2, 150),
  postalCode: z.string({ required_error: "Informe o CEP." }).transform((value, ctx) => {
    const normalized = normalizePostalCode(value)
    if (!normalized) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe um CEP válido, com 8 números." })
      return z.NEVER
    }
    return normalized
  }),
  street: text("Informe a rua ou avenida.", 2, 150),
  addressNumber: text("Informe o número (ou S/N).", 1, 20),
  complement: z
    .string()
    .trim()
    .max(80, "Use no máximo 80 caracteres.")
    .transform((value) => (value ? value.replace(/\s+/g, " ") : null)),
  district: text("Informe o bairro.", 1, 80),
  city: text("Informe a cidade.", 2, 80),
  state: z
    .string({ required_error: "Escolha o estado." })
    .trim()
    .toUpperCase()
    .refine(isBrazilState, "Escolha o estado.")
    .transform((value) => value as BrazilState),
})

const billingDocumentSchema = z
  .object({
    documentType: z.enum(["cpf", "cnpj"], { errorMap: () => ({ message: "Escolha CPF ou CNPJ." }) }),
    document: z.string().transform(normalizeDocument),
  })
  .superRefine((data, ctx) => {
    const label = DOCUMENT_LABELS[data.documentType]
    if (!data.document) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["document"], message: `Informe o ${label}.` })
    } else if (!isValidDocument(data.documentType, data.document)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["document"],
        message: `${label} inválido. Confira os números${data.documentType === "cnpj" ? " e letras" : ""}.`,
      })
    }
  })

type FieldErrors = Record<string, string[] | undefined>

function fieldValue(input: Record<string, unknown>, key: string) {
  const value = input[key]
  return typeof value === "string" ? value : ""
}

/**
 * Valida os dados de cobrança. Com `withDocument`, também exige CPF/CNPJ válido (primeiro cadastro);
 * sem, o documento enviado é ignorado (ele não pode mais mudar).
 */
export function parseBillingProfile(
  input: Record<string, unknown>,
  options: { withDocument: boolean }
): ParseResult<{ address: BillingAddressInput; document: BillingDocumentInput | null }> {
  const address = billingAddressSchema.safeParse(
    Object.fromEntries(BILLING_FIELDS.slice(2).map((key) => [key, fieldValue(input, key)]))
  )
  const document = options.withDocument
    ? billingDocumentSchema.safeParse({
        documentType: fieldValue(input, "documentType"),
        document: fieldValue(input, "document"),
      })
    : null

  const fieldErrors: FieldErrors = {
    ...(address.success ? {} : address.error.flatten().fieldErrors),
    ...(document && !document.success ? document.error.flatten().fieldErrors : {}),
  }
  if (!address.success || (document && !document.success)) {
    return { success: false, fieldErrors }
  }
  return {
    success: true,
    data: { address: address.data, document: document?.success ? document.data : null },
  }
}

/** Mensagem para quando o servidor não conseguiu gravar os dados de cobrança. */
export function billingSaveError(
  reason: "duplicate_document" | "missing_document" | "error",
  documentType: string,
  values: Record<string, string>
): FormState {
  const label = documentType === "cnpj" ? "CNPJ" : "CPF"
  if (reason === "duplicate_document") {
    return {
      fieldErrors: {
        document: [
          `Este ${label} já está cadastrado em outra conta. Se ela é sua, entre com o e-mail dessa conta ou fale com o suporte.`,
        ],
      },
      values,
    }
  }
  if (reason === "missing_document") {
    return { fieldErrors: { document: [`Informe o ${label}.`] }, values }
  }
  return { message: "Não foi possível salvar agora. Tente novamente.", values }
}
