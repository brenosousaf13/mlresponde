/**
 * Log estruturado do Recuperador: UMA linha por evento, no formato
 *   [recuperador] {"etapa":"lido","conta":"ab12","claim_id":123,"resultado":"ok","detalhe":"..."}
 * Só identificadores técnicos (4 últimos caracteres da conta e o número da reclamação). NUNCA dados do comprador (nome,
 * apelido, e-mail, endereço, texto da reclamação): campos fora da lista abaixo são descartados e o "detalhe" passa por limpeza.
 */

export type RecoveryLogStage = "lido" | "elegivel" | "avisado" | "enviado" | "decidido" | "recuperado" | "sync_parado" | "sem_acesso"
export type RecoveryLogResult = "ok" | "falha" | "pulado"

export type RecoveryLogEntry = {
  etapa: RecoveryLogStage
  /** Id da conta do ML na maanu (só os 4 últimos caracteres vão para o log). */
  conta: string
  claim_id?: number | null
  resultado: RecoveryLogResult
  detalhe?: string | null
}

const DETAIL_MAX = 200

function cleanDetail(value: string): string {
  return value
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[e-mail]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, DETAIL_MAX)
}

/** Os 4 últimos caracteres do id da conta (suficiente para achar a conta nos logs sem expor o id inteiro). */
export function shortAccount(accountId: string): string {
  return accountId.slice(-4)
}

/** Monta a linha de log (pura, testada). Campos que não fazem parte do formato são ignorados. */
export function formatRecoveryLog(entry: RecoveryLogEntry): string {
  const payload: Record<string, unknown> = { etapa: entry.etapa, conta: shortAccount(entry.conta) }
  if (entry.claim_id !== undefined && entry.claim_id !== null) payload.claim_id = Number(entry.claim_id)
  payload.resultado = entry.resultado
  if (entry.detalhe) payload.detalhe = cleanDetail(entry.detalhe)
  return "[recuperador] " + JSON.stringify(payload)
}

/** Escreve a linha no console (falhas em console.error). Nunca lança erro. */
export function logRecovery(entry: RecoveryLogEntry): void {
  try {
    const line = formatRecoveryLog(entry)
    if (entry.resultado === "falha") console.error(line)
    else console.log(line)
  } catch {
    // log nunca pode derrubar a rodada
  }
}
