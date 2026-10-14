/**
 * Configuração da cobrança pela AbacatePay (puro, testado em tests/unit/abacatepay.test.ts).
 *
 * Variáveis (só no servidor, nunca no navegador):
 *  - ABACATEPAY_API_KEY: chave de API (abc_dev_... = modo de teste; abc_prod_... = produção). Permissões em CEREBRO §5.
 *  - ABACATEPAY_WEBHOOK_SECRET: segredo do webhook (mínimo 32 caracteres), o mesmo cadastrado no webhook da AbacatePay.
 *  - ABACATEPAY_TEST_EMAILS (opcional): e-mails que podem assinar quando a chave é de teste, em produção.
 *  - ABACATEPAY_SUBSCRIPTION_METHODS (opcional): "CARD" (padrão) ou "CARD,PIX" (PIX Automático liberado na conta).
 * Sem a chave ou sem o segredo, a contratação pelo app fica desligada ("em breve") e nada muda no resto do app.
 */

export type BillingKeyMode = "test" | "live" | "unknown"
export type SubscriptionMethod = "CARD" | "PIX"

export type BillingSettings = {
  apiKey: string | null
  webhookSecret: string | null
  /** Segredo com o tamanho mínimo exigido pela AbacatePay (32 caracteres). */
  webhookSecretValid: boolean
  /** Chave e segredo configurados: a contratação pelo app pode ser ligada. */
  enabled: boolean
  keyMode: BillingKeyMode | null
  testEmails: string[]
  methods: SubscriptionMethod[]
  /** Deploy de produção da Vercel (em teste local ou de preview qualquer conta pode usar a chave de teste). */
  production: boolean
}

export const WEBHOOK_SECRET_MIN_LENGTH = 32

type Env = Record<string, string | undefined>

export function keyMode(apiKey: string): BillingKeyMode {
  if (apiKey.startsWith("abc_dev_")) return "test"
  if (apiKey.startsWith("abc_prod_")) return "live"
  return "unknown"
}

export function billingSettings(env: Env = process.env): BillingSettings {
  const apiKey = env.ABACATEPAY_API_KEY?.trim() || null
  const webhookSecret = env.ABACATEPAY_WEBHOOK_SECRET?.trim() || null
  const webhookSecretValid = Boolean(webhookSecret && webhookSecret.length >= WEBHOOK_SECRET_MIN_LENGTH)
  const methods = (env.ABACATEPAY_SUBSCRIPTION_METHODS ?? "CARD")
    .split(",")
    .map((method) => method.trim().toUpperCase())
    .filter((method): method is SubscriptionMethod => method === "CARD" || method === "PIX")
  return {
    apiKey,
    webhookSecret,
    webhookSecretValid,
    enabled: Boolean(apiKey) && webhookSecretValid,
    keyMode: apiKey ? keyMode(apiKey) : null,
    testEmails: (env.ABACATEPAY_TEST_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
    methods: methods.length ? [...new Set(methods)] : ["CARD"],
    production: env.VERCEL_ENV === "production",
  }
}

/**
 * Pagamento de teste (chave de teste ou checkout devolvido em modo de teste): em produção só para administradores da
 * plataforma e para os e-mails de ABACATEPAY_TEST_EMAILS. Sem isso, um cliente real "pagaria" com o cartão de teste
 * 4242... e ganharia o plano de graça.
 */
export function canUseTestPayments(settings: BillingSettings, user: { email: string; isPlatformAdmin: boolean }): boolean {
  if (!settings.production) return true
  if (user.isPlatformAdmin) return true
  return settings.testEmails.includes(user.email.trim().toLowerCase())
}