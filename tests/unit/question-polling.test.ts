import { beforeEach, describe, expect, it, vi } from "vitest"

import { pollingOffsets, unknownQuestions } from "@/lib/answers/polling"

describe("pollingOffsets (quando a rotina consulta o ML dentro de cada minuto)", () => {
  it("até 50 contas: a cada 10 s (6 rodadas no minuto)", () => {
    expect(pollingOffsets(1)).toEqual([0, 10_000, 20_000, 30_000, 40_000, 50_000])
    expect(pollingOffsets(50)).toEqual([0, 10_000, 20_000, 30_000, 40_000, 50_000])
  })

  it("com mais contas espaça as rodadas para não passar de ~300 consultas ao ML por minuto", () => {
    expect(pollingOffsets(60)).toEqual([0, 12_000, 24_000, 36_000, 48_000])
    expect(pollingOffsets(100)).toEqual([0, 20_000, 40_000])
    expect(pollingOffsets(400)).toEqual([0])
  })

  it("sem contas roda uma vez (só a fila)", () => {
    expect(pollingOffsets(0)).toEqual([0])
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
    clock: 0,
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

const clock = {
  now: () => mocks.state.clock,
  sleep: async (ms: number) => {
    mocks.state.clock += ms
  },
}

describe("runQuestionRounds (rotina de segurança do cron de perguntas)", () => {
  beforeEach(() => {
    mocks.state.accounts = []
    mocks.state.known = new Set()
    mocks.state.unanswered = new Map()
    mocks.state.failing = new Set()
    mocks.state.clock = 0
    mocks.searchUnansweredQuestions.mockClear()
    mocks.registerQuestion.mockClear()
    mocks.processQuestion.mockReset()
    mocks.processQuestion.mockImplementation(async () => undefined)
    mocks.processDueQuestions.mockClear()
  })

  it("registra só a pergunta nova, já manda para a IA e consulta a cada 10 s durante o minuto", async () => {
    mocks.state.accounts = [{ id: "conta-1", organization_id: "org-1", organizations: IN_TRIAL }]
    mocks.state.known = new Set([10])
    mocks.state.unanswered.set("conta-1", [question(10), question(11)])

    const result = await runQuestionRounds(clock)

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
    expect(mocks.searchUnansweredQuestions).toHaveBeenCalledTimes(6)
    expect(mocks.processDueQuestions).toHaveBeenCalledTimes(6)
    expect(result).toMatchObject({ accounts: 1, rounds: 6, found: 1, failures: 0 })
  })

  it("não consulta contas de organização bloqueada (teste vencido sem assinatura)", async () => {
    mocks.state.accounts = [
      { id: "conta-ok", organization_id: "org-1", organizations: IN_TRIAL },
      { id: "conta-vencida", organization_id: "org-2", organizations: EXPIRED },
    ]
    await runQuestionRounds(clock)
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

    const result = await runQuestionRounds(clock)

    expect(mocks.processQuestion).toHaveBeenCalledWith("row-20")
    expect(result.failures).toBe(6)
    errors.mockRestore()
  })

  it("se o processamento atrasar a rotina, não começa rodada fora da janela (o próximo minuto continua)", async () => {
    mocks.state.accounts = [{ id: "conta-1", organization_id: "org-1", organizations: IN_TRIAL }]
    mocks.state.unanswered.set("conta-1", [question(30)])
    mocks.processQuestion.mockImplementation(async () => {
      mocks.state.clock += 58_000
    })

    const result = await runQuestionRounds(clock)

    expect(result.rounds).toBe(1)
    expect(mocks.searchUnansweredQuestions).toHaveBeenCalledTimes(1)
  })

  it("um erro ao processar uma pergunta não derruba a rotina", async () => {
    mocks.state.accounts = [{ id: "conta-1", organization_id: "org-1", organizations: IN_TRIAL }]
    mocks.state.unanswered.set("conta-1", [question(40), question(41)])
    mocks.processQuestion.mockImplementationOnce(async () => {
      throw new Error("falha no banco")
    })
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined)

    const result = await runQuestionRounds(clock)

    expect(mocks.processQuestion).toHaveBeenCalledWith("row-40")
    expect(mocks.processQuestion).toHaveBeenCalledWith("row-41")
    expect(result.rounds).toBe(6)
    errors.mockRestore()
  })
})
