// Busca de endereço pelo CEP, feita no navegador (ViaCEP; BrasilAPI se o ViaCEP estiver fora do ar).
// É só uma ajuda para preencher: a pessoa sempre pode digitar o endereço e o servidor valida tudo de novo.

import { isBrazilState, normalizePostalCode } from "@/lib/billing/documents"

export type PostalCodeAddress = { street: string; district: string; city: string; state: string }

export type PostalCodeLookup =
  | { status: "found"; address: PostalCodeAddress }
  | { status: "not_found" }
  | { status: "unavailable" }

const TIMEOUT_MS = 5000

async function fetchJson(url: string): Promise<{ status: number; body: unknown } | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } })
    const body = response.status === 200 ? await response.json() : null
    return { status: response.status, body }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

/** Converte a resposta de ViaCEP ou BrasilAPI no formato do formulário (puro, testado). */
export function parsePostalCodeResponse(body: unknown): PostalCodeAddress | null {
  if (!body || typeof body !== "object") return null
  const data = body as Record<string, unknown>
  if (data.erro) return null
  const state = text(data.uf ?? data.state).toUpperCase()
  const city = text(data.localidade ?? data.city)
  if (!isBrazilState(state) || !city) return null
  return {
    street: text(data.logradouro ?? data.street),
    district: text(data.bairro ?? data.neighborhood),
    city,
    state,
  }
}

export async function lookupPostalCode(input: string): Promise<PostalCodeLookup> {
  const cep = normalizePostalCode(input)
  if (!cep) return { status: "not_found" }

  const viaCep = await fetchJson(`https://viacep.com.br/ws/${cep}/json/`)
  if (viaCep && viaCep.status === 200) {
    const address = parsePostalCodeResponse(viaCep.body)
    return address ? { status: "found", address } : { status: "not_found" }
  }

  const brasilApi = await fetchJson(`https://brasilapi.com.br/api/cep/v2/${cep}`)
  if (brasilApi?.status === 200) {
    const address = parsePostalCodeResponse(brasilApi.body)
    return address ? { status: "found", address } : { status: "not_found" }
  }
  if (brasilApi?.status === 404) return { status: "not_found" }
  return { status: "unavailable" }
}
