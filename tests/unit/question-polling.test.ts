import { beforeEach, describe, expect, it, vi } from "vitest"

import { accountsThisMinute, unknownQuestions } from "@/lib/answers/polling"

describe("accountsThisMinute", () => {
  const accounts = Array.from({ length: 250 }, (_, index) => index)

  it("até 100 contas: todas, todo minuto", () => {
    expect(accountsThisMinute(accounts.slice(0, 100), 7)).toHaveLength(100)
  })

  it("acima de 100: rodízio de 100 por minuto, sem repetir e cobrindo todas", () => {
    const minute0 = accountsThisMinute(accounts, 0)
    const minute1 = accountsThisMinute(accounts, 1)
    const minute2 = accountsThisMinute(accounts, 2)
    expect(minute0).toEqual(accounts.slice(0, 100))
    expect(minute1).toEqual(accounts.slice(100, 200))
    expect(minute2).toEqual([...accounts.slice(200, 250), ...accounts.slice(0, 50)])
    expect(new Set([...minute0, ...minute1, ...minute2]).size).toBe(250)
  })
})

describe("unknownQuestions", () => {
  it("devolve só as perguntas que a maanu ainda não tem, sem repetir", () => {
    const questions = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 2 }]
    expect(unknownQuestions(questions, [2])).toEqual([{ id: 1 }, { id: 3 }])
    expect(unknownQuestions(questions, new Set([1, 2, 3]))).toEqual([])
  })
})

// ------------------------------------------------------------------ rotina com banco, ML e motor simulados

type Account = {
  id: string
  organization_id: string
  organizations: { trial_ends_at: string; subscription_status: string; billing_exempt: boolean; current_period_end: string | null }
}

const mocks = vi.hoisted(() => {
  const state = {
    accounts: [] as Account[],
    known: new Set<number>(),
    unanswered: new Map<string, { id: number; text: string; item_id: string; date_created: string }[]>(),
    failing: new Set<string>(),
  }
  type Builder = Record<string, unknown> & PromiseLike<unknown>
  function builder(table: string): Builder {
    let ids: number[] = []
    const result = () =>
      table === "ml_accounts"
        ? { data: state.accounts, error: null }
        : { data: ids.filter((id) => state.known.has(id)).map((id) => ({ ml_question_id: id })), error: null }
    const query: Builder = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: () => query,
      in: (_column: string, values: number[]) => {
        ids = values
        return query
      },
      then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject),
    }
    return query
  }
  return {
    state,
    supabase: { from: (table: string) => builder(table) },
    searchUnansweredQuestions: vi.fn(async (accountId: string) => {
      if (state.failing.has(accountId)) throw new Error("Mercado Livre: HTTP 500")
      const questions = state.unanswered.get(accountId) ?? []
      return { questions, total: questions.length }
    }),
    registerQuestion: vi.fn(async (params: { mlQuestionId: number }) => {
      state.known.add(params.mlQuestionId)
      return { id: `row-${params.mlQuestionId}`, isNew: true, status: "pending" }
    }),
    processQuestion: vi.fn<(questionId: string) => Promise<void>>(async () => undefined),
    processDueQuestions: vi.fn<(limit?: number) => Promise<number>>(async () => 0),
  }
})

vi.mock("@/lib/supabase/admin", () => ({ createServiceClient: () => mocks.supabase }))
vi.mock("@/lib/mercadolivre/questions", () => ({ searchUnansweredQuestions: mocks.searchUnansweredQuestions }))
vi.mock("@/lib/answers/ingest", () => ({ registerQuestion: mocks.registerQuestion }))
vi.mock("@/lib/answers/engine", () => ({
  processQuestion: mocks.processQuestion,
  processDueQuestions: mocks.processDueQuestions,
}))

const { runQuestionRounds } = await import("@/lib/answers/poll")

const IN_TRIAL = { trial_ends_at: "2999-01-01T00:00:00Z", subscription_status: "trialing", billing_exempt: false, current_period_end: null }
const EXPIRED = { trial_ends_at: "2000-01-01T00:00:00Z", subscription_status: "trialing", billing_exempt: false, current_period_end: null }
const question = (id: number) => ({ id, text: `pergunta ${id}`, item_id: "MLB1", date_created: "2026-10-13T23:18:32.892Z" })

describe("runQuestionRounds (rotina de segurança do cron de perguntas)", () => {
  beforeEach(() => {
    mocks.state.accounts = []
    mocks.state.known = new Set()
    mocks.state.unanswered = new Map()
    mocks.state.failing = new Set()
    mocks.searchUnansweredQuestions.mockClear()
    mocks.registerQuestion.mockClear()
    mocks.processQuestion.mockReset()
    mocks.processQuestion.mockImplementation(async () => undefined)
    mocks.processDueQuestions.mockClear()
  })

  it("registra só a pergunta nova, já manda para a IA e consulta o ML uma vez só por execução", async () => {
    mocks.state.accounts = [{ id: "conta-1", organization_id: "org-1", organizations: IN_TRIAL }]
    mocks.state.known = new Set([10])
    mocks.state.unanswered.set("conta-1", [question(10), question(11)])

    const result = await runQuestionRounds()

    expect(mocks.registerQuestion).toHaveBeenCalledTimes(1)
    expect(mocks.registerQuestion).toHaveBeenCalledWith({
      organizationId: "org-1",
      mlAccountId: "conta-1",
      mlQuestionId: 11,
      questionText: "pergunta 11",
      itemId: "MLB1",
      createdAt: "2026-10-13T23:18:32.892Z",
    })
    expect(mocks.processQuestion).toHaveBeenCalledTimes(1)
    expect(mocks.processQuestion).toHaveBeenCalledWith("row-11")
    expect(mocks.searchUnansweredQuestions).toHaveBeenCalledTimes(1)
    expect(mocks.processDueQuestions).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ accounts: 1, found: 1, processed: 1, failures: 0 })
  })

  it("não consulta contas de organização bloqueada (teste vencido sem assinatura)", async () => {
    mocks.state.accounts = [
      { id: "conta-ok", organization_id: "org-1", organizations: IN_TRIAL },
      { id: "conta-vencida", organization_id: "org-2", organizations: EXPIRED },
    ]
    await runQuestionRounds()
    const polled = new Set(mocks.searchUnansweredQuestions.mock.calls.map(([accountId]) => accountId))
    expect([...polled]).toEqual(["conta-ok"])
  })

  it("uma conta com erro no ML não impede as outras", async () => {
    mocks.state.accounts = [
      { id: "conta-erro", organization_id: "org-1", organizations: IN_TRIAL },
      { id: "conta-2", organization_id: "org-2", organizations: IN_TRIAL },
    ]
    mocks.state.failing.add("conta-erro")
    mocks.state.unanswered.set("conta-2", [question(20)])
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined)

    const result = await runQuestionRounds()

    expect(mocks.processQuestion).toHaveBeenCalledWith("row-20")
    expect(result.failures).toBe(1)
    errors.mockRestore()
  })

  it("um erro ao processar uma pergunta não derruba a rotina", async () => {
    mocks.state.accounts = [{ id: "conta-1", organization_id: "org-1", organizations: IN_TRIAL }]
    mocks.state.unanswered.set("conta-1", [question(40), question(41)])
    mocks.processQuestion.mockImplementationOnce(async () => {
      throw new Error("falha no banco")
    })
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined)

    const result = await runQuestionRounds()

    expect(mocks.processQuestion).toHaveBeenCalledWith("row-40")
    expect(mocks.processQuestion).toHaveBeenCalledWith("row-41")
    expect(result.found).toBe(2)
    expect(mocks.processDueQuestions).toHaveBeenCalledTimes(1)
    errors.mockRestore()
  })
})
