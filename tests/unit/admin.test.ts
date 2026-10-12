import { describe, expect, it } from "vitest"

import { csvCell, toCsv } from "@/lib/admin/csv"
import { monthElapsedFraction, summarizeFinance } from "@/lib/admin/finance"
import { formatShare, formatTokens, formatUsd, percentChange, shortDay, toDateInput } from "@/lib/admin/format"
import { adminHostRouting, adminPanelHref, appHomeHref, isAdminPath, normalizeHost } from "@/lib/admin/host"
import {
  endOfDayIso,
  extendTrialEnd,
  parseDecimal,
  parseFinanceSettingsForm,
  parseOrganizationForm,
  parseOrgListParams,
  parseProfileForm,
} from "@/lib/admin/schemas"
import {
  ADMIN_MFA_MAX_AGE_SECONDS,
  adminSessionSecondsLeft,
  evaluateAdminSession,
  lastTotpVerification,
  normalizeTotpCode,
} from "@/lib/admin/session"
import type { AdminFinance } from "@/lib/admin/types"
import { estimateCostUsd, modelPrice, normalizeUsage } from "@/lib/ai/pricing"

const NOW = 1_800_000_000

describe("sessão do painel do administrador", () => {
  const totp = (age: number) => ({ method: "totp", timestamp: NOW - age })
  const password = { method: "password", timestamp: NOW - 10 }

  it("exige aal2 com TOTP recente", () => {
    expect(evaluateAdminSession({ aal: "aal2", amr: [password, totp(60)] }, NOW)).toBe("ok")
    expect(evaluateAdminSession({ aal: "aal1", amr: [password] }, NOW)).toBe("needs_mfa")
    expect(evaluateAdminSession({ aal: "aal2", amr: [password] }, NOW)).toBe("needs_mfa")
    expect(evaluateAdminSession(null, NOW)).toBe("needs_mfa")
    expect(evaluateAdminSession({}, NOW)).toBe("needs_mfa")
  })

  it("pede o código de novo depois de 12 horas", () => {
    expect(evaluateAdminSession({ aal: "aal2", amr: [totp(ADMIN_MFA_MAX_AGE_SECONDS)] }, NOW)).toBe("ok")
    expect(evaluateAdminSession({ aal: "aal2", amr: [totp(ADMIN_MFA_MAX_AGE_SECONDS + 1)] }, NOW)).toBe("needs_mfa")
    expect(adminSessionSecondsLeft({ aal: "aal2", amr: [totp(3600)] }, NOW)).toBe(ADMIN_MFA_MAX_AGE_SECONDS - 3600)
    expect(adminSessionSecondsLeft({ aal: "aal1", amr: [totp(3600)] }, NOW)).toBe(0)
  })

  it("usa a verificação TOTP mais recente e aceita o formato antigo (lista de textos)", () => {
    expect(lastTotpVerification({ amr: [totp(50000), totp(10)] })).toBe(NOW - 10)
    expect(lastTotpVerification({ amr: "totp" })).toBeNull()
    expect(evaluateAdminSession({ aal: "aal2", amr: ["password", "totp"] }, NOW)).toBe("ok")
    expect(evaluateAdminSession({ aal: "aal2", amr: ["password"] }, NOW)).toBe("needs_mfa")
  })

  it("normaliza o código do app autenticador", () => {
    expect(normalizeTotpCode("123 456")).toBe("123456")
    expect(normalizeTotpCode("123-456")).toBe("123456")
    expect(normalizeTotpCode("12345")).toBeNull()
    expect(normalizeTotpCode("12345a")).toBeNull()
    expect(normalizeTotpCode(null)).toBeNull()
  })
})

describe("subdomínio do painel (ADMIN_HOST)", () => {
  const route = (host: string, pathname: string, adminHost = "admin.maanu.com.br") =>
    adminHostRouting({ host, pathname, adminHost })

  it("sem ADMIN_HOST tudo passa", () => {
    expect(adminHostRouting({ host: "app.maanu.com.br", pathname: "/admin", adminHost: "" })).toEqual({ kind: "pass" })
    expect(adminHostRouting({ host: "x", pathname: "/admin", adminHost: undefined })).toEqual({ kind: "pass" })
  })

  it("fora do endereço do painel, /admin não existe", () => {
    expect(route("maanu.com.br", "/admin")).toEqual({ kind: "not_found" })
    expect(route("maanu.com.br", "/admin/clientes")).toEqual({ kind: "not_found" })
    expect(route("maanu.com.br", "/administrativo")).toEqual({ kind: "pass" })
    expect(route("maanu.com.br", "/painel")).toEqual({ kind: "pass" })
  })

  it("no endereço do painel só abrem o painel e o login", () => {
    expect(route("admin.maanu.com.br", "/admin")).toEqual({ kind: "pass" })
    expect(route("ADMIN.maanu.com.br:443", "/admin/uso-ia")).toEqual({ kind: "pass" })
    expect(route("admin.maanu.com.br", "/login")).toEqual({ kind: "pass" })
    expect(route("admin.maanu.com.br", "/auth/confirm")).toEqual({ kind: "pass" })
    expect(route("admin.maanu.com.br", "/")).toEqual({ kind: "redirect", pathname: "/admin" })
    expect(route("admin.maanu.com.br", "/painel")).toEqual({ kind: "redirect", pathname: "/admin" })
    expect(route("admin.maanu.com.br", "/api/webhook/mercadolivre")).toEqual({ kind: "redirect", pathname: "/admin" })
  })

  it("monta os links entre o app e o painel", () => {
    expect(adminPanelHref("", "https://maanu.com.br")).toBe("/admin")
    expect(adminPanelHref("admin.maanu.com.br", "https://maanu.com.br")).toBe("https://admin.maanu.com.br/admin")
    expect(adminPanelHref("admin.localhost", "http://localhost:3000")).toBe("http://admin.localhost:3000/admin")
    expect(adminPanelHref("admin.maanu.com.br", undefined)).toBe("https://admin.maanu.com.br/admin")
    expect(appHomeHref(undefined, "https://maanu.com.br")).toBe("/painel")
    expect(appHomeHref("admin.maanu.com.br", "https://maanu.com.br/")).toBe("https://maanu.com.br/painel")
    expect(appHomeHref("admin.maanu.com.br", "não é url")).toBe("/painel")
  })

  it("normaliza o host", () => {
    expect(normalizeHost(" Admin.Maanu.com.br:3000 ")).toBe("admin.maanu.com.br")
    expect(normalizeHost("maanu.com.br.")).toBe("maanu.com.br")
    expect(isAdminPath("/admin")).toBe(true)
    expect(isAdminPath("/adminx")).toBe(false)
  })
})

describe("custo da IA", () => {
  it("lê o uso da OpenAI com cache e raciocínio", () => {
    const usage = normalizeUsage({
      prompt_tokens: 2000,
      completion_tokens: 300,
      total_tokens: 2300,
      prompt_tokens_details: { cached_tokens: 1024 },
      completion_tokens_details: { reasoning_tokens: 0 },
    })
    expect(usage).toEqual({ inputTokens: 2000, cachedInputTokens: 1024, outputTokens: 300, reasoningTokens: 0, totalTokens: 2300 })
    expect(normalizeUsage(undefined).totalTokens).toBe(0)
    expect(normalizeUsage({ prompt_tokens: 10, completion_tokens: 5 }).totalTokens).toBe(15)
    expect(normalizeUsage({ prompt_tokens: 10, prompt_tokens_details: { cached_tokens: 99 } }).cachedInputTokens).toBe(10)
  })

  it("calcula o custo do GPT-6 Luna com desconto do cache", () => {
    const usage = { inputTokens: 2000, cachedInputTokens: 1000, outputTokens: 200, reasoningTokens: 0, totalTokens: 2200 }
    // 1000 × 0,10 + 1000 × 0,01 + 200 × 0,50 = 210 → por milhão
    expect(estimateCostUsd("gpt-6-luna", usage)).toBeCloseTo(0.00021, 10)
    expect(estimateCostUsd("gpt-6-luna-2026-09-22", usage)).toBeCloseTo(0.00021, 10)
    expect(estimateCostUsd("modelo-desconhecido", usage)).toBeNull()
    expect(modelPrice("GPT-4o-mini")?.output).toBe(0.6)
  })
})

describe("CSV", () => {
  it("escapa separador, aspas e quebra de linha", () => {
    expect(csvCell('Loja "A"; filial')).toBe('"Loja ""A""; filial"')
    expect(csvCell("linha\nnova")).toBe('"linha\nnova"')
    expect(csvCell(12.5)).toBe("12,5")
    expect(csvCell(true)).toBe("sim")
    expect(csvCell(null)).toBe("")
  })

  it("neutraliza fórmulas (CSV injection)", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)")
    expect(csvCell("+5511")).toBe("'+5511")
    expect(csvCell("@soma")).toBe("'@soma")
    expect(csvCell(-3)).toBe("-3")
  })

  it("gera arquivo para o Excel em português", () => {
    const csv = toCsv(["a", "b"], [[1, "x"]])
    expect(csv.startsWith("\uFEFFa;b\r\n1;x")).toBe(true)
  })
})

describe("financeiro", () => {
  const finance: AdminFinance = {
    month_start: "2026-10-01T03:00:00Z",
    month_end: "2026-11-01T03:00:00Z",
    settings: { usd_brl_rate: 5, monthly_fixed_costs_brl: 100, updated_at: "2026-10-01T00:00:00Z" },
    mrr: 300,
    paying: 2,
    paying_without_price: 0,
    counts: {},
    ai_cost_month_usd: 10,
    ai_cost_prev_month_usd: 8,
    ai_cost_unassigned_month_usd: 0,
    rows: [
      { organization_id: "a", name: "A", status: "active", plan: "essencial", monthly_price: 100, ai_cost_month_usd: 5, ai_answers_month: 10, current_period_end: null },
      { organization_id: "b", name: "B", status: "active", plan: "essencial", monthly_price: 200, ai_cost_month_usd: 1, ai_answers_month: 3, current_period_end: null },
      { organization_id: "c", name: "C", status: "courtesy", plan: null, monthly_price: 50, ai_cost_month_usd: 2, ai_answers_month: 1, current_period_end: null },
    ],
    past_due: [],
    trials_ending: [],
  }

  it("projeta o custo do mês e calcula a margem", () => {
    const now = new Date("2026-10-16T15:00:00Z") // metade do mês
    const summary = summarizeFinance(finance, now)
    expect(summary.elapsed).toBeCloseTo(0.5, 2)
    expect(summary.aiCostMonthBrl).toBe(50)
    expect(summary.aiCostProjectedBrl).toBeCloseTo(100, 0)
    expect(summary.margin).toBeCloseTo(300 - 100 - 100, 0)
    expect(summary.arr).toBe(3600)
    expect(summary.arpa).toBe(150)
  })

  it("ordena por margem e marca prejuízo; cortesia não conta como receita", () => {
    const summary = summarizeFinance(finance, new Date("2026-10-16T15:00:00Z"))
    expect(summary.rows.map((row) => row.organization_id)).toEqual(["c", "a", "b"])
    const courtesy = summary.rows.find((row) => row.organization_id === "c")!
    expect(courtesy.revenue).toBe(0)
    expect(courtesy.costShare).toBeNull()
    expect(summary.rows.find((row) => row.organization_id === "a")!.margin).toBeCloseTo(50, 0)
    expect(summary.lossCount).toBe(0)
  })

  it("não explode no primeiro dia do mês", () => {
    expect(monthElapsedFraction(finance.month_start, finance.month_end, new Date("2026-10-01T03:00:01Z"))).toBeCloseTo(1 / 31, 3)
    expect(monthElapsedFraction(finance.month_start, finance.month_end, new Date("2026-12-01T00:00:00Z"))).toBe(1)
  })
})

describe("formulários do painel", () => {
  const form = (values: Record<string, string>) => {
    const data = new FormData()
    for (const [key, value] of Object.entries(values)) data.set(key, value)
    return data
  }

  it("lê valores em reais", () => {
    expect(parseDecimal("1.234,56")).toBe(1234.56)
    expect(parseDecimal("R$ 129,9")).toBe(129.9)
    expect(parseDecimal("129.90")).toBe(129.9)
    expect(parseDecimal("")).toBeNull()
    expect(Number.isNaN(parseDecimal("abc"))).toBe(true)
  })

  it("valida a edição da assinatura", () => {
    const ok = parseOrganizationForm(
      form({
        name: " Loja X ",
        plan: "essencial",
        subscription_status: "active",
        trial_ends_at: "2026-10-20",
        current_period_end: "",
        ml_accounts_limit: "3",
        monthly_price: "149,90",
        billing_exempt: "on",
      })
    )
    expect(ok.success).toBe(true)
    if (ok.success) {
      expect(ok.data).toMatchObject({ name: "Loja X", plan: "essencial", monthly_price: 149.9, billing_exempt: true, current_period_end: null })
      expect(ok.data.trial_ends_at).toBe("2026-10-21T02:59:59.000Z")
    }
    const bad = parseOrganizationForm(
      form({ name: "", plan: "ouro", subscription_status: "x", trial_ends_at: "", ml_accounts_limit: "-1", monthly_price: "abc" })
    )
    expect(bad.success).toBe(false)
    if (!bad.success) {
      expect(Object.keys(bad.fieldErrors).sort()).toEqual(
        ["ml_accounts_limit", "monthly_price", "name", "plan", "subscription_status", "trial_ends_at"].sort()
      )
    }
  })

  it("valida usuário e configurações", () => {
    const profile = parseProfileForm(form({ full_name: "Ana", whatsapp: "(11) 98765-4321", email: "ANA@EXEMPLO.COM" }))
    expect(profile).toEqual({ success: true, data: { full_name: "Ana", whatsapp: "11987654321", email: "ana@exemplo.com" } })
    expect(parseProfileForm(form({ full_name: "", whatsapp: "123", email: "x" })).success).toBe(false)

    expect(parseFinanceSettingsForm(form({ usd_brl_rate: "5,4321", monthly_fixed_costs_brl: "350" }))).toEqual({
      success: true,
      data: { usd_brl_rate: 5.4321, monthly_fixed_costs_brl: 350 },
    })
    expect(parseFinanceSettingsForm(form({ usd_brl_rate: "0,5", monthly_fixed_costs_brl: "-1" })).success).toBe(false)
  })

  it("estende o teste a partir de hoje ou do fim atual", () => {
    const now = new Date("2026-10-12T12:00:00Z")
    expect(extendTrialEnd("2026-10-01T00:00:00Z", 7, now)).toBe("2026-10-19T12:00:00.000Z")
    expect(extendTrialEnd("2026-10-15T00:00:00Z", 7, now)).toBe("2026-10-22T00:00:00.000Z")
    expect(endOfDayIso("2026-13-40")).toBeNull()
  })

  it("lê os filtros da lista de clientes com valores conhecidos", () => {
    expect(parseOrgListParams({ busca: " loja ", situacao: "trial", plano: "none", ordem: "ai_cost", pagina: "3" })).toEqual({
      search: "loja",
      status: "trial",
      plan: "none",
      sort: "ai_cost",
      page: 3,
    })
    expect(parseOrgListParams({ situacao: "hack", plano: "x", ordem: "drop", pagina: "-1" })).toEqual({
      search: "",
      status: "",
      plan: "",
      sort: "recent",
      page: 1,
    })
  })
})

describe("formatação do painel", () => {
  it("formata dólar, tokens e variações", () => {
    expect(formatUsd(0.00021)).toMatch(/0,0002/)
    expect(formatUsd(12.5)).toMatch(/12,50/)
    expect(formatTokens(850)).toBe("850")
    expect(formatTokens(12_345)).toBe("12,3 mil")
    expect(formatTokens(4_200_000)).toBe("4,2 mi")
    expect(formatShare(1, 3)).toBe("33%")
    expect(formatShare(1, 0)).toBe("—")
    expect(percentChange(150, 100)).toBe(50)
    expect(percentChange(5, 0)).toBeNull()
    expect(shortDay("2026-10-05")).toBe("05/10")
    expect(toDateInput("2026-10-21T02:59:59.000Z")).toBe("2026-10-20")
  })
})
