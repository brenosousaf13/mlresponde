/** Contas do financeiro do painel (puro, testado). Valores em R$ salvo indicação. */

import type { AdminFinance, OrgStatus } from "./types"

const PAYING: readonly OrgStatus[] = ["active"]

/** Fração do mês já decorrida (mínimo de 1 dia, para a projeção não explodir no dia 1). */
export function monthElapsedFraction(monthStart: string, monthEnd: string, now: Date = new Date()) {
  const start = new Date(monthStart).getTime()
  const end = new Date(monthEnd).getTime()
  const total = end - start
  if (!(total > 0)) return 1
  const minimum = (24 * 60 * 60 * 1000) / total
  return Math.min(1, Math.max(minimum, (now.getTime() - start) / total))
}

export type FinanceRow = AdminFinance["rows"][number] & {
  revenue: number
  aiCostBrl: number
  aiCostProjectedBrl: number
  margin: number
  /** Custo de IA projetado ÷ mensalidade (null sem mensalidade). */
  costShare: number | null
  loss: boolean
}

export type FinanceSummary = {
  rate: number
  mrr: number
  arr: number
  paying: number
  arpa: number
  aiCostMonthUsd: number
  aiCostMonthBrl: number
  aiCostProjectedUsd: number
  aiCostProjectedBrl: number
  aiCostPrevMonthBrl: number
  fixedCosts: number
  margin: number
  marginShare: number | null
  elapsed: number
  rows: FinanceRow[]
  lossCount: number
}

export function summarizeFinance(finance: AdminFinance, now: Date = new Date()): FinanceSummary {
  const rate = Number(finance.settings?.usd_brl_rate) || 0
  const elapsed = monthElapsedFraction(finance.month_start, finance.month_end, now)
  const mrr = Number(finance.mrr) || 0
  const paying = Number(finance.paying) || 0
  const aiCostMonthUsd = Number(finance.ai_cost_month_usd) || 0
  const aiCostProjectedUsd = aiCostMonthUsd / elapsed
  const fixedCosts = Number(finance.settings?.monthly_fixed_costs_brl) || 0
  const aiCostProjectedBrl = aiCostProjectedUsd * rate
  const margin = mrr - aiCostProjectedBrl - fixedCosts

  const rows: FinanceRow[] = finance.rows.map((row) => {
    const revenue = PAYING.includes(row.status) ? Number(row.monthly_price) || 0 : 0
    const aiCostBrl = (Number(row.ai_cost_month_usd) || 0) * rate
    const aiCostProjectedBrl = aiCostBrl / elapsed
    const rowMargin = revenue - aiCostProjectedBrl
    return {
      ...row,
      revenue,
      aiCostBrl,
      aiCostProjectedBrl,
      margin: rowMargin,
      costShare: revenue > 0 ? aiCostProjectedBrl / revenue : null,
      loss: rowMargin < 0,
    }
  })
  // Quem dá prejuízo primeiro, depois quem pesa mais na receita.
  rows.sort((a, b) => a.margin - b.margin || b.aiCostBrl - a.aiCostBrl)

  return {
    rate,
    mrr,
    arr: mrr * 12,
    paying,
    arpa: paying > 0 ? mrr / paying : 0,
    aiCostMonthUsd,
    aiCostMonthBrl: aiCostMonthUsd * rate,
    aiCostProjectedUsd,
    aiCostProjectedBrl,
    aiCostPrevMonthBrl: (Number(finance.ai_cost_prev_month_usd) || 0) * rate,
    fixedCosts,
    margin,
    marginShare: mrr > 0 ? margin / mrr : null,
    elapsed,
    rows,
    lossCount: rows.filter((row) => row.loss && row.revenue > 0).length,
  }
}
