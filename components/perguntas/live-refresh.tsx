"use client"

import type { RealtimeChannel } from "@supabase/supabase-js"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

import { createClient } from "@/lib/supabase/client"
import { createLiveRefreshController } from "./live-refresh-controller"

export { LIVE_REFRESH_DEBOUNCE_MS } from "./live-refresh-controller"

/** Atualiza a tela quando muda alguma linha da organização (perguntas ou conversas de pós-venda). */
export function LiveRefresh({
  organizationId,
  table = "ml_questions",
}: {
  organizationId: string
  table?: "ml_questions" | "ml_conversations"
}) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    const refresh = createLiveRefreshController(() => router.refresh(), document)
    let channel: RealtimeChannel | null = null
    let cancelled = false

    async function subscribe() {
      const { data } = await supabase.auth.getSession()
      if (cancelled || !data.session) return
      await supabase.realtime.setAuth(data.session.access_token)
      if (cancelled) return
      channel = supabase
        .channel(`${table}:${organizationId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table, filter: `organization_id=eq.${organizationId}` },
          refresh.schedule
        )
        .subscribe()
    }

    void subscribe()

    return () => {
      cancelled = true
      refresh.dispose()
      if (channel) void supabase.removeChannel(channel)
    }
  }, [organizationId, router, table])

  return null
}
