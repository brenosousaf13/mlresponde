// Modelo da IA que responde as perguntas (puro, testado).
// GPT-6 Luna: o mais barato e rápido da família GPT-6, feito para tarefas focadas e de alto volume.
// Docs: https://developers.openai.com/api/docs/models/gpt-6-luna
export const DEFAULT_ANSWER_MODEL = "gpt-6-luna"

export const ANSWER_MAX_OUTPUT_TOKENS = 700
export const ANSWER_TEMPERATURE = 0.2

/** Modelos antigos (sem raciocínio) rejeitam `reasoning_effort`. Permite voltar para eles só pela variável OPENAI_MODEL. */
export function isLegacyChatModel(model: string): boolean {
  return /^(gpt-4|gpt-3\.5)/i.test(model.trim())
}

export type AnswerModelOptions = {
  temperature: number
  max_completion_tokens: number
  reasoning_effort?: "none"
}

/**
 * Parâmetros da chamada conforme o modelo. A gpt-4o-mini não raciocinava; para manter o mesmo comportamento
 * (e o menor custo/latência) o GPT-6 roda com `reasoning_effort: "none"`, único modo em que `temperature` é aceito.
 */
export function answerModelOptions(model: string): AnswerModelOptions {
  const options: AnswerModelOptions = {
    temperature: ANSWER_TEMPERATURE,
    max_completion_tokens: ANSWER_MAX_OUTPUT_TOKENS,
  }
  if (!isLegacyChatModel(model)) options.reasoning_effort = "none"
  return options
}
