"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { requireSection } from "@/lib/dal/app-context"
import { retryFailedImport } from "@/lib/customers/engine"
import { normalizeNote } from "@/lib/customers/presentation"
import { createServiceClient } from "@/lib/supabase/admin"

export type CustomerActionResult = { ok: boolean; message?: string }

const uuid = z.string().uuid()

/** Salva as observações internas de um cliente (qualquer membro da organização pode editar). */
export async function saveCustomerNote(customerId: string, note: string): Promise<CustomerActionResult> {
  const context = await requireSection("clientes")
  if (!uuid.safeParse(customerId).success) return { ok: false, message: "Cliente não encontrado." }
  const parsed = normalizeNote(note)
  if (!parsed.ok) return { ok: false, message: parsed.message }

  const { data, error } = await createServiceClient()
    .from("ml_customers")
    .update({ notes: parsed.note, notes_updated_by: context.user.id, notes_updated_at: new Date().toISOString() })
    .eq("id", customerId)
    .eq("organization_id", context.organization.id)
    .select("id")
  if (error) {
    console.error("[clientes] observações:", error.message)
    return { ok: false, message: "Não foi possível salvar agora. Tente novamente." }
  }
  if (!data.length) return { ok: false, message: "Cliente não encontrado." }
  revalidatePath("/clientes/" + customerId)
  return { ok: true, message: "Observações salvas." }
}

/** "Tentar de novo" quando a importação das vendas de uma conta falhou. */
export async function retryCustomerImport(accountId: string): Promise<CustomerActionResult> {
  const context = await requireSection("clientes")
  if (!uuid.safeParse(accountId).success) return { ok: false, message: "Conta não encontrada." }
  try {
    const retried = await retryFailedImport(context.organization.id, accountId)
    revalidatePath("/clientes")
    return retried
      ? { ok: true, message: "Vamos tentar importar de novo em instantes." }
      : { ok: false, message: "Esta importação não está parada por erro." }
  } catch (error) {
    console.error("[clientes] tentar de novo:", error instanceof Error ? error.message : error)
    return { ok: false, message: "Não foi possível agora. Tente novamente." }
  }
}
