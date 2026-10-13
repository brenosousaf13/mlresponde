/**
 * Melhorias de anúncio — validação do resultado da IA e leitura do que foi gravado (puro, testado).
 * O banco guarda o resultado já validado (listing_improvements.result); a leitura é defensiva mesmo assim.
 */

import { z } from "zod"

import {
  IMPROVEMENT_AREAS,
  IMPROVEMENT_PRIORITIES,
  ML_TITLE_LIMIT,
  type ImprovementArea,
  type ImprovementPriority,
} from "@/lib/listing-improvements/prompt"

export const MAX_SUGGESTIONS = 6

export type ImprovementSuggestion = {
  area: ImprovementArea
  priority: ImprovementPriority
  title: string
  problem: string
  action: string
  readyText: string
  needsSellerInfo: boolean
  questionCount: number
  exampleQuestions: string[]
}

export type ImprovementResult = { summary: string; suggestions: ImprovementSuggestion[] }

const rawSuggestion = z.object({
  area: z.string().catch("outro"),
  priority: z.string().catch("media"),
  title: z.string().catch(""),
  problem: z.string().catch(""),
  action: z.string().catch(""),
  ready_text: z.string().catch(""),
  needs_seller_info: z.boolean().catch(false),
  question_count: z.number().catch(0),
  example_questions: z.array(z.string()).catch([]),
})

const rawResult = z.object({
  summary: z.string().catch(""),
  suggestions: z.array(z.unknown()).catch([]),
})

function oneLine(text: string, limit: number) {
  const value = text.replace(/\s+/g, " ").trim()
  return value.length > limit ? `${value.slice(0, limit - 1).trimEnd()}…` : value
}

/** Mantém as quebras de linha do texto pronto (descrição), sem espaços sobrando nem linhas vazias em excesso. */
function multiLine(text: string, limit: number) {
  const value = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return value.length > limit ? value.slice(0, limit).trimEnd() : value
}

const PRIORITY_ORDER: Record<ImprovementPriority, number> = { alta: 0, media: 1, baixa: 2 }

function asArea(value: string): ImprovementArea {
  return (IMPROVEMENT_AREAS as readonly string[]).includes(value) ? (value as ImprovementArea) : "outro"
}

function asPriority(value: string): ImprovementPriority {
  return (IMPROVEMENT_PRIORITIES as readonly string[]).includes(value) ? (value as ImprovementPriority) : "media"
}

/** Placeholder [entre colchetes] no texto pronto = o vendedor precisa completar. */
export function hasPlaceholder(text: string) {
  return /\[[^\]\n]{2,80}\]/.test(text)
}

/**
 * Valida e arruma a saída da IA: corta textos longos, descarta sugestões vazias e repetidas, limita a contagem de
 * perguntas ao total analisado, ordena por prioridade e por perguntas evitadas e fica com as 6 primeiras.
 */
export function normalizeImprovementResult(raw: unknown, analyzedQuestions: number): ImprovementResult {
  const parsed = rawResult.parse(raw ?? {})
  const seen = new Set<string>()
  const suggestions: ImprovementSuggestion[] = []

  for (const item of parsed.suggestions) {
    const result = rawSuggestion.safeParse(item)
    if (!result.success) continue
    const value = result.data
    const title = oneLine(value.title, 120)
    const action = oneLine(value.action, 600)
    if (!title || !action) continue
    const key = title.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    const area = asArea(value.area)
    let readyText = multiLine(value.ready_text, 3000)
    if (area === "fotos") readyText = ""
    if (area === "titulo" && readyText) readyText = oneLine(readyText, ML_TITLE_LIMIT)

    suggestions.push({
      area,
      priority: asPriority(value.priority),
      title,
      problem: oneLine(value.problem, 600),
      action,
      readyText,
      needsSellerInfo: value.needs_seller_info || hasPlaceholder(readyText),
      questionCount: Math.max(0, Math.min(Math.round(value.question_count) || 0, analyzedQuestions)),
      exampleQuestions: value.example_questions
        .map((question) => oneLine(question, 300))
        .filter(Boolean)
        .slice(0, 3),
    })
  }

  suggestions.sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.questionCount - a.questionCount
  )

  return { summary: oneLine(parsed.summary, 800), suggestions: suggestions.slice(0, MAX_SUGGESTIONS) }
}

/** Formato gravado no banco (snake_case, como a IA devolve). */
export function serializeImprovementResult(result: ImprovementResult) {
  return {
    summary: result.summary,
    suggestions: result.suggestions.map((suggestion) => ({
      area: suggestion.area,
      priority: suggestion.priority,
      title: suggestion.title,
      problem: suggestion.problem,
      action: suggestion.action,
      ready_text: suggestion.readyText,
      needs_seller_info: suggestion.needsSellerInfo,
      question_count: suggestion.questionCount,
      example_questions: suggestion.exampleQuestions,
    })),
  }
}

/** Lê o resultado gravado (sem reordenar: os índices de "feito" apontam para esta ordem). */
export function readImprovementResult(stored: unknown): ImprovementResult {
  const parsed = rawResult.parse(stored && typeof stored === "object" ? stored : {})
  const suggestions: ImprovementSuggestion[] = []
  for (const item of parsed.suggestions) {
    const result = rawSuggestion.safeParse(item)
    if (!result.success) continue
    const value = result.data
    suggestions.push({
      area: asArea(value.area),
      priority: asPriority(value.priority),
      title: value.title,
      problem: value.problem,
      action: value.action,
      readyText: value.ready_text,
      needsSellerInfo: value.needs_seller_info,
      questionCount: Math.max(0, Math.round(value.question_count) || 0),
      exampleQuestions: value.example_questions.slice(0, 3),
    })
  }
  return { summary: parsed.summary, suggestions }
}

/** Índices "feitos" válidos, sem repetição e em ordem. */
export function normalizeDoneIndexes(done: readonly number[] | null | undefined, total: number): number[] {
  return [...new Set((done ?? []).filter((index) => Number.isInteger(index) && index >= 0 && index < total))].sort(
    (a, b) => a - b
  )
}

export function toggleDoneIndex(done: readonly number[], index: number, value: boolean, total: number): number[] {
  const next = new Set(normalizeDoneIndexes(done, total))
  if (value) next.add(index)
  else next.delete(index)
  return normalizeDoneIndexes([...next], total)
}
