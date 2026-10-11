import "server-only"

import type { BrazilState, DocumentType } from "@/lib/billing/documents"
import { createServiceClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { BillingAddressInput, BillingDocumentInput } from "@/lib/validation/billing"

export type BillingProfile = BillingAddressInput & {
  documentType: DocumentType
  document: string
  registeredAt: string
}

const COLUMNS =
  "document_type, document, legal_name, postal_code, street, address_number, complement, district, city, state, created_at"

/** Dados de cobrança da organização (leitura com a sessão: o RLS só libera para dono/administrador). */
export async function getBillingProfile(organizationId: string): Promise<BillingProfile | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("billing_profiles")
    .select(COLUMNS)
    .eq("organization_id", organizationId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    documentType: data.document_type as DocumentType,
    document: data.document,
    legalName: data.legal_name,
    postalCode: data.postal_code,
    street: data.street,
    addressNumber: data.address_number,
    complement: data.complement,
    district: data.district,
    city: data.city,
    state: data.state as BrazilState,
    registeredAt: data.created_at,
  }
}

export type SaveBillingResult =
  | { ok: true; created: boolean }
  | { ok: false; reason: "duplicate_document" | "missing_document" | "error" }

function addressColumns(address: BillingAddressInput) {
  return {
    legal_name: address.legalName,
    postal_code: address.postalCode,
    street: address.street,
    address_number: address.addressNumber,
    complement: address.complement,
    district: address.district,
    city: address.city,
    state: address.state,
  }
}

/**
 * Grava os dados de cobrança. Se a organização já tem CPF/CNPJ, só nome e endereço mudam (o documento enviado é
 * ignorado; o banco também bloqueia a troca). Sem cadastro anterior, exige o documento.
 * Quem chama precisa ter conferido que o usuário administra a organização.
 */
export async function saveBillingProfile(input: {
  organizationId: string
  userId: string
  address: BillingAddressInput
  document: BillingDocumentInput | null
}): Promise<SaveBillingResult> {
  const admin = createServiceClient()
  const columns = addressColumns(input.address)

  const update = async (): Promise<SaveBillingResult> => {
    const { error } = await admin
      .from("billing_profiles")
      .update(columns)
      .eq("organization_id", input.organizationId)
    return error ? { ok: false, reason: "error" } : { ok: true, created: false }
  }

  const { data: existing, error: existingError } = await admin
    .from("billing_profiles")
    .select("organization_id")
    .eq("organization_id", input.organizationId)
    .maybeSingle()
  if (existingError) return { ok: false, reason: "error" }
  if (existing) return update()
  if (!input.document) return { ok: false, reason: "missing_document" }

  const { error } = await admin.from("billing_profiles").insert({
    organization_id: input.organizationId,
    document_type: input.document.documentType,
    document: input.document.document,
    registered_by: input.userId,
    ...columns,
  })
  if (!error) return { ok: true, created: true }
  if (error.code === "23505") {
    // Documento já usado por outra conta, ou um envio duplo desta mesma organização (aí só atualiza o endereço).
    if (error.message.includes("billing_profiles_document_key")) {
      const { data: owner } = await admin
        .from("billing_profiles")
        .select("organization_id")
        .eq("document", input.document.document)
        .maybeSingle()
      if (owner?.organization_id === input.organizationId) return update()
      return { ok: false, reason: "duplicate_document" }
    }
    return update()
  }
  return { ok: false, reason: "error" }
}
