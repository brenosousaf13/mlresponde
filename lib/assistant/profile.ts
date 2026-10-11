import { PROFILE_QUESTIONS, SETUP_SECTIONS, type ProfileQuestion } from "@/lib/assistant/questions"

export type ProfileAnswer = { options: string[]; text: string }
export type StoreProfile = Record<string, ProfileAnswer>

export const STORE_PROFILE_MAX_BYTES = 60_000

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\r\n/g, "\n").trim() : ""
}

function cleanOptions(question: ProfileQuestion, value: unknown): string[] {
  if (!Array.isArray(value) || !question.options) return []
  const known = new Set(question.options.map((option) => option.value))
  const unique = [...new Set(value.filter((item): item is string => typeof item === "string" && known.has(item)))]
  // Mantém a ordem do roteiro (estável no prompt e na tela).
  const ordered = question.options.map((option) => option.value).filter((item) => unique.includes(item))
  return question.kind === "choice" ? ordered.slice(0, 1) : ordered
}

export function isAnswered(answer: ProfileAnswer | undefined): answer is ProfileAnswer {
  return Boolean(answer && (answer.options.length > 0 || answer.text.length > 0))
}

/** Lê o JSON salvo no banco tolerando dados antigos: só mantém perguntas e opções conhecidas. */
export function parseStoreProfile(value: unknown): StoreProfile {
  const record = asRecord(value)
  if (!record) return {}
  const profile: StoreProfile = {}
  for (const question of PROFILE_QUESTIONS) {
    const raw = asRecord(record[question.id])
    if (!raw) continue
    const answer = {
      options: cleanOptions(question, raw.options),
      text: cleanText(raw.text).slice(0, question.maxLength),
    }
    if (isAnswered(answer)) profile[question.id] = answer
  }
  return profile
}

export type AnswerValidation = { ok: true; answer: ProfileAnswer | null } | { ok: false; message: string }

/** Valida a resposta enviada pelo formulário (servidor). `answer: null` = resposta apagada. */
export function validateAnswer(question: ProfileQuestion, input: { options?: unknown; text?: unknown }): AnswerValidation {
  const text = cleanText(input.text)
  if (text.length > question.maxLength) {
    return { ok: false, message: `Use no máximo ${question.maxLength.toLocaleString("pt-BR")} caracteres.` }
  }
  const rawOptions = Array.isArray(input.options) ? input.options : []
  if ((question.kind === "text" || question.kind === "textarea") && rawOptions.length) {
    return { ok: false, message: "Esta pergunta não tem opções." }
  }
  if (question.kind === "choice" && rawOptions.length > 1) return { ok: false, message: "Escolha só uma opção." }
  const options = cleanOptions(question, rawOptions)
  if (options.length !== new Set(rawOptions).size) return { ok: false, message: "Escolha apenas opções da lista." }

  const answer = { options, text }
  if (!isAnswered(answer)) {
    if (question.required) return { ok: false, message: "Esta resposta é obrigatória." }
    return { ok: true, answer: null }
  }
  return { ok: true, answer }
}

export function withAnswer(profile: StoreProfile, questionId: string, answer: ProfileAnswer | null): StoreProfile {
  const next = { ...profile }
  if (answer) next[questionId] = answer
  else delete next[questionId]
  return next
}

export function profileSize(profile: StoreProfile): number {
  return new TextEncoder().encode(JSON.stringify(profile)).length
}

export function optionLabels(question: ProfileQuestion, answer: ProfileAnswer): string[] {
  return answer.options
    .map((value) => question.options?.find((option) => option.value === value)?.label)
    .filter((label): label is string => Boolean(label))
}

export function profileProgress(profile: StoreProfile) {
  const total = PROFILE_QUESTIONS.length
  const answered = PROFILE_QUESTIONS.filter((question) => isAnswered(profile[question.id])).length
  return { answered, total }
}

function indent(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `  ${line}`)
    .join("\n")
}

function compileLine(question: ProfileQuestion, answer: ProfileAnswer): string | null {
  const facts = answer.options
    .map((value) => question.options?.find((option) => option.value === value)?.fact ?? "")
    .filter(Boolean)
  const text = answer.text
  if (!facts.length && !text) return null

  if (!facts.length) {
    return text.includes("\n") || question.kind === "textarea"
      ? `- ${question.label}:\n${indent(text)}`
      : `- ${question.label}: ${text}`
  }
  const head = `- ${question.label}: ${facts.join("; ")}.`
  if (!text) return head
  return text.includes("\n") ? `${head}\n  Detalhes do vendedor:\n${indent(text)}` : `${head} Detalhes do vendedor: ${text}`
}

/** Monta o "conhecimento da loja" que vai no prompt da IA, organizado por assunto. */
export function compileStoreKnowledge(profile: StoreProfile, extraInfo = ""): string {
  const blocks: string[] = []
  for (const section of SETUP_SECTIONS) {
    const lines = PROFILE_QUESTIONS.filter((question) => question.section === section.id && question.id !== "special_rules")
      .map((question) => (isAnswered(profile[question.id]) ? compileLine(question, profile[question.id]) : null))
      .filter((line): line is string => Boolean(line))
    if (lines.length) blocks.push(`## ${section.label}\n${lines.join("\n")}`)
  }
  const extra = extraInfo.replace(/\r\n/g, "\n").trim()
  if (extra) blocks.push(`## Outras informações do vendedor\n${extra}`)
  return blocks.join("\n\n")
}

/** Regras especiais escritas pelo vendedor (entram como instruções obrigatórias). */
export function compileSellerRules(profile: StoreProfile): string {
  return profile.special_rules?.text.trim() ?? ""
}

export function storeNameFrom(profile: StoreProfile, fallback: string): string {
  return profile.store_name?.text.trim() || fallback
}
