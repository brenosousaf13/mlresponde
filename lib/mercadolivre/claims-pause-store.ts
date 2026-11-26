import "server-only"

import { nextClaimsPause } from "@/lib/mercadolivre/claims-pause"
import { normalizeMlEndpoint } from "@/lib/mercadolivre/rate-limit-log"
import { shortAccount } from "@/lib/recovery/log"
import { createServiceClient } from "@/lib/supabase/admin"

export type ClaimsRateLimit = { accountId: string; path: string; retryAfterMs?: number; retryAfter: string | null }

/** Estado só desta rodada. A pausa durável fica nas duas agendas já existentes. */
export class ClaimsPause {
  stopped = false
  until: string | null = null
  private pending?: Promise<void>
  constructor(private readonly random: () => number = Math.random) {}

  onRateLimit(event: ClaimsRateLimit, origem: string): Promise<void> {
    // Bloqueia antes de qualquer await. Cada 429 já em voo mantém seu Retry-After, sem encurtar a pausa da rodada.
    this.stopped = true
    const nowMs = Date.now()
    const pause = nextClaimsPause({ nowMs, retryAfterMs: event.retryAfterMs, random: this.random })
    if (!this.until || Date.parse(pause.until) > Date.parse(this.until)) this.until = pause.until
    const until = this.until
    this.pending = (this.pending ?? Promise.resolve()).then(() => this.persist(event, origem, until, nowMs))
    return this.pending
  }

  private async persist(event: ClaimsRateLimit, origem: string, until: string, nowMs: number) {
    const admin = createServiceClient()
    // Não altera a última leitura nem apaga erros. O filtro impede encurtar agendas já mais distantes.
    const recovery = await admin.from("recovery_sync").update({ next_returns_at: until }).lt("next_returns_at", until)
    if (recovery.error) throw recovery.error
    const reputation = await admin.from("reputation_sync").update({ next_claims_at: until }).lt("next_claims_at", until)
    if (reputation.error) throw reputation.error
    console.warn("[ml-pausa] " + JSON.stringify({
      origem, conta: shortAccount(event.accountId), endpoint: normalizeMlEndpoint(event.path),
      pausa_s: (Date.parse(until) - nowMs) / 1000, ate: until, retry_after: event.retryAfter,
    }))
  }
}
