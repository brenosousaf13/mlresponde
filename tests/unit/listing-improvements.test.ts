import { describe, expect, it } from "vitest"

import { decideSectionAccess } from "@/lib/access/access"
import {
  hasPlaceholder,
  normalizeDoneIndexes,
  normalizeImprovementResult,
  readImprovementResult,
  serializeImprovementResult,
  toggleDoneIndex,
} from "@/lib/listing-improvements/parse"
import { improvementEffect, improvementsHref } from "@/lib/listing-improvements/presentation"
import {
  buildImprovementMessages,
  buildImprovementSystemPrompt,
  formatQuestionsForPrompt,
  IMPROVEMENT_RESULT_SCHEMA,
  MAX_ANALYZED_QUESTIONS,
} from "@/lib/listing-improvements/prompt"

const suggestion = (overrides: Record<string, unknown> = {}) => ({
  area: "descricao",
  priority: "media",
  title: "Informe as medidas na descrição",
  problem: "8 compradores perguntaram as medidas.",
  action: "Coloque altura, largura e profundidade no começo da descrição.",
  ready_text: "Medidas:\n  Altura: 40 cm  \n\n\n\nLargura: 30 cm",
  needs_seller_info: false,
  question_count: 8,
  example_questions: ["Qual a altura?", "Qual a largura?"],
  ...overrides,
})

describe("melhorias de anúncio — prompt", () => {
  it("regras principais no prompt do sistema", () => {
    const system = buildImprovementSystemPrompt("Loja Teste")
    expect(system).toContain('"Loja Teste"')
    expect(system).toContain("Regra 0")
    expect(system).toContain("60 caracteres")
    expect(system).toContain("catálogo")
    expect(system).toContain("[informe")
  })

  it("perguntas numeradas, com data e a resposta do vendedor", () => {
    const text = formatQuestionsForPrompt([
      { text: "  Serve   em 220v? ", answer: "Sim, é bivolt.", askedAt: "2026-10-10T15:00:00Z" },
      { text: "Tem azul?", answer: null, askedAt: null },
    ])
    expect(text).toBe("1. [10/10] P: Serve em 220v?\n   Resposta do vendedor: Sim, é bivolt.\n2. P: Tem azul?")
  })

  it("mensagem com o anúncio, se é de catálogo e no máximo 120 perguntas", () => {
    const questions = Array.from({ length: 150 }, (_, index) => ({ text: `Pergunta ${index}`, answer: null, askedAt: null }))
    const [system, user] = buildImprovementMessages({
      storeName: "Loja",
      itemSummary: "Título: Mesa",
      isCatalog: true,
      periodDays: 90,
      questions,
    })
    expect(system.role).toBe("system")
    expect(user.content).toContain("<ANUNCIO>\nTítulo: Mesa\n</ANUNCIO>")
    expect(user.content).toContain("Anúncio de catálogo: sim")
    expect(user.content).toContain(`total="${MAX_ANALYZED_QUESTIONS}"`)
    expect(user.content).toContain("120. P: Pergunta 119")
    expect(user.content).not.toContain("Pergunta 120")
  })

  it("esquema estrito: todos os campos obrigatórios", () => {
    const item = IMPROVEMENT_RESULT_SCHEMA.properties.suggestions.items
    expect([...item.required].sort()).toEqual(Object.keys(item.properties).sort())
    expect(item.additionalProperties).toBe(false)
  })
})

describe("melhorias de anúncio — resultado da IA", () => {
  it("arruma textos, ordena por prioridade e por perguntas evitadas", () => {
    const result = normalizeImprovementResult(
      {
        summary: "  Perguntam   muito as medidas. ",
        suggestions: [
          suggestion({ priority: "baixa", title: "Mostre a etiqueta", area: "fotos", ready_text: "não deveria ficar", question_count: 2 }),
          suggestion(),
          suggestion({ priority: "alta", title: "Diga a voltagem no título", area: "titulo", ready_text: "Ventilador de Mesa Arno 40 cm Bivolt Silencioso Turbo Potente Branco", question_count: 999 }),
        ],
      },
      20
    )
    expect(result.summary).toBe("Perguntam muito as medidas.")
    expect(result.suggestions.map((item) => item.title)).toEqual([
      "Diga a voltagem no título",
      "Informe as medidas na descrição",
      "Mostre a etiqueta",
    ])
    const [title, description, photos] = result.suggestions
    expect(title.questionCount).toBe(20)
    expect(title.readyText.length).toBeLessThanOrEqual(60)
    expect(description.readyText).toBe("Medidas:\nAltura: 40 cm\n\nLargura: 30 cm")
    expect(photos.readyText).toBe("")
  })

  it("descarta vazias, repetidas e valores inválidos; no máximo 6", () => {
    const result = normalizeImprovementResult(
      {
        summary: 42,
        suggestions: [
          suggestion({ area: "inventada", priority: "urgente" }),
          suggestion({ title: "Informe as medidas na descrição" }),
          suggestion({ title: "  " }),
          suggestion({ title: "Sem ação", action: "" }),
          "lixo",
          ...Array.from({ length: 8 }, (_, index) => suggestion({ title: `Sugestão ${index}` })),
        ],
      },
      10
    )
    expect(result.summary).toBe("")
    expect(result.suggestions).toHaveLength(6)
    expect(result.suggestions[0]).toMatchObject({ area: "outro", priority: "media" })
  })

  it("texto com [colchetes] precisa de informação do vendedor", () => {
    expect(hasPlaceholder("Voltagem: [informe 110 V ou 220 V]")).toBe(true)
    expect(hasPlaceholder("Sem lacunas")).toBe(false)
    const [item] = normalizeImprovementResult({ summary: "", suggestions: [suggestion({ ready_text: "Peso: [informe o peso]" })] }, 5).suggestions
    expect(item.needsSellerInfo).toBe(true)
  })

  it("grava e lê de volta sem mudar a ordem", () => {
    const result = normalizeImprovementResult({ summary: "ok", suggestions: [suggestion(), suggestion({ title: "Outra" })] }, 10)
    const read = readImprovementResult(JSON.parse(JSON.stringify(serializeImprovementResult(result))))
    expect(read).toEqual(result)
    expect(readImprovementResult(null)).toEqual({ summary: "", suggestions: [] })
  })

  it("marcar sugestões como feitas", () => {
    expect(normalizeDoneIndexes([3, 1, 1, -1, 9, 2.5], 4)).toEqual([1, 3])
    expect(toggleDoneIndex([1], 0, true, 3)).toEqual([0, 1])
    expect(toggleDoneIndex([0, 1], 0, false, 3)).toEqual([1])
    expect(toggleDoneIndex([], 5, true, 3)).toEqual([])
  })
})

describe("melhorias de anúncio — tela", () => {
  it("efeito: espera 7 dias e compara perguntas por semana", () => {
    const now = new Date("2026-10-20T12:00:00Z")
    expect(improvementEffect({ analyzedAt: "2026-10-17T12:00:00Z", before: 30, after: 1 }, now)).toEqual({
      ready: false,
      daysLeft: 4,
      beforePerWeek: 7,
    })
    expect(improvementEffect({ analyzedAt: "2026-10-06T12:00:00Z", before: 30, after: 6 }, now)).toEqual({
      ready: true,
      beforePerWeek: 7,
      afterPerWeek: 3,
      changePercent: -57,
      days: 14,
    })
    expect(improvementEffect({ analyzedAt: "2026-10-06T12:00:00Z", before: 0, after: 2 }, now)).toMatchObject({ changePercent: null })
  })

  it("endereço com a conta", () => {
    expect(improvementsHref(null)).toBe("/melhorias")
    expect(improvementsHref("abc")).toBe("/melhorias?conta=abc")
  })

  it("seção exclusiva a partir do Pro", () => {
    const base = { access: "active" as const, hasActiveMlAccount: true }
    expect(decideSectionAccess("melhorias", { ...base, features: { melhorias_anuncio: false } })).toEqual({
      allowed: false,
      redirectTo: "/assinatura?recurso=melhorias_anuncio",
      reason: "plan",
    })
    expect(decideSectionAccess("melhorias", { ...base, features: { melhorias_anuncio: true } }).allowed).toBe(true)
  })
})
