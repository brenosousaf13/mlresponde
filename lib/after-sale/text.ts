/** Texto das mensagens de pós-venda no padrão aceito pelo Mercado Livre (puro, testado). */

/** Limite de caracteres das mensagens do vendedor (o ML informa em `seller_max_message_length`; hoje 350). */
export const AFTER_SALE_MESSAGE_LIMIT = 350

export const AFTER_SALE_SIGNATURE_LIMIT = 80
export const AFTER_SALE_INSTRUCTIONS_LIMIT = 4000

const REPLACEMENTS: [RegExp, string][] = [
  [/[\u2018\u2019\u201A\u201B\u2032]/g, "'"],
  [/[\u201C\u201D\u201E\u201F\u2033]/g, '"'],
  [/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-"],
  [/\u2026/g, "..."],
  [/\u2022/g, "-"],
  [/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " "],
  [/[\u200B-\u200D\u2060\uFEFF]/g, ""],
]

/**
 * O ML aceita só caracteres ISO-8859-1 (latin1) nas mensagens. Troca aspas/travessões "tipográficos" pelos simples,
 * tira emojis e qualquer outro caractere fora do latin1, e arruma os espaços (mantém as quebras de linha).
 */
export function toMlMessageText(input: string): string {
  let text = input.normalize("NFC").replace(/\r\n?/g, "\n")
  for (const [pattern, replacement] of REPLACEMENTS) text = text.replace(pattern, replacement)
  text = Array.from(text)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0
      if (char === "\n") return true
      if (code < 0x20 || (code >= 0x7f && code < 0xa0)) return false
      return code <= 0xff
    })
    .join("")
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Mensagem do agente: corpo + assinatura da loja (opcional), já no padrão do ML. */
export function composeAfterSaleMessage(body: string, signature?: string | null): string {
  const cleanBody = toMlMessageText(body).replace(/\s*\n\s*/g, " ")
  const cleanSignature = toMlMessageText(signature ?? "").replace(/\s*\n\s*/g, " ")
  return [cleanBody, cleanSignature].filter(Boolean).join(" ")
}

/** Para comparar textos (a mesma mensagem pode voltar do ML com espaços diferentes). */
export function normalizeForMatch(text: string | null | undefined): string {
  return toMlMessageText(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

/** Quantos caracteres sobram para o corpo depois da assinatura (com uma folga de segurança). */
export function bodyLimit(maxLength: number, signature?: string | null): number {
  const signatureLength = toMlMessageText(signature ?? "").length
  return Math.max(120, maxLength - (signatureLength ? signatureLength + 1 : 0) - 10)
}
