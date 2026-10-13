// Pausa da automação por conta ML (botão "Automação de Respostas" em Configurações).
//
// Regra de segurança: a IA só fica pausada quando a conta está EXPLICITAMENTE desligada (false).
// Qualquer outra situação (sem linha, valor nulo, erro ao ler o banco) mantém o comportamento de antes:
// a IA responde. Assim um problema de leitura nunca desliga as respostas de ninguém.
export function isAutoReplyPaused(
  row: { auto_reply_enabled: boolean | null } | null | undefined,
  readError: unknown
): boolean {
  if (readError) return false
  return row?.auto_reply_enabled === false
}