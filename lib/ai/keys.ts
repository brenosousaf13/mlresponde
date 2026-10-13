/**
 * Chaves de IA cadastradas no painel do administrador (puro, testado em tests/unit/ai-keys.test.ts).
 * Quem guarda, criptografa e escolhe a chave em uso: lib/ai/key-crypto.ts e lib/ai/key-store.ts (só servidor).
 */

export const AI_KEY_PROVIDER = "openai" as const

/** active = em uso · standby = reserva (entra sozinha se a OpenAI recusar a em uso) · disabled = desativada. */
export type AiKeyStatus = "active" | "standby" | "disabled"

/** De onde veio a chave de uma chamada: cadastrada no painel ou a variável OPENAI_API_KEY (último recurso). */
export type AiKeySource = "panel" | "env"

const OPENAI_KEY_PATTERN = /^sk-[A-Za-z0-9_-]{20,250}$/

export type KeyInput = { ok: true; key: string } | { ok: false; message: string }

/**
 * Limpa o que costuma vir junto ao colar (espaços, quebras de linha, aspas, "OPENAI_API_KEY=") e confere o formato.
 * Recusa chaves de administração (sk-admin-...): elas gerenciam a conta inteira da OpenAI e não servem para respostas.
 */
export function normalizeOpenAIKey(raw: unknown): KeyInput {
  const text = String(raw ?? "")
    .trim()
    .replace(/^(export\s+)?OPENAI_API_KEY\s*=\s*/i, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, "")
  if (!text) return { ok: false, message: "Cole a chave da OpenAI." }
  if (/^sk-admin-/i.test(text)) {
    return {
      ok: false,
      message: "Essa é uma chave de administração da OpenAI (sk-admin-). Use uma chave de projeto (sk-proj-...), que só gera respostas.",
    }
  }
  if (!OPENAI_KEY_PATTERN.test(text)) {
    return { ok: false, message: "Isso não parece uma chave da OpenAI (começa com sk-proj- ou sk-)." }
  }
  return { ok: true, key: text }
}

/** Como a chave aparece na tela depois de salva: tipo + 4 últimos caracteres (ex.: sk-proj-…a1b2). */
export function openAIKeyHint(key: string): string {
  const prefix = /^sk-(proj|svcacct)-/.exec(key)?.[0] ?? "sk-"
  return `${prefix}…${key.slice(-4)}`
}

/** Dado associado da criptografia: amarra o conteúdo à linha (trocar a chave de uma linha por outra não abre). */
export function aiKeyEncryptionContext(id: string): string {
  return `ai_provider_key:${AI_KEY_PROVIDER}:${id}`
}

/** Tira pedaços de chave das mensagens de erro antes de gravar (a OpenAI repete parte da chave recusada). */
export function redactSecrets(text: string): string {
  return text.replace(/sk-[A-Za-z0-9_*-]{4,}/g, "sk-…")
}

export type OpenAIErrorKind = "invalid_key" | "permission" | "model" | "quota" | "rate_limit" | "connection" | "unknown"

type ErrorLike = { status?: unknown; code?: unknown; name?: unknown }

function errorParts(error: unknown) {
  const value = (error && typeof error === "object" ? error : {}) as ErrorLike
  return {
    status: typeof value.status === "number" ? value.status : null,
    code: typeof value.code === "string" ? value.code : "",
    name: typeof value.name === "string" ? value.name : "",
  }
}

/** Erro da OpenAI → tipo + explicação para o administrador (aparece no teste da chave). */
export function classifyOpenAIError(error: unknown, model: string): { kind: OpenAIErrorKind; message: string } {
  const { status, code, name } = errorParts(error)
  if (status === 401) {
    return { kind: "invalid_key", message: "A OpenAI recusou a chave: ela está errada, foi revogada ou expirou." }
  }
  if (status === 403) {
    return {
      kind: "permission",
      message: `A OpenAI negou o uso do modelo ${model} com essa chave. Confira as permissões da chave (precisa poder gerar respostas) e do projeto.`,
    }
  }
  if (status === 404 || code === "model_not_found") {
    return { kind: "model", message: `O projeto dessa chave não tem acesso ao modelo ${model}.` }
  }
  if (status === 429 && code === "insufficient_quota") {
    return { kind: "quota", message: "O projeto dessa chave está sem crédito ou atingiu o limite de gasto." }
  }
  if (status === 429) {
    return { kind: "rate_limit", message: "A OpenAI limitou as chamadas agora. Tente de novo em instantes." }
  }
  if (status === null && /connection|timeout/i.test(name)) {
    return { kind: "connection", message: "Não foi possível falar com a OpenAI agora. Tente de novo em instantes." }
  }
  return {
    kind: "unknown",
    message: status ? `A OpenAI respondeu com erro (HTTP ${status}).` : "Erro inesperado ao falar com a OpenAI.",
  }
}

/**
 * Só a recusa da chave (HTTP 401) faz trocar para a reserva. Nos outros erros outra chave não resolveria: o limite de
 * uso (429) vale para o projeto/organização inteiro, não por chave.
 */
export function isRejectedKeyError(error: unknown): boolean {
  return errorParts(error).status === 401
}

export type EffectiveKey = "panel" | "env" | "none"

/** Qual chave as chamadas usam agora (mesma ordem de lib/ai/key-store.ts: painel → variável → nenhuma). */
export function effectiveKeySource(input: {
  hasActivePanelKey: boolean
  encryptionReady: boolean
  envConfigured: boolean
}): EffectiveKey {
  if (input.hasActivePanelKey && input.encryptionReady) return "panel"
  return input.envConfigured ? "env" : "none"
}
