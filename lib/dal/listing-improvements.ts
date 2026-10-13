import "server-only"

import { EFFECT_BEFORE_DAYS, IMPROVEMENT_PERIOD_DAYS } from "@/lib/listing-improvements/presentation"
import { normalizeDoneIndexes, readImprovementResult } from "@/lib/listing-improvements/parse"
import { createClient } from "@/lib/supabase/server"

const DAY_MS = 24 * 60 * 60 * 1000

export type ImprovementCandidate = {
  accountId: string
  itemId: string
  title: string | null
  thumbnail: string | null
  permalink: string | null
  questions: number
  openQuestions: number
  lastQuestionAt: string | null
  lastAnalysis: { id: string; createdAt: string } | null
}

export type ImprovementHistoryRow = {
  id: string
  accountId: string
  itemId: string
  title: string | null
  thumbnail: string | null
  createdAt: string
  suggestions: number
  done: number
}

/** Anúncios com mais perguntas (90 dias) + a última análise de cada um, e o histórico de análises. */
export async function getImprovementsOverview(organizationId: string, accountId: string | null) {
  const supabase = await createClient()
  const since = new Date(Date.now() - IMPROVEMENT_PERIOD_DAYS * DAY_MS).toISOString()

  let historyQuery = supabase
    .from("listing_improvements")
    .select("id, ml_account_id, item_id, item_title, item_thumbnail, created_at, result, done_suggestions")
    .eq("organization_id", organizationId)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(200)
  if (accountId) historyQuery = historyQuery.eq("ml_account_id", accountId)

  const [rankingResult, historyResult] = await Promise.all([
    supabase.rpc("listing_question_ranking", {
      p_organization_id: organizationId,
      p_from: since,
      ...(accountId ? { p_ml_account_id: accountId } : {}),
      p_limit: 30,
    }),
    historyQuery,
  ])
  if (rankingResult.error) throw rankingResult.error
  if (historyResult.error) throw historyResult.error

  const latestByItem = new Map<string, { id: string; createdAt: string }>()
  const history: ImprovementHistoryRow[] = historyResult.data.map((row) => {
    const key = `${row.ml_account_id}:${row.item_id}`
    if (!latestByItem.has(key)) latestByItem.set(key, { id: row.id, createdAt: row.created_at })
    const result = readImprovementResult(row.result)
    return {
      id: row.id,
      accountId: row.ml_account_id,
      itemId: row.item_id,
      title: row.item_title,
      thumbnail: row.item_thumbnail,
      createdAt: row.created_at,
      suggestions: result.suggestions.length,
      done: normalizeDoneIndexes(row.done_suggestions, result.suggestions.length).length,
    }
  })

  const candidates: ImprovementCandidate[] = (rankingResult.data ?? []).map((row) => ({
    accountId: row.ml_account_id,
    itemId: row.item_id,
    title: row.item_title,
    thumbnail: row.item_thumbnail,
    permalink: row.item_permalink,
    questions: row.questions,
    openQuestions: row.open_questions,
    lastQuestionAt: row.last_question_at,
    lastAnalysis: latestByItem.get(`${row.ml_account_id}:${row.item_id}`) ?? null,
  }))

  return { candidates, history: history.slice(0, 20) }
}

/** Uma análise (só da organização de quem está logado, pelo RLS) e as perguntas antes/depois dela. */
export async function getImprovement(organizationId: string, id: string) {
  const supabase = await createClient()
  const { data: row, error } = await supabase
    .from("listing_improvements")
    .select(
      "id, ml_account_id, item_id, item_title, item_thumbnail, item_permalink, status, questions_analyzed, questions_from, questions_to, result, done_suggestions, model, created_at, ml_accounts(nickname)"
    )
    .eq("organization_id", organizationId)
    .eq("id", id)
    .eq("status", "ready")
    .maybeSingle()
  if (error) throw error
  if (!row) return null

  const analyzedAt = new Date(row.created_at)
  const beforeFrom = new Date(analyzedAt.getTime() - EFFECT_BEFORE_DAYS * DAY_MS).toISOString()
  const countQuestions = (from: string, to: string | null) => {
    let query = supabase
      .from("ml_questions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("ml_account_id", row.ml_account_id)
      .eq("item_id", row.item_id)
      .gte("created_at", from)
    if (to) query = query.lt("created_at", to)
    return query
  }
  const [before, after] = await Promise.all([
    countQuestions(beforeFrom, row.created_at),
    countQuestions(row.created_at, null),
  ])
  if (before.error) throw before.error
  if (after.error) throw after.error

  const result = readImprovementResult(row.result)
  return {
    id: row.id,
    accountId: row.ml_account_id,
    accountNickname: row.ml_accounts?.nickname ?? null,
    itemId: row.item_id,
    title: row.item_title,
    thumbnail: row.item_thumbnail,
    permalink: row.item_permalink,
    questionsAnalyzed: row.questions_analyzed,
    questionsFrom: row.questions_from,
    questionsTo: row.questions_to,
    createdAt: row.created_at,
    result,
    done: normalizeDoneIndexes(row.done_suggestions, result.suggestions.length),
    effect: { analyzedAt: row.created_at, before: before.count ?? 0, after: after.count ?? 0 },
  }
}

export type ImprovementDetail = NonNullable<Awaited<ReturnType<typeof getImprovement>>>
