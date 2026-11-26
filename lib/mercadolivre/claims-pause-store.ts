import "server-only"

import { CLAIMS_PAUSE_MEMORY_MS, latestClaimsPause, nextClaimsPause } from "@/lib/mercadolivre/claims-pause"
import { normalizeMlEndpoint } from "@/lib/mercadolivre/rate-limit-log"
import { shortAccount } from "@/lib/recovery/log"
import { STEPS } from "@/lib/recovery/rate-limit"
import { createServiceClient } from "@/lib/supabase/admin"

/** Uma consulta leve por rodada/429. timestamptz não aceita LIKE: reconhecemos os microssegundos no resultado. */
export async function loadClaimsPause(): Promise<string | null> {
  const { data, error } = await createServiceClient().from("recovery_sync")
    .select("next_returns_at")
    .gte("next_returns_at", new Date(Date.now() - CLAIMS_PAUSE_MEMORY_MS).toISOString())
    .order("next_returns_at", { ascending: false })
  if (error) throw error
  return latestClaimsPause(data ?? [])
}

export type ClaimsRateLimit = { accountId: string; path: string; retryAfterMs?: number; retryAfter: string | null }

/** Estado só desta rodada. A pausa durável fica nas duas agendas já existentes. */
export class ClaimsPause {
  stopped = false
  private pending?: Promise<void>
  constructor(public until: string | null) {}

  get active() {
    return this.stopped || (this.until !== null && Date.parse(this.until) > Date.now())
  }

  onRateLimit(event: ClaimsRateLimit, origem: string): Promise<void> {
    // Bloqueia antes de qualquer await. 429 de chamadas já em voo estendem a pausa em sequência, sem perder degraus.
    this.stopped = true
    this.pending = (this.pending ?? Promise.resolve()).then(() => this.persist(event, origem))
    return this.pending
  }

  private async persist(event: ClaimsRateLimit, origem: string) {
    const stored = await loadClaimsPause()
    const previousUntil = latestClaimsPause([this.until, stored].flatMap((next_returns_at) => next_returns_at ? [{ next_returns_at }] : []))
    const pause = nextClaimsPause({ nowMs: Date.now(), previousUntil, retryAfterMs: event.retryAfterMs })
    this.until = pause.until
    const admin = createServiceClient()
    // Não altera a última leitura nem apaga erros. O filtro impede encurtar agendas já mais distantes.
    const recovery = await admin.from("recovery_sync").update({ next_returns_at: pause.until }).lt("next_returns_at", pause.until)
    if (recovery.error) throw recovery.error
    const reputation = await admin.from("reputation_sync").update({ next_claims_at: pause.until }).lt("next_claims_at", pause.until)
    if (reputation.error) throw reputation.error
    console.warn("[ml-pausa] " + JSON.stringify({
      origem, conta: shortAccount(event.accountId), endpoint: normalizeMlEndpoint(event.path),
      degrau_min: STEPS[pause.stepIndex] / 60_000, ate: pause.until, retry_after: event.retryAfter,
    }))
  }
}
