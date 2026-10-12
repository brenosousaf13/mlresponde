/**
 * Preço dos modelos da OpenAI e custo de cada chamada (puro, testado).
 * US$ por 1 milhão de tokens, preço "Standard" (prompts até 272 mil tokens de entrada, bem acima do que a maanu usa).
 * Fontes: página de preços da OpenAI (GPT-6 Luna, set/2026) e tabela histórica da gpt-4o-mini.
 * Ao trocar ou adicionar um modelo, cadastre o preço aqui: o custo é gravado no momento da chamada.
 */

export type ModelPrice = { input: number; cachedInput: number; output: number }

export const MODEL_PRICES: Record<string, ModelPrice> = {
  "gpt-6-luna": { input: 0.1, cachedInput: 0.01, output: 0.5 },
  "gpt-4o-mini": { input: 0.15, cachedInput: 0.075, output: 0.6 },
}

/** Preço do modelo, aceitando versões com data ("gpt-6-luna-2026-09-22"). */
export function modelPrice(model: string): ModelPrice | null {
  const id = model.trim().toLowerCase()
  if (MODEL_PRICES[id]) return MODEL_PRICES[id]
  const base = Object.keys(MODEL_PRICES)
    .filter((key) => id.startsWith(`${key}-`))
    .sort((a, b) => b.length - a.length)[0]
  return base ? MODEL_PRICES[base] : null
}

export type TokenUsage = {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningTokens: number
  totalTokens: number
}

export const EMPTY_USAGE: TokenUsage = {
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  totalTokens: 0,
}

function count(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0
}

/** Lê o campo `usage` da resposta da Chat Completions (campos ausentes viram 0). */
export function normalizeUsage(usage: unknown): TokenUsage {
  if (!usage || typeof usage !== "object") return { ...EMPTY_USAGE }
  const raw = usage as {
    prompt_tokens?: unknown
    completion_tokens?: unknown
    total_tokens?: unknown
    prompt_tokens_details?: { cached_tokens?: unknown } | null
    completion_tokens_details?: { reasoning_tokens?: unknown } | null
  }
  const inputTokens = count(raw.prompt_tokens)
  const outputTokens = count(raw.completion_tokens)
  return {
    inputTokens,
    cachedInputTokens: Math.min(inputTokens, count(raw.prompt_tokens_details?.cached_tokens)),
    outputTokens,
    reasoningTokens: Math.min(outputTokens, count(raw.completion_tokens_details?.reasoning_tokens)),
    totalTokens: count(raw.total_tokens) || inputTokens + outputTokens,
  }
}

/** Custo em US$ (null = modelo sem preço cadastrado). Os tokens de raciocínio já vêm dentro da saída. */
export function estimateCostUsd(model: string, usage: TokenUsage): number | null {
  const price = modelPrice(model)
  if (!price) return null
  const cached = Math.min(usage.cachedInputTokens, usage.inputTokens)
  const uncached = usage.inputTokens - cached
  const cost = (uncached * price.input + cached * price.cachedInput + usage.outputTokens * price.output) / 1_000_000
  return Math.round(cost * 1e8) / 1e8
}
