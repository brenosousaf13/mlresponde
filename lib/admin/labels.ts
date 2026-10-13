/** Textos e cores do painel do administrador (puro). */

import { PLANS } from "@/lib/plans/plans"

import type { AiFeatureKey, OrgStage, OrgStatus } from "./types"

export type Tone = "teal" | "sage" | "amber" | "red" | "slate" | "graphite" | "violet"

export const ORG_STATUS: Record<OrgStatus, { label: string; tone: Tone; hint: string }> = {
  trial: { label: "Em teste", tone: "amber", hint: "Teste grátis em andamento" },
  trial_expired: { label: "Teste vencido", tone: "slate", hint: "Teste acabou sem assinatura: app bloqueado" },
  active: { label: "Assinante", tone: "teal", hint: "Assinatura ativa" },
  courtesy: { label: "Cortesia", tone: "sage", hint: "Acesso liberado sem cobrança" },
  past_due: { label: "Inadimplente", tone: "red", hint: "Pagamento atrasado: app bloqueado" },
  canceled: { label: "Cancelado", tone: "slate", hint: "Assinatura cancelada: app bloqueado" },
  internal: { label: "Interna", tone: "graphite", hint: "Organização da equipe maanu (plano admin)" },
}

export const ORG_STAGE: Record<OrgStage, { label: string; tone: Tone; step: number }> = {
  unconfirmed: { label: "E-mail não confirmado", tone: "red", step: 1 },
  onboarding: { label: "Cadastro incompleto", tone: "amber", step: 2 },
  no_ml: { label: "Sem conta do ML", tone: "amber", step: 3 },
  setup: { label: "Configurando a IA", tone: "slate", step: 4 },
  ai_off: { label: "IA desligada", tone: "slate", step: 5 },
  live: { label: "IA respondendo", tone: "teal", step: 6 },
}

export const AI_FEATURES: Record<AiFeatureKey, { label: string; short: string }> = {
  question_answer: { label: "Respostas automáticas (perguntas)", short: "Respostas" },
  question_suggestion: { label: "Sugestões da IA (perguntas)", short: "Sugestões" },
  assistant_test: { label: "Testes do Assistente de IA", short: "Testes" },
  after_sale_answer: { label: "Pós-venda automático", short: "Pós-venda" },
  after_sale_suggestion: { label: "Sugestões do pós-venda", short: "Sugestões PV" },
  after_sale_test: { label: "Testes do agente de pós-venda", short: "Testes PV" },
  key_check: { label: "Testes de chave (painel do administrador)", short: "Teste de chave" },
  listing_improvement: { label: "Melhorias de anúncio", short: "Melhorias" },
}

export const AI_KEY_STATUS: Record<"active" | "standby" | "disabled", { label: string; tone: Tone; hint: string }> = {
  active: { label: "Em uso", tone: "teal", hint: "Todas as chamadas à IA usam esta chave" },
  standby: { label: "Reserva", tone: "slate", hint: "Entra sozinha se a OpenAI recusar a chave em uso" },
  disabled: { label: "Desativada", tone: "red", hint: "Não é usada" },
}

export const STATUS_FILTERS: { value: OrgStatus; label: string }[] = (
  ["trial", "trial_expired", "active", "courtesy", "past_due", "canceled", "internal"] as const
).map((value) => ({ value, label: ORG_STATUS[value].label }))

export const PLAN_FILTERS: { value: string; label: string }[] = [
  { value: "none", label: "Sem plano" },
  ...Object.values(PLANS).map((plan) => ({ value: plan.id, label: plan.name })),
]

export const ORG_SORTS = {
  recent: "Cadastro mais recente",
  last_seen: "Último acesso",
  ai_cost: "Custo de IA (30 dias)",
  questions: "Perguntas (30 dias)",
  trial_end: "Fim do teste",
  name: "Nome da loja",
} as const

export type OrgSort = keyof typeof ORG_SORTS

export const SUBSCRIPTION_STATUSES = {
  trialing: "Em teste",
  active: "Ativa (paga)",
  past_due: "Pagamento atrasado",
  canceled: "Cancelada",
} as const

export type SubscriptionStatus = keyof typeof SUBSCRIPTION_STATUSES

export const MEMBER_ROLES: Record<string, string> = { owner: "Dono", admin: "Administrador", member: "Membro" }

export const ML_ACCOUNT_STATUS: Record<string, string> = {
  active: "Ativa",
  inactive: "Desativada",
  disconnected: "Desconectada",
}

export const QUESTION_STATUS: Record<string, string> = {
  pending: "Na fila",
  processing: "IA analisando",
  answered: "Respondida",
  needs_review: "Esperando o vendedor",
  answered_outside: "Respondida fora",
  ignored: "Arquivada",
  failed: "Falhou",
}

/** Nomes dos campos que aparecem no histórico (antes → depois). */
export const AUDIT_FIELDS: Record<string, string> = {
  name: "Nome da loja",
  plan: "Plano",
  subscription_status: "Situação da assinatura",
  trial_ends_at: "Fim do teste",
  current_period_end: "Fim do período pago",
  billing_exempt: "Cortesia",
  ml_accounts_limit: "Limite de contas ML",
  monthly_price: "Mensalidade (R$)",
  monthly_answers_limit: "Respostas automáticas por mês (acordo)",
  billing_cycle: "Ciclo de cobrança",
  full_name: "Nome",
  whatsapp: "WhatsApp",
  email: "E-mail",
  ai_paused: "IA pausada",
  ai_paused_reason: "Motivo da pausa",
  usd_brl_rate: "Cotação do dólar",
  monthly_fixed_costs_brl: "Custos fixos (R$/mês)",
  label: "Nome",
  hint: "Chave",
  status: "Situação",
}

export const AUDIT_ACTIONS: Record<string, string> = {
  "organization.update": "Assinatura/loja alterada",
  "organization.notes": "Notas internas",
  "user.update": "Usuário alterado",
  "user.email": "E-mail trocado",
  "user.confirm_email": "E-mail confirmado",
  "user.password_reset": "Redefinição de senha",
  "user.ban": "Acesso bloqueado",
  "user.unban": "Acesso desbloqueado",
  "ml_account.pause": "IA da conta pausada",
  "platform.ai_paused": "IA geral pausada",
  "platform.ai_resumed": "IA geral retomada",
  "platform.settings": "Configurações",
  "ai_key.add": "Chave de IA cadastrada",
  "ai_key.activate": "Chave de IA posta em uso",
  "ai_key.standby": "Chave de IA na reserva",
  "ai_key.disable": "Chave de IA desativada",
  "ai_key.check": "Chave de IA testada",
  "ai_key.delete": "Chave de IA removida",
  "ai_key.auto_disabled": "Chave de IA trocada automaticamente",
  "admin.export": "Exportação",
  "admin.login": "Entrada no painel",
  "admin.mfa_enrolled": "2 etapas cadastrada",
  "admin.mfa_failed": "Código errado",
}

export const AUDIT_FILTERS: { value: string; label: string }[] = [
  { value: "organization.", label: "Clientes" },
  { value: "user.", label: "Usuários" },
  { value: "ml_account.", label: "Contas ML" },
  { value: "platform.", label: "Plataforma" },
  { value: "ai_key.", label: "Chaves de IA" },
  { value: "admin.", label: "Acessos ao painel" },
]

/** Etapas do funil de ativação (cadastros dos últimos 30 dias). */
export const FUNNEL_STEPS = [
  { key: "signed_up", label: "Cadastraram" },
  { key: "confirmed", label: "Confirmaram o e-mail" },
  { key: "onboarded", label: "Concluíram o cadastro" },
  { key: "connected_ml", label: "Conectaram o ML" },
  { key: "configured_ai", label: "Configuraram a IA" },
  { key: "enabled_ai", label: "Ligaram a IA" },
  { key: "first_ai_answer", label: "IA respondeu" },
  { key: "paying", label: "Assinaram" },
] as const

export type FunnelKey = (typeof FUNNEL_STEPS)[number]["key"]

export function auditActionLabel(action: string) {
  return AUDIT_ACTIONS[action] ?? action
}
