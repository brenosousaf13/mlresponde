import "server-only"

import { createClient } from "@/lib/supabase/server"

const DAY_MS = 24 * 60 * 60 * 1000

export async function getDashboardData(organizationId: string, days = 7) {
  const supabase = await createClient()
  const since = new Date(Date.now() - days * DAY_MS).toISOString()

  const [statsResult, accountsResult, answeredResult] = await Promise.all([
    supabase.rpc("question_stats", { p_organization_id: organizationId, p_since: since }),
    supabase.from("ml_accounts").select("auto_reply_enabled, store_profile_completed_at").eq("organization_id", organizationId),
    supabase
      .from("ml_questions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "answered"),
  ])
  if (statsResult.error) throw statsResult.error
  if (accountsResult.error) throw accountsResult.error

  const stats = statsResult.data?.[0]
  const accounts = accountsResult.data ?? []
  return {
    total: Number(stats?.total ?? 0),
    answeredAi: Number(stats?.answered_ai ?? 0),
    awaiting: Number(stats?.awaiting_review ?? 0),
    avgAiSeconds: stats?.avg_ai_seconds === null || stats?.avg_ai_seconds === undefined ? null : Number(stats.avg_ai_seconds),
    autoReplyOn: accounts.some((account) => account.auto_reply_enabled),
    assistantReady: accounts.some((account) => Boolean(account.store_profile_completed_at)),
    answeredEver: answeredResult.count ?? 0,
  }
}
