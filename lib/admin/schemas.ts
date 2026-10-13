/** Validação dos formulários do painel do administrador (pura, testada). */

import { z } from "zod"

import { normalizeOpenAIKey } from "@/lib/ai/keys"
import { PLANS } from "@/lib/plans/plans"
import { normalizeWhatsapp } from "@/lib/validation/forms"

import {
  ORG_SORTS,
  PLAN_FILTERS,
  STATUS_FILTERS,
  SUBSCRIPTION_STATUSES,
  type OrgSort,
  type SubscriptionStatus,
} from "./labels"

/** "1.234,56", "129,9", "129.90" → número (null se vazio; NaN se inválido). */
export function parseDecimal(value: unknown): number | null {
  const text = String(value ?? "").trim().replace(/\s|R\$|US\$/g, "")
  if (!text) return null
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return Number.NaN
  return Number(normalized)
}

/** Fim do dia (23:59:59 de Brasília) da data AAAA-MM-DD, em ISO. */
export function endOfDayIso(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const value = new Date(`${date}T23:59:59-03:00`)
  return Number.isNaN(value.getTime()) ? null : value.toISOString()
}

const PLAN_IDS = Object.keys(PLANS)
const STATUS_IDS = Object.keys(SUBSCRIPTION_STATUSES) as [SubscriptionStatus, ...SubscriptionStatus[]]

export type OrganizationChanges = {
  name: string
  plan: string | null
  subscription_status: SubscriptionStatus
  trial_ends_at: string
  current_period_end: string | null
  billing_exempt: boolean
  ml_accounts_limit: number
  monthly_price: number | null
}

export type FieldErrors = Record<string, string[]>

const organizationSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da loja.").max(120, "Nome muito longo."),
  plan: z
    .string()
    .trim()
    .refine((value) => value === "" || PLAN_IDS.includes(value), "Plano desconhecido."),
  subscription_status: z.enum(STATUS_IDS, { errorMap: () => ({ message: "Escolha a situação da assinatura." }) }),
  trial_ends_at: z.string().refine((value) => endOfDayIso(value) !== null, "Informe a data do fim do teste."),
  current_period_end: z.string().refine((value) => value === "" || endOfDayIso(value) !== null, "Data inválida."),
  ml_accounts_limit: z.coerce
    .number({ invalid_type_error: "Informe um número." })
    .int("Use um número inteiro.")
    .min(0, "Mínimo 0.")
    .max(100, "Máximo 100."),
  monthly_price: z
    .string()
    .refine((value) => {
      const number = parseDecimal(value)
      return number === null || (Number.isFinite(number) && number >= 0 && number <= 1_000_000)
    }, "Valor inválido (ex.: 129,90)."),
})

export function parseOrganizationForm(
  formData: FormData
): { success: true; data: OrganizationChanges } | { success: false; fieldErrors: FieldErrors } {
  const parsed = organizationSchema.safeParse({
    name: formData.get("name") ?? "",
    plan: formData.get("plan") ?? "",
    subscription_status: formData.get("subscription_status") ?? "",
    trial_ends_at: formData.get("trial_ends_at") ?? "",
    current_period_end: formData.get("current_period_end") ?? "",
    ml_accounts_limit: formData.get("ml_accounts_limit") ?? "",
    monthly_price: formData.get("monthly_price") ?? "",
  })
  if (!parsed.success) return { success: false, fieldErrors: parsed.error.flatten().fieldErrors as FieldErrors }
  const value = parsed.data
  return {
    success: true,
    data: {
      name: value.name,
      plan: value.plan || null,
      subscription_status: value.subscription_status,
      trial_ends_at: endOfDayIso(value.trial_ends_at)!,
      current_period_end: value.current_period_end ? endOfDayIso(value.current_period_end) : null,
      billing_exempt: formData.get("billing_exempt") === "on",
      ml_accounts_limit: value.ml_accounts_limit,
      monthly_price: parseDecimal(value.monthly_price),
    },
  }
}

export const TRIAL_EXTENSIONS = [3, 7, 14, 30] as const

/** Novo fim do teste: soma os dias a partir de agora ou do fim atual, o que for mais tarde. */
export function extendTrialEnd(currentEnd: string, days: number, now: Date = new Date()): string {
  const base = Math.max(now.getTime(), new Date(currentEnd).getTime() || 0)
  return new Date(base + days * 24 * 60 * 60 * 1000).toISOString()
}

const profileSchema = z.object({
  full_name: z.string().trim().max(120, "Nome muito longo."),
  whatsapp: z
    .string()
    .trim()
    .refine((value) => value === "" || normalizeWhatsapp(value) !== null, "WhatsApp inválido (DDD + número)."),
  email: z.string().trim().toLowerCase().email("E-mail inválido.").max(254, "E-mail muito longo."),
})

export function parseProfileForm(formData: FormData):
  | { success: true; data: { full_name: string; whatsapp: string | null; email: string } }
  | { success: false; fieldErrors: FieldErrors } {
  const parsed = profileSchema.safeParse({
    full_name: formData.get("full_name") ?? "",
    whatsapp: formData.get("whatsapp") ?? "",
    email: formData.get("email") ?? "",
  })
  if (!parsed.success) return { success: false, fieldErrors: parsed.error.flatten().fieldErrors as FieldErrors }
  return {
    success: true,
    data: {
      full_name: parsed.data.full_name,
      whatsapp: parsed.data.whatsapp ? normalizeWhatsapp(parsed.data.whatsapp) : null,
      email: parsed.data.email,
    },
  }
}

export function parseFinanceSettingsForm(formData: FormData):
  | { success: true; data: { usd_brl_rate: number; monthly_fixed_costs_brl: number } }
  | { success: false; fieldErrors: FieldErrors } {
  const rate = parseDecimal(formData.get("usd_brl_rate"))
  const fixed = parseDecimal(formData.get("monthly_fixed_costs_brl"))
  const fieldErrors: FieldErrors = {}
  if (rate === null || !Number.isFinite(rate) || rate < 1 || rate > 50) {
    fieldErrors.usd_brl_rate = ["Informe a cotação (entre 1 e 50, ex.: 5,45)."]
  }
  if (fixed !== null && (!Number.isFinite(fixed) || fixed < 0 || fixed > 10_000_000)) {
    fieldErrors.monthly_fixed_costs_brl = ["Valor inválido (ex.: 350,00)."]
  }
  if (Object.keys(fieldErrors).length) return { success: false, fieldErrors }
  return {
    success: true,
    data: { usd_brl_rate: Math.round(rate! * 10000) / 10000, monthly_fixed_costs_brl: Math.round((fixed ?? 0) * 100) / 100 },
  }
}

/** Busca e filtros da lista de clientes vindos da URL. */
export function parseOrgListParams(params: Record<string, string | string[] | undefined>) {
  const first = (key: string) => {
    const value = params[key]
    return (Array.isArray(value) ? value[0] : value) ?? ""
  }
  const page = Number.parseInt(first("pagina"), 10)
  const status = first("situacao").trim()
  const plan = first("plano").trim()
  const sort = first("ordem").trim()
  return {
    search: first("busca").trim().slice(0, 100),
    status: STATUS_FILTERS.some((option) => option.value === status) ? status : "",
    plan: PLAN_FILTERS.some((option) => option.value === plan) ? plan : "",
    sort: (sort in ORG_SORTS ? sort : "recent") as OrgSort,
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 10_000) : 1,
  }
}

/** Cadastro de chave de IA. A chave nunca volta para a tela: em caso de erro, só o nome é devolvido. */
export function parseAiKeyForm(formData: FormData):
  | { success: true; data: { label: string; key: string; activate: boolean } }
  | { success: false; fieldErrors: FieldErrors; label: string } {
  const label = String(formData.get("label") ?? "").trim().replace(/\s+/g, " ")
  const key = normalizeOpenAIKey(formData.get("key"))
  const fieldErrors: FieldErrors = {}
  if (!label) fieldErrors.label = ["Dê um nome para reconhecer a chave (ex.: Produção out/2026)."]
  else if (label.length > 80) fieldErrors.label = ["Nome muito longo (até 80 caracteres)."]
  if (!key.ok) fieldErrors.key = [key.message]
  if (!key.ok || Object.keys(fieldErrors).length) return { success: false, fieldErrors, label: label.slice(0, 80) }
  return { success: true, data: { label, key: key.key, activate: formData.get("activate") === "on" } }
}
