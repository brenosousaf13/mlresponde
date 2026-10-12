import "server-only"

import { createClient } from "@/lib/supabase/server"

/** Números do pós-venda para o Painel (RLS: só a própria organização e só com o plano). */
export async function getAfterSaleSummary(organizationId: string, days: number) {
  const supabase = await createClient()
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const base = () => supabase.from("ml_conversations").select("id", { count: "exact", head: true }).eq("organization_id", organizationId)
  const [waiting, byAgent, total, agents] = await Promise.all([
    base().in("status", ["needs_review", "failed"]),
    base().eq("status", "answered").eq("last_answer_source", "ai").gte("answered_at", since),
    base().gte("last_message_at", since),
    supabase.from("ml_accounts").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("after_sale_enabled", true),
  ])
  for (const result of [waiting, byAgent, total, agents]) if (result.error) throw result.error
  return {
    waiting: waiting.count ?? 0,
    answeredByAgent: byAgent.count ?? 0,
    conversations: total.count ?? 0,
    agentOn: (agents.count ?? 0) > 0,
  }
}

export type AfterSaleSummary = Awaited<ReturnType<typeof getAfterSaleSummary>>
