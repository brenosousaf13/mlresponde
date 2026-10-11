import "server-only"

import { rankTopItems } from "@/lib/questions/presentation"
import { createClient } from "@/lib/supabase/server"

const DAY_MS = 24 * 60 * 60 * 1000
/** Quantas perguntas recentes entram na conta dos "anúncios mais perguntados" (evita ler milhares de linhas). */
const TOP_ITEMS_SAMPLE = 1000

const QUESTION_FIELDS =
  "id, item_id, item_title, item_thumbnail, question_text, question_created_at, created_at, status, review_reason, answer_text, answer_source, fallback_reason"

export type DashboardQuestion = {
  id: string
  item_id: string | null
  item_title: string | null
  item_thumbnail: string | null
  question_text: string
  question_created_at: string | null
  created_at: string
  status: string
  review_reason: string | null
  answer_text: string | null
  answer_source: string | null
  fallback_reason: string | null
}

export async function getDashboardData(organizationId: string, days = 7) {
  const supabase = await createClient()
  const since = new Date(Date.now() - days * DAY_MS).toISOString()
  const newestFirst = { ascending: false, nullsFirst: true } as const

  const [statsResult, accountsResult, answeredResult, awaitingResult, recentResult, itemsResult] = await Promise.all([
    supabase.rpc("question_stats", { p_organization_id: organizationId, p_since: since }),
    supabase.from("ml_accounts").select("auto_reply_enabled, store_profile_completed_at").eq("organization_id", organizationId),
    supabase
      .from("ml_questions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "answered"),
    // Mesma regra do contador do menu e da aba "Para responder": tudo o que espera o vendedor, de qualquer data.
    supabase
      .from("ml_questions")
      .select(QUESTION_FIELDS, { count: "exact" })
      .eq("organization_id", organizationId)
      .in("status", ["needs_review", "failed"])
      .order("question_created_at", newestFirst)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("ml_questions")
      .select(QUESTION_FIELDS)
      .eq("organization_id", organizationId)
      .order("question_created_at", newestFirst)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("ml_questions")
      .select("item_id, item_title, item_thumbnail, status")
      .eq("organization_id", organizationId)
      .gte("created_at", since)
      .not("item_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(TOP_ITEMS_SAMPLE),
  ])
  if (statsResult.error) throw statsResult.error
  if (accountsResult.error) throw accountsResult.error
  if (answeredResult.error) throw answeredResult.error
  if (awaitingResult.error) throw awaitingResult.error
  if (recentResult.error) throw recentResult.error
  if (itemsResult.error) throw itemsResult.error

  const stats = statsResult.data?.[0]
  const accounts = accountsResult.data ?? []
  return {
    total: Number(stats?.total ?? 0),
    answeredAi: Number(stats?.answered_ai ?? 0),
    awaiting: awaitingResult.count ?? 0,
    avgAiSeconds: stats?.avg_ai_seconds === null || stats?.avg_ai_seconds === undefined ? null : Number(stats.avg_ai_seconds),
    autoReplyOn: accounts.some((account) => account.auto_reply_enabled),
    assistantReady: accounts.some((account) => Boolean(account.store_profile_completed_at)),
    answeredEver: answeredResult.count ?? 0,
    awaitingQuestions: awaitingResult.data as DashboardQuestion[],
    recentQuestions: recentResult.data as DashboardQuestion[],
    topItems: rankTopItems(itemsResult.data),
    topItemsSampled: itemsResult.data.length >= TOP_ITEMS_SAMPLE,
  }
}
