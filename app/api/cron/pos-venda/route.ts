import { timingSafeEqual } from "node:crypto"

import { NextResponse, type NextRequest } from "next/server"

import { processDueConversations, reconcileWaitingConversations, syncUnreadConversations } from "@/lib/after-sale/engine"
import { serverEnv } from "@/lib/env"
import { organizationIncludes } from "@/lib/plans/plans"
import { createServiceClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"
export const maxDuration = 60

function authorized(request: NextRequest) {
  const secret = serverEnv.cronSecret()
  if (!secret) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const received = Buffer.from(request.headers.get("authorization") ?? "")
  return expected.length === received.length && timingSafeEqual(expected, received)
}


/**
 * Pós-venda (Vercel Cron a cada minuto, só em produção): fila de conversas; a cada 15 minutos também confere as
 * mensagens não lidas no ML (caso alguma notificação tenha se perdido) e as conversas esperando o vendedor.
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const processed = await processDueConversations(10)

  let synced = 0
  let reconciled = 0
  if (new Date().getUTCMinutes() % 15 === 0) {
    reconciled = await reconcileWaitingConversations(10)
    // Só as contas cujo plano em vigor inclui o pós-venda (Pro, Escala, interno ou teste grátis).
    const { data: candidates, error } = await createServiceClient()
      .from("ml_accounts")
      .select("id, organizations!inner(plan, subscription_status, trial_ends_at)")
      .eq("status", "active")
      .eq("after_sale_enabled", true)
      .order("updated_at", { ascending: true })
      .limit(200)
    if (error) throw error
    const accounts = candidates
      .filter((account) => account.organizations && organizationIncludes(account.organizations, "pos_venda"))
      .slice(0, 25)
    for (const account of accounts) {
      try {
        synced += (await syncUnreadConversations(account.id)).length
      } catch (syncError) {
        console.error("[cron pos-venda] não lidas:", syncError instanceof Error ? syncError.message : syncError)
      }
    }
    if (synced) await processDueConversations(10)
  }
  return NextResponse.json({ processed, synced, reconciled })
}
