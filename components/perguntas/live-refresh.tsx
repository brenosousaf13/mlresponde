"use client"

import type { RealtimeChannel } from "@supabase/supabase-js"
import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"

import { createClient } from "@/lib/supabase/client"

export function LiveRefresh({ organizationId }: { organizationId: string }) {
  const router = useRouter()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let channel: RealtimeChannel | null = null
    let cancelled = false

    async function subscribe() {
      const { data } = await supabase.auth.getSession()
      if (cancelled || !data.session) return
      await supabase.realtime.setAuth(data.session.access_token)
      channel = supabase
        .channel(`ml_questions:${organizationId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "ml_questions", filter: `organization_id=eq.${organizationId}` },
          () => {
            if (timer.current) clearTimeout(timer.current)
            timer.current = setTimeout(() => router.refresh(), 800)
          }
        )
        .subscribe()
    }

    void subscribe()

    return () => {
      cancelled = true
      if (timer.current) clearTimeout(timer.current)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [organizationId, router])

  return null
}
