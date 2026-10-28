/**
 * Lê todas as páginas de uma consulta, com faixas inclusivas, até uma página incompleta.
 * O chamador deve criar a consulta com os mesmos filtros em cada chamada e aplicar
 * `.order("id")` antes de `.range(from, to)` (ou a chave única da tabela se não houver id).
 * Use pageSize compatível com o limite do PostgREST (padrão: 1.000).
 * Erros são propagados; ao atingir maxRows (padrão: 50.000), retorna o acumulado e registra aviso.
 */
export async function fetchAllPages<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  opts?: { pageSize?: number; maxRows?: number }
): Promise<T[]> {
  const pageSize = opts?.pageSize ?? 1000
  const maxRows = opts?.maxRows ?? 50000
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0 || !Number.isSafeInteger(maxRows) || maxRows <= 0) {
    throw new RangeError("pageSize e maxRows devem ser inteiros positivos.")
  }
  const rows: T[] = []
  while (rows.length < maxRows) {
    const size = Math.min(pageSize, maxRows - rows.length)
    const { data, error } = await build(rows.length, rows.length + size - 1)
    if (error) throw error
    const page = data ?? []
    rows.push(...page.slice(0, size))
    if (rows.length === maxRows) {
      console.warn(`[supabase] fetchAllPages atingiu maxRows (${maxRows}); o resultado pode estar incompleto.`)
      break
    }
    if (page.length < size) break
  }
  return rows
}
