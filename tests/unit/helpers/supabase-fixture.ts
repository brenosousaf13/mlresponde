import { createClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"

type Row = Record<string, unknown>
type RequestLog = { url: URL; method: string; body: Row | Row[] | null }

/** PostgREST simulado: só devolve as colunas pedidas e limita cada página a 1.000 linhas. */
export function supabaseFixture(tables: Record<string, Row[]>) {
  const requests: RequestLog[] = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    const table = url.pathname.split("/").at(-1)!
    const method = init?.method ?? "GET"
    const body = init?.body ? JSON.parse(String(init.body)) as Row | Row[] : null
    requests.push({ url, method, body })
    let rows = tables[table] ?? []
    for (const [key, value] of url.searchParams) {
      if (value.startsWith("eq.")) rows = rows.filter((row) => String(row[key]) === value.slice(3))
      if (value.startsWith("in.(")) rows = rows.filter((row) => value.slice(4, -1).split(",").includes(String(row[key])))
      if (value === "not.is.null") rows = rows.filter((row) => row[key] != null)
      if (value.startsWith("gte.")) rows = rows.filter((row) => String(row[key]) >= value.slice(4))
      if (value.startsWith("lte.")) rows = rows.filter((row) => row[key] != null && String(row[key]) <= value.slice(4))
      if (value.startsWith("lt.")) rows = rows.filter((row) => row[key] != null && String(row[key]) < value.slice(3))
    }
    if (method === "HEAD") return new Response(null, { headers: { "content-range": `0-0/${rows.length}` } })
    if (method === "POST") rows = (Array.isArray(body) ? body : [body ?? {}]).map((row) => ({ id: "salvo", ...row }))
    if (method === "PATCH" || method === "DELETE") return new Response(null, { status: 204 })
    const offset = Number(url.searchParams.get("offset") ?? 0)
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 1000), 1000)
    const columns = url.searchParams.get("select") ?? "*"
    rows = rows.slice(offset, offset + limit).map((row) => columns === "*" ? row : Object.fromEntries(
      columns.split(/,(?![^()]*\))/).map((column) => {
        const name = column.split("(")[0]
        return [name, row[name]]
      })
    ))
    const single = new Headers(init?.headers).get("accept")?.includes("application/vnd.pgrst.object")
    return new Response(JSON.stringify(single ? rows[0] ?? null : rows), { headers: { "content-type": "application/json" } })
  }
  const client = createClient<Database>("https://banco.example", "chave-ficticia", {
    global: { fetch }, auth: { persistSession: false, autoRefreshToken: false },
  })
  return { client, requests, tables }
}
