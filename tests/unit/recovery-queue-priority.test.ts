import { describe, expect, it } from "vitest"

import { isUrgentReturn, returnsQueue, type KnownReturn, type QueueClaim } from "@/lib/recovery/returns"

const NOW = new Date("2026-11-26T12:00:00.000Z")
const HOUR = 3_600_000
const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR).toISOString()
const claim = (id: number, extra: Partial<QueueClaim & { hasReviewAction: boolean }> = {}) => ({
  id: `id-${id}`, claim_id: id, status: "opened", ml_updated_at: at(-5), ml_created_at: at(-30), ...extra,
})
const known = (extra: Partial<KnownReturn> = {}): KnownReturn => ({
  phase: "waiting", synced_at: at(-2), claim_updated_at: at(-5), ...extra,
})

describe("ordem da fila do Recuperador", () => {
  it("ordena (a) urgentes → (b) nunca lidas/alteradas → (c) prazos → (d) demais por leitura antiga", () => {
    const claims = Array.from({ length: 11 }, (_, i) => claim(i + 1))
    const state = new Map<number, KnownReturn>([
      [1, known({ phase: "needs_review", mode: "arrival", deadline_at: at(2) })],
      [2, known({ phase: "needs_review", mode: "appeal", deadline_at: at(1) })],
      // 3 nunca lida; 4 alterada, mesmo com leitura recente e prazo distante.
      [4, known({ synced_at: at(-0.01), claim_updated_at: at(-6), deadline_at: at(48) })],
      [5, known({ phase: "needs_review", deadline_at: at(24) })],
      [6, known({ phase: "needs_review", deadline_at: at(-0.01), claim_updated_at: at(-6) })],
      [7, known({ deadline_at: at(48) })],
      [8, known({ synced_at: at(-4), deadline_at: null })],
      [9, known({ synced_at: at(-3) })],
      [10, known({ synced_at: at(-0.01) })], // Intervalo ainda não venceu: fica fora.
      [11, known({ deadline_at: at(30) })],
    ])
    expect(returnsQueue([...claims].reverse(), state, NOW).map((row) => row.claim_id))
      .toEqual([2, 1, 5, 3, 4, 6, 11, 7, 8, 9])
  })

  it.each([
    [0, true], [1, true], [24, true], [24 + 1 / HOUR, false], [-1 / HOUR, false],
  ])("urgência com prazo em %s horas: %s", (hours, expected) => {
    expect(isUrgentReturn(known({ phase: "needs_review", deadline_at: at(hours) }), NOW)).toBe(expected)
  })

  it.each([null, undefined, "invalido"])("prazo %s não é urgente nem ganha de prazo válido", (deadline_at) => {
    const state = new Map([
      [1, known({ phase: "needs_review", deadline_at })],
      [2, known({ deadline_at: at(30) })],
    ])
    expect(isUrgentReturn(state.get(1), NOW)).toBe(false)
    expect(returnsQueue([claim(1), claim(2)], state, NOW).map((row) => row.claim_id)).toEqual([2, 1])
    expect(isUrgentReturn(undefined, NOW)).toBe(false)
    expect(isUrgentReturn(known({ phase: "closed", deadline_at: at(1) }), NOW)).toBe(false)
  })

  it("desempata por criação desc e id asc, sem dar precedência a hasReviewAction ou ao status", () => {
    const claims = [claim(1, { id: "z", hasReviewAction: true }), claim(2, { id: "a", status: "closed" }),
      claim(3, { ml_created_at: at(-29) })]
    const expected = [3, 2, 1]
    expect(returnsQueue(claims, new Map(), NOW).map((row) => row.claim_id)).toEqual(expected)
    for (const deadline_at of [at(2), at(30), null]) {
      const state = new Map(claims.map((row) => [row.claim_id, known({ phase: "needs_review", deadline_at })]))
      expect(returnsQueue(claims, state, NOW).map((row) => row.claim_id)).toEqual(expected)
    }
  })

  it("não inclui urgente recente nem reabre encerrada final sem mudança ou regra antiga", () => {
    const claims = [claim(1, { hasReviewAction: true }), claim(2, { status: "closed" })]
    const state = new Map([
      [1, known({ phase: "needs_review", deadline_at: at(1), synced_at: at(-0.01) })],
      [2, known({ phase: "closed", return_status: "delivered", synced_at: at(-24) })],
    ])
    expect(isUrgentReturn(state.get(1), NOW)).toBe(true)
    expect(returnsQueue(claims, state, NOW)).toEqual([])
    // A regra antiga continua incluindo os mesmos itens, inclusive aquele com hasReviewAction.
    expect(returnsQueue(claims, state, NOW, NOW.toISOString()).map((row) => row.claim_id)).toEqual([1, 2])
  })
})
