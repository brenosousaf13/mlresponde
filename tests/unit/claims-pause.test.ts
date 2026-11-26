import { describe, expect, it, vi } from "vitest"

import { decodePauseStep, encodePauseUntil, latestClaimsPause, nextClaimsPause } from "@/lib/mercadolivre/claims-pause"

const MINUTE = 60_000
const NOW = Date.parse("2026-11-26T17:00:00.000Z")

describe("pausa compartilhada do app", () => {
  it.each([0, 1, 2, 3])("codifica/decodifica o degrau %s sem perder os microssegundos", (step) => {
    const until = encodePauseUntil(NOW, step)
    expect(until).toBe(`2026-11-26T17:00:00.9${step}0777Z`)
    expect(decodePauseStep(until)).toBe(step)
    expect(decodePauseStep(until.replace("Z", "+00:00"))).toBe(step)
    expect(decodePauseStep(new Date(until).toISOString())).toBeNull()
  })

  it.each(["", "invalida", "2026-11-26T17:00:00.900Z", "2026-11-26T17:00:00.940777Z",
    "2026-11-26T17:00:00.920778Z", "2026-11-26T17:00:00.920777-03:00", "2026-11-26T17:00:00.920777Zextra"])("rejeita strings sem a marca exata: %s", (value) => {
    expect(decodePauseStep(value)).toBeNull()
  })

  it("encontra a maior pausa marcada mesmo com horários normais maiores", () => {
    const marked = encodePauseUntil(NOW, 2)
    expect(latestClaimsPause([{ next_returns_at: encodePauseUntil(NOW - MINUTE, 0) },
      { next_returns_at: marked }, { next_returns_at: new Date(NOW + MINUTE).toISOString() }])).toBe(marked)
  })

  it.each([0, 0.5, 0.999])("sobe 2 → 4 → 8 → 15 → 15 pela pausa anterior (jitter %s)", (value) => {
    let nowMs = NOW
    let previousUntil: string | null = null
    for (const [index, minutes] of [2, 4, 8, 15, 15].entries()) {
      const pause = nextClaimsPause({ nowMs, previousUntil, random: () => value })
      expect(pause.stepIndex).toBe(Math.min(index, 3))
      const delay = minutes * MINUTE * (1 + 0.2 * value)
      expect(Date.parse(pause.until) - nowMs).toBeGreaterThanOrEqual(delay)
      expect(Date.parse(pause.until) - nowMs).toBeLessThan(delay + 1000)
      previousUntil = pause.until.replace("Z", "+00:00")
      nowMs = Date.parse(pause.until) + 1
    }
  })

  it.each([20, 21])("recomeça após %s min desde o fim da pausa (não desde o início)", (minutes) => {
    const previousUntil = encodePauseUntil(NOW, 3)
    const nowMs = Date.parse(previousUntil) + minutes * MINUTE
    expect(nextClaimsPause({ nowMs, previousUntil, random: () => 0 }).stepIndex).toBe(0)
  })

  it("ainda sobe antes de completar 20 min", () => {
    const previousUntil = encodePauseUntil(NOW, 1)
    expect(nextClaimsPause({ nowMs: Date.parse(previousUntil) + 20 * MINUTE - 1, previousUntil, random: () => 0 }).stepIndex).toBe(2)
  })

  it("não encurta pausa vigente maior nem perde seu degrau", () => {
    const previousUntil = encodePauseUntil(NOW + 25 * MINUTE, 3)
    expect(nextClaimsPause({ nowMs: NOW, previousUntil, retryAfterMs: MINUTE, random: () => 0 })).toEqual({ until: previousUntil, stepIndex: 3 })
  })

  it.each([[0, 1], [30_000, 1], [3 * MINUTE, 3], [60 * MINUTE, 30]])("respeita Retry-After %s sem jitter (só alinhamento da marca)", (retryAfterMs, minutes) => {
    const random = vi.fn(() => 0.9)
    const { until } = nextClaimsPause({ nowMs: NOW, previousUntil: null, retryAfterMs, random })
    expect(Date.parse(until) - NOW).toBeGreaterThanOrEqual(minutes * MINUTE)
    expect(Date.parse(until) - NOW).toBeLessThan(minutes * MINUTE + 1000)
    expect(random).not.toHaveBeenCalled()
  })

  it("o alinhamento nunca antecipa a pausa, nem no fim do segundo", () => {
    expect(Date.parse(encodePauseUntil(NOW + 999, 0))).toBeGreaterThanOrEqual(NOW + 999)
  })
})
