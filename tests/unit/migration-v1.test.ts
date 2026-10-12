import { describe, expect, it } from "vitest"

import { isValidCnpj } from "@/lib/billing/documents"
import {
  V1_ANSWERED_OUTSIDE,
  countByStatus,
  fictitiousCnpj,
  itemTitlesFromJobs,
  mapQuestionJob,
  mapTrainingExamples,
  type V1QuestionJob,
} from "@/lib/migration/v1"

const TARGET = { organizationId: "org-1", mlAccountId: "acc-1" }

function job(overrides: Partial<V1QuestionJob> = {}): V1QuestionJob {
  return {
    question_id: "13600000001",
    item_id: "MLB1000000001",
    seller_id: "1000000001",
    question_text: "Tem bolso atrás?",
    status: "done",
    ai_response: "Olá! Esse modelo não possui bolsos traseiros.",
    error_message: null,
    item_title: "Calça Cargo Jogger",
    item_url: "https://produto.mercadolivre.com.br/MLB-1000000001",
    created_at: "2026-07-24T13:00:00+00:00",
    updated_at: "2026-07-24T13:00:09+00:00",
    ...overrides,
  }
}

describe("mapQuestionJob", () => {
  it("resposta da IA vira respondida pela IA, com a data da v1", () => {
    const row = mapQuestionJob(job(), TARGET)
    expect(row).toMatchObject({
      organization_id: "org-1",
      ml_account_id: "acc-1",
      ml_question_id: 13600000001,
      status: "answered",
      answer_source: "ai",
      answer_text: "Olá! Esse modelo não possui bolsos traseiros.",
      ai_model: "gpt-4o-mini",
      question_created_at: "2026-07-24T13:00:00+00:00",
      answered_at: "2026-07-24T13:00:09+00:00",
      item_permalink: "https://produto.mercadolivre.com.br/MLB-1000000001",
      review_reason: null,
      last_error: null,
    })
  })

  it("texto padrão de 'não tenho a informação' da loja vira mensagem padrão", () => {
    const answer = "Olá! Para não passar uma informação incorreta, essa característica não está detalhada aqui."
    const options = { fallbackMarkers: ["para NÃO passar uma informação incorreta", " "] }
    expect(mapQuestionJob(job({ ai_response: answer }), TARGET, options)).toMatchObject({
      status: "answered",
      answer_source: "ai",
      fallback_reason: "ai_escalated",
    })
    expect(mapQuestionJob(job(), TARGET, options).fallback_reason).toBeNull()
    expect(mapQuestionJob(job({ ai_response: answer }), TARGET).fallback_reason).toBeNull()
  })

  it("aviso de resposta manual vira respondida fora, sem inventar o texto", () => {
    const row = mapQuestionJob(job({ ai_response: V1_ANSWERED_OUTSIDE }), TARGET)
    expect(row.status).toBe("answered_outside")
    expect(row.answer_source).toBe("external")
    expect(row.answer_text).toBeNull()
    expect(row.answered_at).toBeNull()
  })

  it("erro 'is not unanswered' do ML também é respondida fora", () => {
    const row = mapQuestionJob(
      job({ status: "error", ai_response: null, error_message: "Erro ML: Question 1 is not unanswered" }),
      TARGET
    )
    expect(row.status).toBe("answered_outside")
    expect(row.last_error).toBeNull()
  })

  it("erro e processamento travado ficam para o vendedor, com o motivo da v1, fora da fila", () => {
    const failed = mapQuestionJob(job({ status: "error", ai_response: null, error_message: "No ML credentials found" }), TARGET)
    expect(failed).toMatchObject({ status: "needs_review", review_reason: "processing_error", attempts: 5 })
    expect(failed.last_error).toBe("Importada da v1: No ML credentials found")

    const stuck = mapQuestionJob(job({ status: "processing", ai_response: null }), TARGET)
    expect(stuck.status).toBe("needs_review")
    expect(stuck.last_error).toContain("não terminou de processar")
  })

  it("rota antiga com o robô pausado vira 'respostas pausadas'", () => {
    const row = mapQuestionJob(job({ status: "manual", ai_response: null }), TARGET)
    expect(row).toMatchObject({ status: "needs_review", review_reason: "auto_reply_off", attempts: 0 })
  })

  it("pergunta que a v1 nunca leu é arquivada sem texto provisório nem anúncio falso", () => {
    const row = mapQuestionJob(
      job({
        item_id: "buscando_item",
        question_text: "Buscando do Mercado Livre...",
        status: "error",
        ai_response: null,
        item_title: null,
        item_url: null,
        error_message: "Processamento interrompido por Timeout da Vercel.",
      }),
      TARGET
    )
    expect(row).toMatchObject({ status: "ignored", item_id: null, question_text: "", review_reason: null })
    expect(row.last_error).toContain("não chegou a ler")
  })

  it("recusa código de pergunta que não é número", () => {
    expect(() => mapQuestionJob(job({ question_id: "abc" }), TARGET)).toThrow()
  })

  it("conta por status", () => {
    const rows = [
      mapQuestionJob(job(), TARGET),
      mapQuestionJob(job({ question_id: "2", ai_response: V1_ANSWERED_OUTSIDE }), TARGET),
      mapQuestionJob(job({ question_id: "3", status: "processing", ai_response: null }), TARGET),
    ]
    expect(countByStatus(rows)).toEqual({ answered: 1, answered_outside: 1, needs_review: 1, ignored: 0 })
  })
})

describe("mapTrainingExamples", () => {
  const titles = itemTitlesFromJobs([
    job({ item_title: "Título antigo", created_at: "2026-05-01T00:00:00Z" }),
    job({ item_title: "Calça Cargo Jogger Loja Exemplo", created_at: "2026-09-01T00:00:00Z" }),
    job({ item_id: "buscando_item", item_title: null }),
  ])

  it("usa o título mais recente do anúncio", () => {
    expect(titles.get("MLB1000000001")).toBe("Calça Cargo Jogger Loja Exemplo")
    expect(titles.size).toBe(1)
  })

  it("vira resposta ensinada do anúncio, sem repetidos nem textos inválidos", () => {
    const base = { question_id: "1", item_id: "MLB1000000001", created_at: "2026-05-14T14:38:49Z" }
    const { rows, skipped } = mapTrainingExamples(
      [
        { ...base, question_text: " Tem bolso atrás? ", answer_text: "Não possui." },
        { ...base, question_id: "2", question_text: "tem bolso atrás?", answer_text: "não possui." },
        { ...base, question_id: "3", question_text: "", answer_text: "Resposta" },
        { ...base, question_id: "4", question_text: "Pergunta", answer_text: "x".repeat(2001) },
        { ...base, question_id: "5", item_id: "invalido", question_text: "Tem garantia?", answer_text: "90 dias." },
      ],
      TARGET,
      titles
    )
    expect(skipped).toBe(3)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      item_id: "MLB1000000001",
      item_title: "Calça Cargo Jogger Loja Exemplo",
      question_text: "Tem bolso atrás?",
      created_at: "2026-05-14T14:38:49Z",
    })
    expect(rows[1]).toMatchObject({ item_id: null, item_title: null })
  })
})

describe("fictitiousCnpj", () => {
  it("gera CNPJ válido e sempre o mesmo para a mesma semente", () => {
    const a = fictitiousCnpj("loja exemplo")
    expect(isValidCnpj(a)).toBe(true)
    expect(fictitiousCnpj("loja exemplo")).toBe(a)
    expect(fictitiousCnpj("outra loja")).not.toBe(a)
    for (const seed of ["a", "b", "c", "d", "e"]) expect(isValidCnpj(fictitiousCnpj(seed))).toBe(true)
  })
})



