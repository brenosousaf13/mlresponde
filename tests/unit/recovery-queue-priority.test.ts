import { describe, expect, it } from "vitest"

import { isUrgentReturn, returnsQueue, type KnownReturn, type QueueClaim } from "@/lib/recovery/returns"

const NOW = new Date("2026-11-26T12:00:00Z")
const HOUR = 3_600_000
const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR).toISOString()
const claim = (id: number, extra = {}) => ({ id: `id-${id}`, claim_id: id, status: "opened", ml_updated_at: at(-5), ml_created_at: at(-30), ...extra })
const known = (extra: Partial<KnownReturn> = {}): KnownReturn => ({ phase: "waiting", synced_at: at(-2), claim_updated_at: at(-5), ...extra })

describe("ordem da fila do Recuperador", () => {
  it("ordena (a) urgentes → (b) nunca lidas/alteradas → (c) prazos → (d) demais antigas", () => {
    const claims = Array.from({ length: 10 }, (_, i) => claim(i + 1))
    const state = new Map<number, KnownReturn>([
      [1, known({ phase: "needs_review", mode: "arrival", deadline_at: at(2) })],
      [2, known({ phase: "needs_review", mode: "appeal", deadline_at: at(1) })],
      // 3 nunca foi lida; 4 mudou depois da leitura.
      [4, known({ claim_updated_at: at(-6) })],
      [5, known({ phase: "needs_review", deadline_at: at(24) })],
      [6, known({ phase: "needs_review", deadline_at: at(-0.01), claim_updated_at: at(-6) })],
      [7, known({ deadline_at: at(48) })],
      [8, known({ synced_at: at(-4), deadline_at: null })],
      [9, known({ synced_at: at(-3) })],
      [10, known({ synced_at: at(-0.01) })], // Sem intervalo vencido: continua fora da fila.
    ])
    expect(returnsQueue([...claims].reverse(), state, NOW).map((row) => row.claim_id)).toEqual([2, 1, 3, 4, 6, 5, 7, 8, 9])
    expect(isUrgentReturn(state.get(5), NOW)).toBe(false)
    expect(isUrgentReturn(state.get(6), NOW)).toBe(false)
  })

  it("preserva hasReviewAction dentro de cada grupo e os desempates por data/id", () => {
    const claims = [claim(1), claim(2, { hasReviewAction: true }), claim(3, { ml_created_at: at(-29) }), claim(4)]
    expect(returnsQueue(claims, new Map(), NOW).map((row) => row.claim_id)).toEqual([2, 3, 1, 4])
    const state = new Map(claims.map((row) => [row.claim_id, known({ deadline_at: at(30) })]))
    expect(returnsQueue(claims, state, NOW).map((row) => row.claim_id)).toEqual([2, 3, 1, 4])
    state.get(1)!.deadline_at = at(25)
    expect(returnsQueue(claims, state, NOW)[0].claim_id).toBe(1)
  })

  it("não inclui revisão urgente recente antes de vencer o intervalo", () => {
    const state = new Map([[1, known({ phase: "needs_review", deadline_at: at(1), synced_at: at(-0.01) })]])
    expect(isUrgentReturn(state.get(1), NOW)).toBe(true)
    expect(returnsQueue([claim(1)] as QueueClaim[], state, NOW)).toEqual([])
  })
})
