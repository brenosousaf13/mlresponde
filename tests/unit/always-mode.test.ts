import { describe, expect, it } from "vitest"

import { ML_ANSWER_LIMIT, parseItemId } from "@/lib/answers/compose"
import {
  DEFAULT_FALLBACK_ANSWER,
  composeFallback,
  decideAnswer,
  fallbackBody,
  parseAnswerMode,
} from "@/lib/answers/decision"
import { buildSystemPrompt } from "@/lib/answers/prompt"
import { inboxHref, questionSummary, questionTone, type InboxState } from "@/lib/questions/presentation"

const careful = { threshold: 0.75, greeting: "Olá!", signature: "Equipe X" }
const always = { ...careful, mode: "always" as const, fallback: "Não temos essa informação no momento." }

describe("modo responder sempre: decisão", () => {
  it("resposta boa da IA sai igual nos dois modos", () => {
    const result = { action: "answer" as const, answer: "Temos sim.", confidence: 0.9, reason: "" }
    expect(decideAnswer(result, always)).toEqual({ kind: "answer", text: "Olá! Temos sim. Equipe X", fallbackReason: null })
    expect(decideAnswer(result, careful)).toEqual(decideAnswer(result, always))
  })

  it.each([
    [{ action: "escalate" as const, answer: "", confidence: 0.2, reason: "" }, "ai_escalated"],
    [{ action: "escalate" as const, answer: "Talvez sim.", confidence: 0.9, reason: "" }, "ai_escalated"],
    [{ action: "answer" as const, answer: "Acho que aguenta.", confidence: 0.5, reason: "" }, "low_confidence"],
    [{ action: "answer" as const, answer: "Chama no zap", confidence: 1, reason: "" }, "unsafe_answer"],
    [{ action: "answer" as const, answer: "a".repeat(ML_ANSWER_LIMIT), confidence: 1, reason: "" }, "answer_too_long"],
  ])("quando a IA não pode responder (%#), envia a mensagem padrão com saudação e assinatura", (result, reason) => {
    expect(decideAnswer(result, always)).toEqual({
      kind: "answer",
      text: "Olá! Não temos essa informação no momento. Equipe X",
      fallbackReason: reason,
    })
    // No modo cuidadoso, a mesma situação fica para o vendedor.
    expect(decideAnswer(result, careful)).toEqual({ kind: "review", reason })
  })

  it("sem mensagem própria, usa a mensagem padrão do sistema", () => {
    const decision = decideAnswer({ action: "escalate", answer: "", confidence: 0, reason: "" }, { ...always, fallback: "  " })
    expect(decision).toEqual({
      kind: "answer",
      text: `Olá! ${DEFAULT_FALLBACK_ANSWER} Equipe X`,
      fallbackReason: "ai_escalated",
    })
  })

  it("nunca deixa a mensagem padrão passar do limite do Mercado Livre", () => {
    const text = composeFallback({ greeting: "a".repeat(1500), signature: "b".repeat(1500), fallback: "" })
    expect(text.length).toBeLessThanOrEqual(ML_ANSWER_LIMIT)
    expect(text).toBe(DEFAULT_FALLBACK_ANSWER)
  })

  it("normaliza o modo e a mensagem", () => {
    expect(parseAnswerMode("always")).toBe("always")
    expect(parseAnswerMode("qualquer")).toBe("careful")
    expect(parseAnswerMode(null)).toBe("careful")
    expect(fallbackBody("  Não sei\n informar. ")).toBe("Não sei informar.")
    expect(fallbackBody("")).toBe(DEFAULT_FALLBACK_ANSWER)
  })
})

describe("modo responder sempre: prompt", () => {
  const input = { storeName: "Loja", tone: "cordial" as const, knowledge: "", sellerRules: "", taughtExamples: [] }

  it("modo sempre explica que ninguém revisa e mantém a Regra 0 e a segurança", () => {
    const prompt = buildSystemPrompt({ ...input, mode: "always" })
    expect(prompt).toContain("MODO RESPONDER SEMPRE")
    expect(prompt).toContain("ninguém revisa a resposta antes do envio")
    expect(prompt).toContain("REGRA 0 — NUNCA INVENTE")
    expect(prompt).toContain("Nunca escreva telefone, e-mail, WhatsApp")
    expect(prompt).toContain("mensagem padrão da loja")
    expect(prompt).toContain("o preço e as condições são os mostrados no anúncio")
    expect(prompt).toContain("\"Minhas compras\"")
    expect(prompt).not.toContain("o vendedor vai revisar antes de enviar")
  })

  it("modo cuidadoso (padrão) continua deixando para o vendedor, com rascunho", () => {
    for (const prompt of [buildSystemPrompt(input), buildSystemPrompt({ ...input, mode: "careful" })]) {
      expect(prompt).not.toContain("MODO RESPONDER SEMPRE")
      expect(prompt).toContain("a pergunta fica para o vendedor")
      expect(prompt).toContain("o vendedor vai revisar antes de enviar")
    }
  })

  it("nos dois modos manda procurar a resposta em todas as partes do anúncio", () => {
    expect(buildSystemPrompt(input)).toContain("procure em TODAS essas partes")
    expect(buildSystemPrompt({ ...input, mode: "always" })).toContain("procure em TODAS essas partes")
  })
})

describe("mensagem padrão na caixa de entrada", () => {
  it("vira um tom próprio (violeta) só quando a IA respondeu com ela", () => {
    expect(questionTone("answered", "ai", "ai_escalated")).toBe("fallback")
    expect(questionTone("answered", "ai", null)).toBe("ai")
    expect(questionTone("answered", "manual", "ai_escalated")).toBe("manual")
    expect(questionTone("needs_review", null, "low_confidence")).toBe("open")
  })

  it("aparece como \"Mensagem padrão\" na lista", () => {
    const summary = questionSummary({
      status: "answered",
      answer_source: "ai",
      review_reason: null,
      answer_text: "Olá! Não temos essa informação.",
      fallback_reason: "ai_escalated",
    })
    expect(summary).toEqual({ tone: "fallback", label: "Mensagem padrão", preview: "Olá! Não temos essa informação." })
  })

  it("o filtro \"só mensagem padrão\" só existe na aba da IA", () => {
    const base: InboxState = { tab: "ia", account: null, item: null, search: "", order: "recentes", page: 1, question: null }
    expect(inboxHref({ ...base, fallback: true })).toBe("/perguntas?aba=ia&padrao=1")
    expect(inboxHref({ ...base, fallback: false })).toBe("/perguntas?aba=ia")
    expect(inboxHref({ ...base, tab: "todas", fallback: true })).toBe("/perguntas?aba=todas")
  })
})

describe("parseItemId com links de catálogo", () => {
  it.each([
    ["https://www.mercadolivre.com.br/bicicleta/p/MLB19876543?pdp_filters=item_id:MLB3456789012", "MLB3456789012"],
    ["https://www.mercadolivre.com.br/bicicleta/p/MLB19876543#wid=MLB3456789012&sid=search", "MLB3456789012"],
    ["https://www.mercadolivre.com.br/x/p/MLB19876543?pdp_filters=item_id%3AMLB3456789012", "MLB3456789012"],
    ["https://produto.mercadolivre.com.br/MLB-1234567890-bicicleta-aro-29-_JM", "MLB1234567890"],
  ])("%s → %s", (input, expected) => {
    expect(parseItemId(input)).toBe(expected)
  })

  it("link só de produto de catálogo (sem anúncio) não vira código de anúncio", () => {
    expect(parseItemId("https://www.mercadolivre.com.br/bicicleta/p/MLB19876543")).toBeNull()
  })
})
