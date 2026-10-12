/**
 * Regra da sessão do painel do administrador (pura, testada). Espelho de public.admin_assert() no banco.
 * Exige verificação em 2 etapas (aal2) com o código TOTP digitado há no máximo 12 horas.
 */

export const ADMIN_MFA_MAX_AGE_SECONDS = 12 * 60 * 60

export type AdminSessionClaims = { aal?: unknown; amr?: unknown }

export type AdminSessionState = "ok" | "needs_mfa"

/** Momento (segundos Unix) da última verificação TOTP na sessão; null se não houver. */
export function lastTotpVerification(claims: AdminSessionClaims | null | undefined): number | null {
  if (!claims || !Array.isArray(claims.amr)) return null
  let latest: number | null = null
  for (const entry of claims.amr) {
    if (entry && typeof entry === "object" && (entry as { method?: unknown }).method === "totp") {
      const timestamp = Number((entry as { timestamp?: unknown }).timestamp)
      if (Number.isFinite(timestamp) && (latest === null || timestamp > latest)) latest = timestamp
    }
  }
  return latest
}

function hasTotpWithoutTimestamp(claims: AdminSessionClaims): boolean {
  return Array.isArray(claims.amr) && claims.amr.some((entry) => entry === "totp")
}

export function evaluateAdminSession(
  claims: AdminSessionClaims | null | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): AdminSessionState {
  if (!claims || claims.aal !== "aal2") return "needs_mfa"
  const verifiedAt = lastTotpVerification(claims)
  if (verifiedAt !== null) return nowSeconds - verifiedAt <= ADMIN_MFA_MAX_AGE_SECONDS ? "ok" : "needs_mfa"
  return hasTotpWithoutTimestamp(claims) ? "ok" : "needs_mfa"
}

/** Segundos até a sessão do painel pedir o código de novo (0 = já precisa). */
export function adminSessionSecondsLeft(
  claims: AdminSessionClaims | null | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): number {
  const verifiedAt = lastTotpVerification(claims)
  if (verifiedAt === null || evaluateAdminSession(claims, nowSeconds) !== "ok") return 0
  return Math.max(0, verifiedAt + ADMIN_MFA_MAX_AGE_SECONDS - nowSeconds)
}

/** Código do app autenticador: 6 dígitos (espaços e traços colados do app são ignorados). */
export function normalizeTotpCode(value: unknown): string | null {
  const digits = String(value ?? "").replace(/[\s-]/g, "")
  return /^\d{6}$/.test(digits) ? digits : null
}

/** Tentativas erradas de código permitidas em ADMIN_MFA_WINDOW_MINUTES antes de bloquear. */
export const ADMIN_MFA_MAX_FAILURES = 5
export const ADMIN_MFA_WINDOW_MINUTES = 15
