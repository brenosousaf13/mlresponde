import "server-only"

import { matchCatalog, type Catalog } from "./catalog"
import { listProducts } from "./client"
import { billingSettings } from "./config"

/**
 * Catálogo de produtos da AbacatePay em memória de cada servidor (5 min), para a tela Assinatura não chamar a API a
 * cada visita. O painel do administrador pode forçar a leitura de novo.
 */

const TTL_MS = 5 * 60 * 1000
const ERROR_TTL_MS = 30 * 1000

type Cached = { at: number; catalog: Catalog | null; error: string | null }
let cached: Cached | null = null

export type CatalogResult = { catalog: Catalog | null; error: string | null; fetchedAt: string | null }

export async function getCatalog(options: { force?: boolean } = {}): Promise<CatalogResult> {
  if (!billingSettings().apiKey) return { catalog: null, error: null, fetchedAt: null }
  const now = Date.now()
  if (!options.force && cached && now - cached.at < (cached.error ? ERROR_TTL_MS : TTL_MS)) {
    return { catalog: cached.catalog, error: cached.error, fetchedAt: new Date(cached.at).toISOString() }
  }
  try {
    const catalog = matchCatalog(await listProducts())
    cached = { at: now, catalog, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao ler os produtos."
    console.error("[cobrança] produtos da AbacatePay:", message)
    cached = { at: now, catalog: cached?.catalog ?? null, error: message }
  }
  return { catalog: cached.catalog, error: cached.error, fetchedAt: new Date(cached.at).toISOString() }
}