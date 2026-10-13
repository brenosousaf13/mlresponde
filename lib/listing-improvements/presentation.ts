/** Melhorias de anúncio — textos e cálculos da tela (puro, testado). */

import type { ImprovementArea, ImprovementPriority } from "@/lib/listing-improvements/prompt"

export const AREA_LABELS: Record<ImprovementArea, string> = {
  titulo: "Título",
  descricao: "Descrição",
  ficha_tecnica: "Ficha técnica",
  fotos: "Fotos",
  variacoes: "Variações",
  condicoes: "Condições de venda",
  outro: "Outro",
}

export const PRIORITY_LABELS: Record<ImprovementPriority, string> = {
  alta: "Prioridade alta",
  media: "Prioridade média",
  baixa: "Prioridade baixa",
}

/** Período das perguntas usadas para escolher e analisar os anúncios. */
export const IMPROVEMENT_PERIOD_DAYS = 90

/** Janela "antes" usada para medir o efeito das mudanças. */
export const EFFECT_BEFORE_DAYS = 30
/** Dias mínimos depois da análise para comparar (antes disso, o número oscila demais). */
export const EFFECT_MIN_DAYS = 7

export type EffectInput = {
  analyzedAt: string
  /** Perguntas nos EFFECT_BEFORE_DAYS dias antes da análise. */
  before: number
  /** Perguntas desde a análise. */
  after: number
}

export type Effect =
  | { ready: false; daysLeft: number; beforePerWeek: number }
  | { ready: true; beforePerWeek: number; afterPerWeek: number; changePercent: number | null; days: number }

const DAY_MS = 24 * 60 * 60 * 1000

function perWeek(count: number, days: number) {
  return days > 0 ? Math.round((count / days) * 7 * 10) / 10 : 0
}

/** Perguntas por semana antes e depois da análise (a partir de 7 dias). */
export function improvementEffect(input: EffectInput, now: Date = new Date()): Effect {
  const days = Math.max(0, (now.getTime() - new Date(input.analyzedAt).getTime()) / DAY_MS)
  const beforePerWeek = perWeek(input.before, EFFECT_BEFORE_DAYS)
  if (days < EFFECT_MIN_DAYS) {
    return { ready: false, daysLeft: Math.max(1, Math.ceil(EFFECT_MIN_DAYS - days)), beforePerWeek }
  }
  const afterPerWeek = perWeek(input.after, days)
  const changePercent = beforePerWeek > 0 ? Math.round(((afterPerWeek - beforePerWeek) / beforePerWeek) * 100) : null
  return { ready: true, beforePerWeek, afterPerWeek, changePercent, days: Math.floor(days) }
}

/** Endereço da tela de melhorias com a conta escolhida. */
export function improvementsHref(accountId?: string | null) {
  return accountId ? `/melhorias?${new URLSearchParams({ conta: accountId }).toString()}` : "/melhorias"
}
