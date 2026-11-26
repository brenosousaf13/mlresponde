import { shortAccount } from "@/lib/recovery/log"

export type MlRateLimitLogEntry = {
  origem: string
  conta: string
  metodo: string
  path: string
  status: number
  headers: Headers
  codigo?: unknown
  chamadasRodada?: number
  limiteRodada?: number
}

/** Mantém a rota e os nomes dos parâmetros, sem valores nem identificadores. */
export function normalizeMlEndpoint(path: string): string {
  const [withoutFragment] = path.split("#", 1)
  const queryIndex = withoutFragment.indexOf("?")
  const pathname = queryIndex < 0 ? withoutFragment : withoutFragment.slice(0, queryIndex)
  const query = queryIndex < 0 ? "" : withoutFragment.slice(queryIndex + 1)
  const endpoint = pathname.split("/").map((segment) => {
    // v1/v2 são versões da API; os demais segmentos com dígitos ou caracteres inesperados são identificadores.
    if (/^v\d+$/.test(segment) || /^[a-z_-]*$/i.test(segment)) return segment
    return ":id"
  }).join("/")
  const names = [...new Set([...new URLSearchParams(query).keys()].map((name) =>
    /^[a-z_.-]+$/i.test(name) ? name : ":id"
  ))].sort()
  return endpoint + (names.length ? "?" + names.join("&") : "")
}

/** Lista fechada de cabeçalhos de limite; nenhum cabeçalho de autenticação entra no log. */
export function pickRateLimitHeaders(headers: Headers): Record<string, string> {
  const picked: Record<string, string> = {}
  headers.forEach((value, key) => {
    const name = key.toLowerCase()
    if (name === "retry-after" || name.startsWith("x-ratelimit-") || name.startsWith("x-rate-limit-") || name.startsWith("ratelimit")) {
      picked[name] = value.slice(0, 100)
    }
  })
  return picked
}

/** Uma linha com apenas os campos permitidos, sem corpo ou mensagem livre do ML. */
export function formatMlRateLimitLog(entry: MlRateLimitLogEntry): string {
  const headers = pickRateLimitHeaders(entry.headers)
  const retryAfter = headers["retry-after"] ?? null
  delete headers["retry-after"]
  const codigo = typeof entry.codigo === "string" ? entry.codigo.replace(/[^a-z0-9_ -]/g, "").slice(0, 60) || null : null
  const payload = {
    origem: entry.origem,
    conta: shortAccount(entry.conta),
    metodo: entry.metodo,
    endpoint: normalizeMlEndpoint(entry.path),
    status: entry.status,
    retry_after: retryAfter,
    cabecalhos: headers,
    codigo,
    ...(entry.chamadasRodada !== undefined ? { chamadas_rodada: entry.chamadasRodada } : {}),
    ...(entry.limiteRodada !== undefined ? { limite_rodada: entry.limiteRodada } : {}),
  }
  return "[ml-429] " + JSON.stringify(payload)
}

/** Observabilidade nunca pode interromper o tratamento original da resposta. */
export function logMlRateLimit(entry: MlRateLimitLogEntry): void {
  try {
    console.warn(formatMlRateLimitLog(entry))
  } catch {
    // Uma falha ao formatar ou escrever o log não altera a chamada ao ML.
  }
}
