import { afterEach, describe, expect, it, vi } from "vitest"

import {
  ML_POST_PURCHASE_CALLS_PER_MINUTE,
  RECOVERY_POST_PURCHASE_CALLS_PER_MINUTE,
  REPUTATION_POST_PURCHASE_CALLS_PER_RUN,
  nextClaimsPause,
} from "@/lib/mercadolivre/claims-pause"
import { supabaseFixture } from "./helpers/supabase-fixture"

const mocks = vi.hoisted(() => ({ service: vi.fn() }))
vi.mock("@/lib/supabase/admin", () => ({ createServiceClient: mocks.service }))
const { ClaimsPause } = await import("@/lib/mercadolivre/claims-pause-store")
const MINUTE = 60_000
const NOW = Date.parse("2026-11-26T17:00:00.000Z")
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe("ritmo e pausa compartilhados do app", () => {
  it("divide as 8 chamadas/min: 5 no Recuperador e 6 por rodada de 2 min na Reputação", () => {
    expect(ML_POST_PURCHASE_CALLS_PER_MINUTE).toBe(8)
    expect(RECOVERY_POST_PURCHASE_CALLS_PER_MINUTE).toBe(5)
    expect(REPUTATION_POST_PURCHASE_CALLS_PER_RUN).toBe(6)
    expect(RECOVERY_POST_PURCHASE_CALLS_PER_MINUTE + REPUTATION_POST_PURCHASE_CALLS_PER_RUN / 2)
      .toBe(ML_POST_PURCHASE_CALLS_PER_MINUTE)
  })

  it.each([0, 0.5, 0.999, 1])("pausas repetidas continuam entre 60 e 78 s (random=%s), sem microssegundos", (value) => {
    let nowMs = NOW
    for (let index = 0; index < 20; index++) {
      const { until } = nextClaimsPause({ nowMs, random: () => value })
      expect(Date.parse(until) - nowMs).toBeCloseTo(MINUTE * (1 + 0.3 * value), 0)
      expect(Date.parse(until) - nowMs).toBeLessThan(2 * MINUTE)
      expect(until).toMatch(/\.\d{3}Z$/)
      nowMs = Date.parse(until)
    }
  })

  it.each([[0, 1], [30_000, 1], [3 * MINUTE, 3], [60 * MINUTE, 5]])("Retry-After %s prevalece sem jitter", (retryAfterMs, minutes) => {
    const random = vi.fn(() => 0.9)
    expect(nextClaimsPause({ nowMs: NOW, retryAfterMs, random }).until)
      .toBe(new Date(NOW + minutes * MINUTE).toISOString())
    expect(random).not.toHaveBeenCalled()
  })

  it("429 em voo param imediatamente, respeitam Retry-After e gravam duas UPDATEs condicionais por 429, sem SELECT", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const later = new Date(NOW + 10 * MINUTE).toISOString()
    const db = supabaseFixture({
      recovery_sync: [{ next_returns_at: new Date(NOW).toISOString() }, { next_returns_at: later }],
      reputation_sync: [{ next_claims_at: new Date(NOW).toISOString() }, { next_claims_at: later }],
    })
    mocks.service.mockReturnValue(db.client)
    const pause = new ClaimsPause(() => 0.5)
    const event = { accountId: "conta-1234", path: "/post-purchase/v1/claims/123/messages", retryAfter: null }
    const pending = pause.onRateLimit(event, "reputacao_cron")
    expect(pause.stopped).toBe(true)
    await Promise.all([pending, pause.onRateLimit({ ...event, retryAfter: "180", retryAfterMs: 180_000 }, "reputacao_cron")])
    const firstUntil = new Date(NOW + 69_000).toISOString()
    const until = new Date(NOW + 180_000).toISOString()
    expect(pause.until).toBe(until)
    expect(db.requests).toHaveLength(4)
    expect(db.requests.map((request) => request.method)).toEqual(["PATCH", "PATCH", "PATCH", "PATCH"])
    expect(db.requests.map((request) => request.body)).toEqual([
      { next_returns_at: firstUntil }, { next_claims_at: firstUntil }, { next_returns_at: until }, { next_claims_at: until },
    ])
    expect(db.requests[2].url.searchParams.get("next_returns_at")).toBe("lt." + until)
    expect(db.requests[3].url.searchParams.get("next_claims_at")).toBe("lt." + until)
    expect(db.tables.recovery_sync[1].next_returns_at).toBe(later)
    expect(db.tables.reputation_sync[1].next_claims_at).toBe(later)
    expect(console.warn).toHaveBeenCalledTimes(2)
  })
})
