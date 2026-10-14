/**
 * Subdomínio do painel (puro, testado). Com ADMIN_HOST definido (ex.: "admin.maanu.com.br"):
 * - no endereço do painel abrem o painel, o login e o aviso de acesso negado (o resto vai para /admin);
 * - em qualquer outro endereço, /admin responde 404.
 * Sem ADMIN_HOST, o painel fica em /admin no mesmo domínio do app.
 */

export type AdminHostDecision = { kind: "pass" } | { kind: "not_found" } | { kind: "redirect"; pathname: string }

/** Caminhos que o endereço do painel também serve (login, recuperação e aviso de acesso negado). */
const ADMIN_HOST_ALLOWED = ["/login", "/recuperar-senha", "/redefinir-senha", "/auth/confirm", "/acesso-negado"]

function matches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export function normalizeHost(host: string | null | undefined): string {
  return (host ?? "").trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "")
}

function siteOrigin(siteUrl: string | null | undefined): URL | null {
  try {
    return siteUrl ? new URL(siteUrl) : null
  } catch {
    return null
  }
}

/** Link para o painel a partir do app (com ADMIN_HOST, aponta para o subdomínio, com o protocolo/porta do app). */
export function adminPanelHref(adminHost: string | null | undefined, siteUrl: string | null | undefined): string {
  const host = normalizeHost(adminHost)
  if (!host) return "/admin"
  const site = siteOrigin(siteUrl)
  const protocol = site?.protocol ?? "https:"
  const port = site?.port ? `:${site.port}` : ""
  return `${protocol}//${host}${port}/admin`
}

/** Link de volta para o app a partir do painel (com ADMIN_HOST, aponta para o endereço do app). */
export function appHomeHref(adminHost: string | null | undefined, siteUrl: string | null | undefined): string {
  const site = siteOrigin(siteUrl)
  if (!normalizeHost(adminHost) || !site) return "/painel"
  return `${site.origin}/painel`
}

export function isAdminPath(pathname: string) {
  return matches(pathname, "/admin")
}

export function adminHostRouting(input: {
  host: string | null | undefined
  pathname: string
  adminHost: string | null | undefined
}): AdminHostDecision {
  const adminHost = normalizeHost(input.adminHost)
  if (!adminHost) return { kind: "pass" }
  const onAdminHost = normalizeHost(input.host) === adminHost

  if (!onAdminHost) return isAdminPath(input.pathname) ? { kind: "not_found" } : { kind: "pass" }
  if (isAdminPath(input.pathname) || ADMIN_HOST_ALLOWED.some((prefix) => matches(input.pathname, prefix))) {
    return { kind: "pass" }
  }
  return { kind: "redirect", pathname: "/admin" }
}
