import { beforeEach, describe, expect, it, vi } from "vitest"

import { MlApiError } from "@/lib/mercadolivre/api"
import { supabaseFixture } from "./helpers/supabase-fixture"

const mocks = vi.hoisted(() => ({ service: vi.fn(), question: vi.fn(), post: vi.fn() }))
vi.mock("@/lib/supabase/admin", () => ({ createServiceClient: mocks.service }))
vi.mock("@/lib/mercadolivre/questions", async (original) => ({
  ...await original<typeof import("@/lib/mercadolivre/questions")>(),
  fetchQuestion: mocks.question, postAnswer: mocks.post,
}))

const engine = await import("@/lib/answers/engine")
beforeEach(() => {
  vi.clearAllMocks()
  mocks.question.mockResolvedValue({
    id: 777, item_id: "MLB123", text: "Pergunta", status: "ANSWERED", date_created: "2026-11-01T00:00:00Z",
    answer: { text: "Resposta anterior", date_created: "2026-11-03T00:00:00Z" },
  })
  mocks.post.mockRejectedValue(new MlApiError("Já respondida", 400))
})

describe("consultas pontuais de respostas", () => {
  it.each(["conferir", "sugerir", "enviar"] as const)("%s: preserva fonte e data da resposta ao conferir fechamento no ML", async (action) => {
    const db = supabaseFixture({
      ml_questions: [{
        id: "pergunta", status: "needs_review", organization_id: "org", ml_account_id: "conta", ml_question_id: 777,
        question_text: "Pergunta", answer_text: "Resposta anterior", answer_source: "manual", answered_at: "2026-11-02T00:00:00Z",
      }],
      ml_accounts: [{ id: "conta" }],
    })
    mocks.service.mockReturnValue(db.client)
    if (action === "conferir") await engine.reconcileQuestion("pergunta")
    if (action === "sugerir") await expect(engine.suggestAnswer("pergunta")).rejects.toBeInstanceOf(engine.QuestionClosedError)
    if (action === "enviar") await expect(engine.sendManualAnswer("pergunta", "Resposta", "usuario")).rejects.toBeInstanceOf(engine.QuestionClosedError)
    expect(db.requests.find((r) => r.method === "PATCH")?.body).toMatchObject({
      status: "answered", answer_text: "Resposta anterior", answer_source: "manual", answered_at: "2026-11-02T00:00:00Z",
    })
    const columns = db.requests.find((r) => r.url.pathname.endsWith("/ml_questions") && r.method === "GET")!.url.searchParams.get("select")!
    expect(columns).not.toContain("*")
    expect(columns.split(",")).toEqual(expect.arrayContaining(["id", "ml_account_id", "ml_question_id", "answer_text", "answer_source", "answered_at"]))
  })
})
