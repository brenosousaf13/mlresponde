import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  profile: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: mocks.getClaims },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) }),
    rpc: mocks.rpc,
  }),
}))
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`redirect:${path}`) },
  notFound: () => { throw new Error("not_found") },
}))

const { getAdminIdentity, requireAdmin, getAdminOverview, adminActionIdentity } = await import("@/lib/dal/admin")
const { GET: exportClients } = await import("@/app/admin/(painel)/clientes/exportar/route")

describe("acesso às páginas do administrador", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1", email: "cliente@example.com", aal: "aal1" } } })
    mocks.profile.mockResolvedValue({ data: { full_name: "Cliente", is_platform_admin: false } })
  })

  it("leva o cliente à mensagem de acesso negado antes de ler dados do painel", async () => {
    await expect(getAdminOverview()).rejects.toThrow("redirect:/acesso-negado")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("também nega o acesso quando não há perfil de administrador", async () => {
    mocks.profile.mockResolvedValue({ data: null })
    await expect(getAdminIdentity()).rejects.toThrow("redirect:/acesso-negado")
  })

  it("continua pedindo login quando não há sessão", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: null } })
    await expect(getAdminIdentity()).rejects.toThrow("redirect:/login?next=/admin")
  })

  it("continua exigindo a segunda etapa para o administrador", async () => {
    mocks.profile.mockResolvedValue({ data: { full_name: "Admin", is_platform_admin: true } })
    await expect(requireAdmin()).rejects.toThrow("redirect:/admin/verificacao")
  })

  it("libera o administrador com a segunda etapa recente", async () => {
    mocks.profile.mockResolvedValue({ data: { full_name: "Admin", is_platform_admin: true } })
    mocks.getClaims.mockResolvedValue({ data: { claims: {
      sub: "admin-1", aal: "aal2", amr: [{ method: "totp", timestamp: Math.floor(Date.now() / 1000) }],
    } } })
    await expect(requireAdmin()).resolves.toMatchObject({ userId: "admin-1", name: "Admin" })
  })

  it("continua recusando ações do cliente", async () => {
    await expect(adminActionIdentity()).resolves.toBeNull()
  })

  it("mostra o aviso de acesso negado ao cliente que abre o link de exportação", async () => {
    await expect(exportClients(new Request("https://maanu.com.br/admin/clientes/exportar")))
      .rejects.toThrow("redirect:/acesso-negado")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
