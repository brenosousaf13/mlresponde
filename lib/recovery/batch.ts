/** Resultado puro da validação antes de consultar o banco ou o Mercado Livre. */
export type ConfirmReceiptBatchValidation =
  | { ok: true; ids: string[] }
  | { ok: false; message: string }

/** Valida a seleção explícita do vendedor para a confirmação em lote. */
export function validateConfirmReceiptBatch(input: {
  selectedIds: readonly unknown[]
  canManage: boolean
  confirmed: unknown
}): ConfirmReceiptBatchValidation {
  if (!input.canManage) return { ok: false, message: "Só o dono ou um administrador da loja pode confirmar o recebimento." }
  if (input.confirmed !== "true") return { ok: false, message: "Confirme o envio para continuar." }
  const ids = [...new Set(input.selectedIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0).map((id) => id.trim()))]
  if (!ids.length) return { ok: false, message: "Marque pelo menos uma devolução." }
  if (ids.length > 20) return { ok: false, message: "Você pode confirmar no máximo 20 devoluções por vez." }
  return { ok: true, ids }
}

/** Regra pura usada pelo lote: só linhas com confirmação rápida podem ser enviadas. */
export function isQuickConfirmBatchEligible(row: { quick_confirm_available?: boolean }): boolean {
  return row.quick_confirm_available === true
}
