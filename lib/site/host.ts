/**
 * Endereços do site (puro, testado em tests/unit/site.test.ts).
 *
 * maanu.com.br/ é a página de vendas (SALES_PAGE_PATH). O app mora num endereço próprio, definido pela variável APP_HOST
 * ("app.maanu.com.br" em produção desde a Sessão 27):
 *  - sem APP_HOST (computador local, ou se a variável for apagada para voltar atrás): "/" é a página de vendas, sem
 *    login, e o resto do app continua no mesmo endereço;
 *  - com APP_HOST, no endereço do app: "/" leva ao painel e todo o resto funciona como sempre;
 *  - com APP_HOST, nos outros endereços (o domínio principal): ficam a página de vendas, as páginas legais, robots/sitemap
 *    e as rotas chamadas por servidores (webhooks do Mercado Livre e da AbacatePay, crons da Vercel), para nada quebrar
 *    durante a troca; todo o resto vai para o MESMO caminho no endereço do app (login, cadastro, painel, links dos e-mails,
 *    retorno do OAuth do Mercado Livre), com a busca preservada.
 * O endereço do painel do administrador (ADMIN_HOST) é tratado à parte (lib/admin/host.ts).
 */
import { normalizeHost } from "@/lib/admin/host"
import { siteConfig } from "@/lib/config/site"

/**
 * Caminho da página de vendas: a raiz do domínio principal. Precisa bater com a pasta da rota (app/(site)/page.tsx).
 * Até a Sessão 27 ela ficou em /institucional (revisão); esse endereço antigo vai para "/" com 308 (next.config.ts).
 */
export const SALES_PAGE_PATH = "/"

export type SiteHostDecision =
  /** Página de vendas: não precisa de sessão (o proxy nem consulta o login). */
  | { kind: "landing" }
  /** Fluxo normal do app (sessão, login, permissões). */
  | { kind: "pass" }
  | { kind: "redirect"; url: string }

/** Caminhos que o domínio principal continua servindo quando o app tem endereço próprio. */
const SITE_HOST_PATHS = [
  "/termos",
  "/privacidade",
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/og",
  "/api/webhook",
  "/api/cron",
]

function matches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

/** localhost e *.localhost (testes no computador): mantém http e a porta. */
export function isLocalHost(host: string): boolean {
  const normalized = normalizeHost(host)
  return normalized === "localhost" || normalized.endsWith(".localhost") || normalized === "127.0.0.1"
}

/** Mesmo caminho e busca, no endereço do app. */
export function appHostUrl(requestUrl: string, appHost: string): string {
  const target = new URL(requestUrl)
  const host = normalizeHost(appHost)
  target.hostname = host
  if (!isLocalHost(host)) {
    target.protocol = "https:"
    target.port = ""
  }
  return target.toString()
}

export function siteHostRouting(input: {
  /** URL completa da requisição. */
  url: string
  /** Cabeçalho Host da requisição. */
  host: string | null | undefined
  appHost: string | null | undefined
  adminHost?: string | null
}): SiteHostDecision {
  const appHost = normalizeHost(input.appHost)
  const adminHost = normalizeHost(input.adminHost)
  const host = normalizeHost(input.host)
  const { pathname } = new URL(input.url)

  if (adminHost && host === adminHost) return { kind: "pass" }

  if (appHost && host === appHost) {
    if (pathname !== "/") return { kind: "pass" }
    const target = new URL(input.url)
    target.pathname = "/painel"
    target.search = ""
    return { kind: "redirect", url: target.toString() }
  }

  if (pathname === SALES_PAGE_PATH) return { kind: "landing" }
  if (!appHost) return { kind: "pass" }
  if (SITE_HOST_PATHS.some((prefix) => matches(pathname, prefix))) return { kind: "pass" }
  return { kind: "redirect", url: appHostUrl(input.url, appHost) }
}

/**
 * Endereço base das URLs que cadastramos em serviços de fora para eles chamarem a maanu (webhook da AbacatePay; a URL de
 * notificações do Mercado Livre segue a mesma regra, cadastrada à mão no DevCenter).
 * Com o app num endereço próprio (APP_HOST), fica no **domínio principal**, que continua servindo /api/webhook/* (veja
 * SITE_HOST_PATHS): assim a URL cadastrada não muda quando o app troca de endereço e ninguém precisa recadastrar nada.
 * Sem APP_HOST, é o endereço do próprio app (NEXT_PUBLIC_SITE_URL, ex.: staging), ou o domínio principal.
 */
export function webhookBaseUrl(
  input: { appHost?: string | null; siteUrl?: string | null; marketingUrl?: string } = {
    appHost: process.env.APP_HOST,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  }
): string {
  const marketing = (input.marketingUrl ?? siteConfig.marketingUrl).replace(/\/+$/, "")
  if (normalizeHost(input.appHost)) return marketing
  const site = input.siteUrl?.trim().replace(/\/+$/, "")
  return site || marketing
}

/**
 * Link para uma página do app a partir da página de vendas. Usa NEXT_PUBLIC_SITE_URL (o endereço do app nos e-mails);
 * sem ela, o caminho relativo (mesmo endereço).
 */
export function appHref(path: string, siteUrl: string | null | undefined = process.env.NEXT_PUBLIC_SITE_URL): string {
  const base = siteUrl?.trim().replace(/\/+$/, "")
  if (!base) return path
  try {
    return new URL(path, `${base}/`).toString()
  } catch {
    return path
  }
}

/**
 * Só o endereço oficial (maanu.com.br) entra nos buscadores. Cópias (staging, *.vercel.app, endereço do app ou do
 * painel) recebem "noindex" (cabeçalho X-Robots-Tag no proxy) para não competir com ele. localhost fica de fora.
 */
export function isIndexableHost(
  host: string | null | undefined,
  canonicalUrl: string = siteConfig.marketingUrl
): boolean {
  const current = normalizeHost(host)
  if (!current) return false
  if (isLocalHost(current)) return true
  return current === normalizeHost(new URL(canonicalUrl).host)
}
