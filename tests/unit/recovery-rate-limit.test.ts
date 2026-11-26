import { describe, expect, it, vi } from "vitest"

import { nextRateLimitDelay, parseRetryAfterMs } from "@/lib/recovery/rate-limit"

const MINUTE = 60_000
const NOW = Date.parse("2026-11-26T12:01:00.000Z")

describe("pausa fixa do Recuperador", () => {
  it.each([0, 0.5, 0.999, 1])("mantém 60–78 s mesmo após vários 429 (random=%s)", (value) => {
    const random = vi.fn(() => value)
    for (let attempt = 0; attempt < 20; attempt++) {
      const delay = nextRateLimitDelay({ random })
      expect(delay).toBe(MINUTE * (1 + 0.3 * value))
      expect(delay).toBeGreaterThanOrEqual(MINUTE)
      expect(delay).toBeLessThanOrEqual(78_000)
    }
  })

  it.each([
    ["180", 3], ["0", 1], ["30", 1], ["3600", 5],
    [new Date(NOW + 8 * MINUTE).toUTCString(), 5],
    [new Date(NOW + 30_000).toUTCString(), 1],
    [new Date(NOW - MINUTE).toUTCString(), 1],
    [new Date(NOW + 60 * MINUTE).toUTCString(), 5],
  ])("respeita Retry-After %s, mínimo de 1 min e teto de 5 min, sem jitter", (header, minutes) => {
    const random = vi.fn(() => 0.9)
    expect(nextRateLimitDelay({ retryAfterMs: parseRetryAfterMs(header, NOW), random })).toBe(minutes * MINUTE)
    expect(random).not.toHaveBeenCalled()
  })

  it.each([null, "", "   ", "invalido"])("ignora Retry-After ausente ou inválido: %s", (header) => {
    const retryAfterMs = parseRetryAfterMs(header, NOW)
    expect(retryAfterMs).toBeUndefined()
    expect(nextRateLimitDelay({ retryAfterMs, random: () => 0.5 })).toBe(69_000)
  })

  it.each([NaN, Infinity, -Infinity])("Retry-After não finito (%s) usa pausa curta", (retryAfterMs) => {
    expect(nextRateLimitDelay({ retryAfterMs, random: () => 0 })).toBe(MINUTE)
  })
})
