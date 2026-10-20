/** Formato do JSON devolvido pelas funções admin_* do banco (migração 20261012120000_painel_admin.sql). */

export type OrgStatus = "internal" | "courtesy" | "active" | "past_due" | "canceled" | "trial" | "trial_expired"
export type OrgStage = "unconfirmed" | "onboarding" | "no_ml" | "setup" | "ai_off" | "live"
export type AiFeatureKey =
  | "question_answer"
  | "question_suggestion"
  | "assistant_test"
  | "after_sale_answer"
  | "after_sale_suggestion"
  | "after_sale_test"
  | "key_check"
  | "listing_improvement"
  | "reputation_claim_analysis"
  | "recovery_return_message"

export type AdminOrgRow = {
  organization_id: string
  name: string
  plan: string | null
  status: OrgStatus
  stage: OrgStage
  subscription_status: string
  billing_exempt: boolean
  trial_ends_at: string
  current_period_end: string | null
  monthly_price: number | null
  ml_accounts_limit: number
  created_at: string
  owner_id: string | null
  owner_email: string | null
  owner_name: string | null
  owner_whatsapp: string | null
  owner_email_confirmed: boolean
  owner_banned: boolean
  onboarded: boolean
  billing_completed: boolean
  document_type: "cpf" | "cnpj" | null
  document: string | null
  legal_name: string | null
  members: number
  last_seen_at: string | null
  ml_ever: number
  ml_total: number
  ml_active: number
  ml_invalid: number
  ml_nicknames: string
  configured: boolean
  auto_reply_on: boolean
  after_sale_on: boolean
  questions_30d: number
  ai_answers_30d: number
  open_now: number
  ai_calls_30d: number
  ai_tokens_30d: number
  ai_cost_30d_usd: number
  ai_cost_month_usd: number
}

export type DailyCost = { day: string; cost_usd: number; tokens: number; calls: number; failed?: number }

export type AdminOverview = {
  generated_at: string
  organizations: {
    total: number
    by_status: Partial<Record<OrgStatus, number>>
    internal: number
    mrr: number
    paying: number
    paying_without_price: number
    funnel: {
      signed_up: number
      confirmed: number
      onboarded: number
      connected_ml: number
      configured_ai: number
      enabled_ai: number
      first_ai_answer: number
      paying: number
    }
    recent_signups: {
      organization_id: string
      name: string
      owner_name: string | null
      owner_email: string | null
      created_at: string
      status: OrgStatus
      stage: OrgStage
      ml_total: number
    }[]
    trials_ending: {
      organization_id: string
      name: string
      owner_name: string | null
      owner_email: string | null
      owner_whatsapp: string | null
      trial_ends_at: string
      stage: OrgStage
      ai_answers_30d: number
    }[]
  }
  users: {
    total: number
    confirmed: number
    new_today: number
    new_7d: number
    new_30d: number
    new_prev_30d: number
    active_today: number
    active_7d: number
    active_30d: number
  }
  ml_accounts: { connected: number; active: number; invalid_token: number; auto_reply_on: number; after_sale_on: number }
  questions: { today: number; last_7d: number; last_30d: number; ai_7d: number; ai_30d: number; open_now: number }
  ai: {
    cost_today_usd: number
    cost_7d_usd: number
    cost_month_usd: number
    cost_prev_month_usd: number
    tokens_month: number
    calls_month: number
    errors_24h: number
  }
  signups_daily: { day: string; signups: number }[]
  ai_daily: DailyCost[]
  alerts: {
    questions_stuck: number
    questions_failed: number
    conversations_stuck: number
    conversations_failed: number
    ml_invalid_tokens: number
    ai_errors_24h: number
  }
  platform: {
    ai_paused: boolean
    ai_paused_at: string | null
    ai_paused_reason: string
    usd_brl_rate: number
    monthly_fixed_costs_brl: number
  }
}

export type AdminOrgList = { total: number; rows: AdminOrgRow[] }

export type AdminMember = {
  user_id: string
  role: "owner" | "admin" | "member"
  email: string
  full_name: string | null
  whatsapp: string | null
  created_at: string
  last_sign_in_at: string | null
  last_seen_at: string | null
  email_confirmed_at: string | null
  banned_until: string | null
  is_platform_admin: boolean
  onboarding_completed_at: string | null
  terms_version: string | null
  terms_accepted_at: string | null
  mfa_factors: number
}

export type AdminMlAccount = {
  id: string
  ml_user_id: number
  nickname: string | null
  site_id: string | null
  status: "active" | "inactive" | "disconnected"
  token_status: "valid" | "invalid"
  last_refresh_error: string | null
  last_refresh_error_at: string | null
  auto_reply_enabled: boolean
  answer_mode: string
  configured: boolean
  after_sale_enabled: boolean
  created_at: string
  questions_30d: number
  ai_answers_30d: number
  open_now: number
  last_question_at: string | null
}

export type AdminAuditRow = {
  id: number
  created_at: string
  actor_email: string | null
  action: string
  target_type?: string | null
  target_id?: string | null
  organization_id?: string | null
  organization_name?: string | null
  summary: string
  details: { before?: Record<string, unknown>; after?: Record<string, unknown> } & Record<string, unknown>
  ip?: string | null
  user_agent?: string | null
}

export type AdminOrgDetail = {
  organization: AdminOrgRow
  billing: {
    document_type: "cpf" | "cnpj"
    document: string
    legal_name: string
    postal_code: string
    street: string
    address_number: string
    complement: string | null
    district: string
    city: string
    state: string
    created_at: string
    updated_at: string
  } | null
  notes: { notes: string; updated_at: string; updated_by_email: string | null } | null
  members: AdminMember[]
  ml_accounts: AdminMlAccount[]
  questions_30d: {
    total: number
    ai: number
    fallback: number
    manual: number
    outside: number
    open: number
    queue: number
    ignored: number
  }
  conversations_30d: { total: number; answered: number; open: number }
  usage_by_feature: { feature: AiFeatureKey; calls: number; tokens: number; cost_usd: number; failed: number }[]
  usage_daily: DailyCost[]
  recent_questions: {
    id: string
    question_text: string
    item_title: string | null
    status: string
    answer_source: string | null
    review_reason: string | null
    fallback_reason: string | null
    ai_confidence: number | null
    created_at: string
    account_nickname: string | null
  }[]
  audit: AdminAuditRow[]
}

export type AdminAiUsage = {
  totals: {
    calls: number
    failed: number
    input_tokens: number
    cached_input_tokens: number
    output_tokens: number
    reasoning_tokens: number
    total_tokens: number
    cost_usd: number
    avg_latency_ms: number | null
  }
  previous: { calls: number; total_tokens: number; cost_usd: number }
  answers: { questions_ai: number; after_sale_ai: number }
  daily: DailyCost[]
  by_feature: { feature: AiFeatureKey; calls: number; tokens: number; cost_usd: number; failed: number; avg_tokens: number | null }[]
  by_model: {
    model: string
    calls: number
    input_tokens: number
    cached_input_tokens: number
    output_tokens: number
    total_tokens: number
    cost_usd: number
  }[]
  top_organizations: {
    organization_id: string
    name: string
    calls: number
    tokens: number
    cost_usd: number
    monthly_price: number | null
    status: OrgStatus
  }[]
  recent_errors: {
    created_at: string
    feature: AiFeatureKey
    model: string
    error: string | null
    organization_id: string | null
    organization_name: string | null
  }[]
  usd_brl_rate: number
}

export type AdminFinance = {
  month_start: string
  month_end: string
  settings: { usd_brl_rate: number; monthly_fixed_costs_brl: number; updated_at: string }
  mrr: number
  paying: number
  paying_without_price: number
  counts: Partial<Record<OrgStatus, number>>
  ai_cost_month_usd: number
  ai_cost_prev_month_usd: number
  ai_cost_unassigned_month_usd: number
  rows: {
    organization_id: string
    name: string
    status: OrgStatus
    plan: string | null
    monthly_price: number | null
    ai_cost_month_usd: number
    ai_answers_month: number
    current_period_end: string | null
  }[]
  past_due: {
    organization_id: string
    name: string
    owner_email: string | null
    owner_whatsapp: string | null
    monthly_price: number | null
    current_period_end: string | null
  }[]
  trials_ending: {
    organization_id: string
    name: string
    owner_email: string | null
    owner_whatsapp: string | null
    trial_ends_at: string
    stage: OrgStage
    ai_answers_30d: number
  }[]
}

export type QueueStats = {
  pending: number
  processing: number
  failed: number
  needs_review: number
  stuck: number
  oldest_waiting_at: string | null
}

export type AdminOperations = {
  platform: { ai_paused: boolean; ai_paused_reason: string; ai_paused_at: string | null; ai_paused_by_email: string | null }
  questions: QueueStats
  conversations: QueueStats
  recent_errors: {
    kind: "question" | "conversation"
    id: string
    organization_id: string
    organization_name: string
    account_nickname: string | null
    status: string
    attempts: number
    error: string
    updated_at: string
  }[]
  accounts_with_problems: {
    id: string
    organization_id: string
    organization_name: string
    nickname: string | null
    status: string
    token_status: string
    error: string | null
    error_at: string | null
  }[]
  hourly: { hour: string; questions: number; ai_calls: number; ai_failed: number }[]
  ai_24h: {
    calls: number
    failed: number
    avg_latency_ms: number | null
    last_error: { created_at: string; error: string | null; feature: AiFeatureKey } | null
  }
}

export type AdminAuditList = { total: number; rows: AdminAuditRow[] }

/** admin_list_ai_keys (migração 20261013012212_chaves_ia.sql). Nunca traz a chave nem o conteúdo criptografado. */
export type AdminAiKey = {
  id: string
  provider: string
  label: string
  hint: string
  status: "active" | "standby" | "disabled"
  disabled_reason: string | null
  disabled_at: string | null
  activated_at: string | null
  last_checked_at: string | null
  last_check_ok: boolean | null
  last_check_error: string | null
  created_at: string
  created_by_email: string | null
  calls_30d: number
  failed_30d: number
  cost_30d_usd: number
  last_used_at: string | null
}

export type AdminAiKeys = {
  keys: AdminAiKey[]
  env: { calls_30d: number; failed_30d: number; cost_30d_usd: number; last_used_at: string | null }
  recent_events: { created_at: string; action: string; summary: string; actor_email: string | null }[]
}
