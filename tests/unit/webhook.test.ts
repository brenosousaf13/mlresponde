import { beforeEach, describe, expect, it, vi } from "vitest"

// O ML exige HTTP 200 em até 500 ms; se demorar, ele pode desligar os tópicos do app ("fall back").
// Por isso o webhook responde na hora e só depois (after) fala com o banco, o ML e a IA.

const mocks = vi.hoisted(() => {
  const pending: (() => unknown)[] = []
  const account = { id: "conta-1", organization_id: "org-1", status: "active", organizations: { plan: "pro", subscription_status: "trialing", trial_ends_at: "2999-01-01T00:00:00Z" } }
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: vi.fn(async (): Promise<{ data: typeof account | null; error: null }> => ({ data: account, error: null })),
  }
  return {
    pending,
    account,
    query,
    after: vi.fn((task: () => unknown) => {
      pending.push(task)
    }),
    createServiceClient: vi.fn(() => ({ from: () => query })),
    registerQuestion: vi.fn(async () => ({ id: "row-1", isNew: true, status: "pending" })),
    processQuestion: vi.fn(async () => undefined),
    reconcileQuestion: vi.fn(async () => undefined),
    processDueQuestions: vi.fn(async () => 0),
    handleMessageNotification: vi.fn(async () => undefined),
    processDueConversations: vi.fn(async () => 0),
  }
})

vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: mocks.after }))
vi.mock("@/lib/supabase/admin", () => ({ createServiceClient: mocks.createServiceClient }))
vi.mock("@/lib/answers/ingest", () => ({ registerQuestion: mocks.registerQuestion }))
vi.mock("@/lib/answers/engine", () => ({
  processQuestion: mocks.processQuestion,
  reconcileQuestion: mocks.reconcileQuestion,
  processDueQuestions: mocks.processDueQuestions,
}))
vi.mock("@/lib/after-sale/engine", () => ({
  handleMessageNotification: mocks.handleMessageNotification,
  processDueConversations: mocks.processDueConversations,
}))

process.env.ML_CLIENT_ID = "8693830632560554"
const { POST } = await import("@/app/api/webhook/mercadolivre/route")

function notification(body: Record<string, unknown>) {
  return new Request("https://maanu.com.br/api/webhook/mercadolivre", { method: "POST", body: JSON.stringify(body) })
}

async function runAfterTasks() {
  while (mocks.pending.length) await mocks.pending.shift()!()
}

describe("webhook do Mercado Livre", () => {
  beforeEach(() => {
    mocks.pending.length = 0
    vi.clearAllMocks()
    vi.spyOn(console, "info").mockImplementation(() => undefined)
  })

  it("pergunta: responde 200 sem tocar no banco e registra + processa depois", async () => {
    const response = await POST(
      notification({ topic: "questions", resource: "/questions/13674369674", user_id: 254752194, application_id: 8693830632560554, attempts: 1 })
    )
    expect(response.status).toBe(200)
    expect(mocks.createServiceClient).not.toHaveBeenCalled()
    expect(mocks.after).toHaveBeenCalledTimes(1)

    await runAfterTasks()
    expect(mocks.registerQuestion).toHaveBeenCalledWith({ organizationId: "org-1", mlAccountId: "conta-1", mlQuestionId: 13674369674 })
    expect(mocks.processQuestion).toHaveBeenCalledWith("row-1")
    expect(mocks.processDueQuestions).toHaveBeenCalled()
  })

  it("mensagem pós-venda: também responde antes de consultar a conta", async () => {
    const response = await POST(
      notification({ topic: "messages", resource: "abc123def456", user_id: 254752194, application_id: 8693830632560554, actions: ["created"] })
    )
    expect(response.status).toBe(200)
    expect(mocks.createServiceClient).not.toHaveBeenCalled()

    await runAfterTasks()
    expect(mocks.handleMessageNotification).toHaveBeenCalledWith(mocks.account, "abc123def456")
  })

  it("notificação de outro app ou tópico ignorado: 200 e nada agendado", async () => {
    const response = await POST(notification({ topic: "items", resource: "/items/MLB1", user_id: 1, application_id: 8693830632560554 }))
    expect(response.status).toBe(200)
    expect(mocks.after).not.toHaveBeenCalled()
  })

  it("conta que não está na maanu: nada é registrado", async () => {
    mocks.query.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    await POST(notification({ topic: "questions", resource: "/questions/1", user_id: 99, application_id: 8693830632560554 }))
    await runAfterTasks()
    expect(mocks.registerQuestion).not.toHaveBeenCalled()
  })
})
