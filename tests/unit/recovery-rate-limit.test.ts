import { describe, expect, it, vi } from "vitest"

import { nextRateLimitDelay, parseRetryAfterMs } from "@/lib/recovery/rate-limit"

const MINUTE = 60_000
const NOW = Date.parse("2026-11-26T12:01:00.000Z")

describe("espera progressiva do Recuperador", () => {
  it.each([0, 0.5, 0.999])("avança 2 → 4 → 8 → 15 → 15 min mesmo com jitter (random=%s)", (value) => {
    const random = vi.fn(() => value)
    let previousIntervalMs: number | null = null
    for (const minutes of [2, 4, 8, 15, 15]) {
      const delay = nextRateLimitDelay({ previousIntervalMs, random })
      expect(delay).toBe(minutes * MINUTE * (1 + 0.2 * value))
      expect(delay).toBeGreaterThanOrEqual(minutes * MINUTE)
      expect(delay).toBeLessThan(minutes * MINUTE * 1.2)
      previousIntervalMs = delay
    }
    expect(random).toHaveBeenCalledTimes(5)
  })

  it.each([1, 5, 30, null])("começa em 2 min quando o intervalo anterior é %s min", (minutes) => {
    expect(nextRateLimitDelay({ previousIntervalMs: minutes === null ? null : minutes * MINUTE, random: () => 0 }))
      .toBe(2 * MINUTE)
  })

  it.each([2, 4, 8, 15])("reconhece os dois extremos da faixa anterior de %s min", (minutes) => {
    const next = ({ 2: 4, 4: 8, 8: 15, 15: 15 } as Record<number, number>)[minutes] * MINUTE
    for (const previousIntervalMs of [minutes * MINUTE, minutes * MINUTE * 1.2]) {
      expect(nextRateLimitDelay({ previousIntervalMs, random: () => 0 })).toBe(next)
    }
    for (const previousIntervalMs of [minutes * MINUTE - 1, minutes * MINUTE * 1.2 + 1]) {
      expect(nextRateLimitDelay({ previousIntervalMs, random: () => 0 })).toBe(2 * MINUTE)
    }
  })

  it.each([
    ["180", 3], ["0", 1], ["30", 1], ["3600", 30],
    [new Date(NOW + 8 * MINUTE).toUTCString(), 8],
    [new Date(NOW + 30_000).toUTCString(), 1],
    [new Date(NOW - MINUTE).toUTCString(), 1],
    [new Date(NOW + 60 * MINUTE).toUTCString(), 30],
  ])("respeita Retry-After %s, com mínimo de 1 min e teto de 30 min", (header, minutes) => {
    const random = vi.fn(() => 0.9)
    expect(nextRateLimitDelay({ previousIntervalMs: 8 * MINUTE, retryAfterMs: parseRetryAfterMs(header, NOW), random }))
      .toBe(minutes * MINUTE)
    expect(random).not.toHaveBeenCalled()
  })

  it.each([null, "", "   ", "invalido"])("ignora Retry-After ausente ou inválido: %s", (header) => {
    const retryAfterMs = parseRetryAfterMs(header, NOW)
    expect(retryAfterMs).toBeUndefined()
    expect(nextRateLimitDelay({ previousIntervalMs: null, retryAfterMs, random: () => 0.5 })).toBe(2.2 * MINUTE)
  })
})
