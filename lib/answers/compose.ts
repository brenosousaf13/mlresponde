export const ML_ANSWER_LIMIT = 2000

export function composeAnswer(parts: { greeting?: string; body: string; signature?: string }): string {
  return [parts.greeting, parts.body, parts.signature]
    .map((part) => (part ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ")
}

const CONTACT_PATTERNS: RegExp[] = [
  /https?:\/\//i,
  /\bwww\./i,
  /\b[a-z0-9-]+\.(com|net|org|io|app|shop|store|site|online)(\.br)?\b/i,
  /[\w.+-]+@[\w-]+\.[\w.]+/,
  /\bwh?ats\s?app\b|\bzap\b|\bwpp\b/i,
  /\binstagram\b|\btelegram\b|\bfacebook\b/i,
  /(\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[\s-]?\d{4}\b/,
]

/** Respostas automáticas não podem levar contato externo (proibido pelo Mercado Livre). */
export function containsExternalContact(text: string): boolean {
  return CONTACT_PATTERNS.some((pattern) => pattern.test(text))
}

/** Tira saudação e assinatura padrão de uma resposta (para ensinar a IA só o conteúdo). */
export function stripAffixes(text: string, greeting: string, signature: string): string {
  let body = text.replace(/\s+/g, " ").trim()
  const cleanGreeting = greeting.replace(/\s+/g, " ").trim()
  const cleanSignature = signature.replace(/\s+/g, " ").trim()
  if (cleanGreeting && body.toLowerCase().startsWith(cleanGreeting.toLowerCase())) {
    body = body.slice(cleanGreeting.length).trim()
  }
  if (cleanSignature && body.toLowerCase().endsWith(cleanSignature.toLowerCase())) {
    body = body.slice(0, body.length - cleanSignature.length).trim()
  }
  return body
}

/** Extrai o código do anúncio (ex.: MLB1234567890) de um código ou link do Mercado Livre. */
export function parseItemId(input: string): string | null {
  const match = /\b(ML[A-Z])-?(\d{6,15})\b/i.exec(input.trim())
  return match ? `${match[1].toUpperCase()}${match[2]}` : null
}
