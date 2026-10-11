import "server-only"

import { createClient } from "@/lib/supabase/server"
import {
  ASSUMPTION_LIMITS,
  parseOverview,
  periodRange,
  summarizeTopics,
  type Assumptions,
  type PeriodDays,
} from "@/lib/results/metrics"

/** Quantas perguntas recentes entram na análise de assuntos (amostra; o resto dos números usa o período todo). */
export const TOPIC_SAMPLE_SIZE = 1000

export async function getResultsData(organizationId: string, options: { days: PeriodDays; accountId: string | null }) {
  const supabase = await createClient()
  const range = periodRange(options.days)

  let textsQuery = supabase
    .from("ml_questions")
    .select("question_text")
    .eq("organization_id", organizationId)
    .gte("created_at", range.from.toISOString())
    .neq("question_text", "")
    .order("created_at", { ascending: false })
    .limit(TOPIC_SAMPLE_SIZE)
  if (options.accountId) textsQuery = textsQuery.eq("ml_account_id", options.accountId)

  const [overviewResult, textsResult, organizationResult] = await Promise.all([
    supabase.rpc("analytics_overview", {
      p_organization_id: organizationId,
      p_from: range.from.toISOString(),
      p_to: range.to.toISOString(),
      ...(options.accountId ? { p_ml_account_id: options.accountId } : {}),
    }),
    textsQuery,
    supabase
      .from("organizations")
      .select("analytics_minutes_per_answer, analytics_hourly_cost")
      .eq("id", organizationId)
      .maybeSingle(),
  ])
  if (overviewResult.error) throw overviewResult.error
  if (textsResult.error) throw textsResult.error
  if (organizationResult.error) throw organizationResult.error

  const texts = textsResult.data.map((row) => row.question_text)
  const assumptions: Assumptions = {
    minutesPerAnswer: Number(
      organizationResult.data?.analytics_minutes_per_answer ?? ASSUMPTION_LIMITS.minutesPerAnswer.default
    ),
    hourlyCost: Number(organizationResult.data?.analytics_hourly_cost ?? ASSUMPTION_LIMITS.hourlyCost.default),
  }

  return {
    range,
    overview: parseOverview(overviewResult.data),
    topics: summarizeTopics(texts),
    topicsSampled: texts.length >= TOPIC_SAMPLE_SIZE,
    assumptions,
  }
}