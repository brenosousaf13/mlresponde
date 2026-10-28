import { afterEach, describe, expect, it, vi } from "vitest"

import { fetchAllPages } from "@/lib/supabase/paginate"

afterEach(() => vi.restoreAllMocks())

function source(length: number) {
  const rows = Array.from({ length }, (_, id) => ({ id }))
  const ranges: number[][] = []
  const build = async (from: number, to: number) => {
    ranges.push([from, to])
    return { data: rows.slice(from, to + 1), error: null }
  }
  return { rows, ranges, build }
}

describe("fetchAllPages", () => {
  it("lê 2.500 linhas sem perder ou repetir registros entre as três páginas", async () => {
    const { rows, ranges, build } = source(2500)
    expect(await fetchAllPages(build)).toEqual(rows)
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })

  it("consulta a página vazia depois de uma página exata de 1.000 linhas", async () => {
    const { rows, ranges, build } = source(1000)
    expect(await fetchAllPages(build)).toEqual(rows)
    expect(ranges).toEqual([[0, 999], [1000, 1999]])
  })

  it("propaga o erro de uma página posterior sem devolver dados incompletos", async () => {
    const error = { message: "Falha do PostgREST", code: "XX000" }
    const { build } = source(1000)
    await expect(fetchAllPages((from, to) => from === 0 ? build(from, to) : Promise.resolve({ data: null, error }))).rejects.toBe(error)
  })

  it("limita a última faixa a maxRows e avisa ao atingir o teto", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { rows, ranges, build } = source(4000)
    expect(await fetchAllPages(build, { maxRows: 2500 })).toEqual(rows.slice(0, 2500))
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2499]])
    expect(warn).toHaveBeenCalledOnce()
  })

  it("usa o teto padrão de 50.000 linhas", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { ranges, build } = source(51000)
    expect(await fetchAllPages(build)).toHaveLength(50000)
    expect(ranges).toHaveLength(50)
    expect(ranges[49]).toEqual([49000, 49999])
    expect(warn).toHaveBeenCalledOnce()
  })

  it("respeita pageSize e não avisa quando a consulta termina antes do teto", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { rows, ranges, build } = source(5)
    expect(await fetchAllPages(build, { pageSize: 2 })).toEqual(rows)
    expect(ranges).toEqual([[0, 1], [2, 3], [4, 5]])
    expect(warn).not.toHaveBeenCalled()
  })

  it("trata data nulo sem erro como página vazia", async () => {
    expect(await fetchAllPages(async () => ({ data: null, error: null }))).toEqual([])
  })
})
