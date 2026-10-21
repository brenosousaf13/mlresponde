import { describe, expect, it } from "vitest"

import { WORDMARK } from "@/components/brand/logo-paths"
import { LETTERS } from "@/components/site/letters"

/** A logo é cortada em letras (components/site/letters.tsx) para cada uma poder se mexer sozinha. */
describe("letras da maanu", () => {
  it("são cinco letras (m, a, a, n, u), cada uma com um caminho próprio", () => {
    expect(LETTERS.map((letter) => letter.key)).toEqual(["m", "a1", "a2", "n", "u"])
    for (const letter of LETTERS) expect(letter.d.startsWith("M")).toBe(true)
  })

  it("os pedaços das letras juntos refazem o caminho da logo, sem perder nem repetir nenhum", () => {
    const pieces = (path: string) => path.split(/(?=M)/).map((part) => part.trim()).filter(Boolean)
    const original = pieces(WORDMARK.path)
    const fromLetters = LETTERS.flatMap((letter) => pieces(letter.d))
    expect(original).toHaveLength(7)
    expect(fromLetters).toHaveLength(original.length)
    expect([...fromLetters].sort()).toEqual([...original].sort())
  })

  it("os 'a' levam o furo no meio (dois pedaços cada), as outras letras um só", () => {
    const counts = Object.fromEntries(LETTERS.map((letter) => [letter.key, letter.d.split(/(?=M)/).filter((part) => part.trim()).length]))
    expect(counts).toEqual({ m: 1, a1: 2, a2: 2, n: 1, u: 1 })
  })
})