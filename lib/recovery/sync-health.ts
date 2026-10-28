/**
 * Saúde da leitura do Recuperador (pura, testada): diz se a conta está sendo lida ou parou, e por quê, sem migração nem
 * alerta novo. Usada pela tela /recuperador e pelo cron (logs de contas paradas ou sem acesso).
 */

export const SYNC_STALE_MS = 30 * 60 * 1000

export type SyncHealthStatus = "ok" | "parado" | "sem_acesso" | "token_invalido"

export type SyncHealth = {
  status: SyncHealthStatus
  /** Frase em linguagem simples para o dono da loja (vazia quando está tudo certo). */
  message: string
  /** Motivo técnico para gravar em recovery_sync.last_error / logs (sem dados de comprador). */
  reason: string | null
}

export type OrganizationAccessLike = {
  billing_exempt?: boolean | null
  subscription_status?: string | null
  current_period_end?: string | null
  trial_ends_at?: string | null
}

/** Espelho em JS da regra de claim_recovery_sync (organização com acesso): assinatura, período pago ou teste vigente. */
export function organizationHasAccess(org: OrganizationAccessLike, now: Date): boolean {
  if (org.billing_exempt) return true
  const time = (value: string | null | undefined) => (value ? Date.parse(value) : NaN)
  const after = (value: string | null | undefined) => time(value) > now.getTime()
  if (org.subscription_status === "active") return true
  if ((org.subscription_status === "canceled" || org.subscription_status === "past_due") && after(org.current_period_end)) return true
  if (org.subscription_status === "trialing" && after(org.trial_ends_at)) return true
  return false
}

function dayMonth(value: string | Date): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(value))
}

export function classifySyncHealth(input: {
  now: Date
  accountActive: boolean
  tokenValid: boolean
  /** A organização tem acesso (teste vigente ou assinatura)? */
  hasAccess: boolean
  /** Fim do teste grátis (para a mensagem). */
  trialEndsAt?: string | null
  sync: { last_returns_at: string | null; last_error: string | null; last_error_at: string | null } | null
}): SyncHealth {
  const { now, sync } = input
  if (!input.accountActive || !input.tokenValid) {
    return {
      status: "token_invalido",
      message: "A conexão desta conta com o Mercado Livre expirou ou foi desfeita; o Recuperador parou de ler as devoluções. Reconecte a conta em Contas do Mercado Livre.",
      reason: "Conta do Mercado Livre desconectada ou com token inválido.",
    }
  }
  if (!input.hasAccess) {
    const trialEnd = input.trialEndsAt && Date.parse(input.trialEndsAt) <= now.getTime() ? input.trialEndsAt : null
    return {
      status: "sem_acesso",
      message: trialEnd
        ? "Seu teste grátis terminou em " + dayMonth(trialEnd) + "; o Recuperador parou de ler as devoluções. Assine para voltar a acompanhar."
        : "Sua loja está sem assinatura ativa; o Recuperador parou de ler as devoluções. Assine para voltar a acompanhar.",
      reason: "Organização sem acesso (teste vencido ou sem assinatura).",
    }
  }
  const lastRead = sync?.last_returns_at ? Date.parse(sync.last_returns_at) : NaN
  if (!Number.isFinite(lastRead)) return { status: "ok", message: "", reason: null }
  const lastErrorAt = sync?.last_error_at ? Date.parse(sync.last_error_at) : NaN
  // Com erro gravado, a rodada ainda "tenta de novo" (e atualiza a hora do erro); o erro velho = ninguém mais tentou.
  const reference = sync?.last_error ? (Number.isFinite(lastErrorAt) ? lastErrorAt : lastRead) : lastRead
  if (now.getTime() - reference > SYNC_STALE_MS) {
    const minutes = Math.round((now.getTime() - reference) / 60_000)
    return {
      status: "parado",
      message:
        "A maanu está sem ler as devoluções desta conta há " +
        (minutes >= 120 ? Math.round(minutes / 60) + " horas" : minutes + " minutos") +
        (sync?.last_error ? " (último erro: " + sync.last_error.slice(0, 160) + ")" : "") +
        ". Se continuar assim, fale com o suporte.",
      reason: sync?.last_error ?? "Sem leitura bem-sucedida há " + minutes + " minutos.",
    }
  }
  return { status: "ok", message: "", reason: null }
}
