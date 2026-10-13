import { describe, expect, it } from "vitest"

import { containsExternalContact } from "@/lib/answers/compose"
import { runImprovementModel } from "@/lib/listing-improvements/ai"
import { summarizeItem, type MlItem } from "@/lib/mercadolivre/item"

// Melhorias de anúncio com a IA de verdade (custa centavos). Só roda com RUN_LIVE_AI=1 e OPENAI_API_KEY definida:
//   $env:RUN_LIVE_AI="1"; npx vitest run tests/integration/listing-improvement-live.test.ts
const enabled = process.env.RUN_LIVE_AI === "1" && Boolean(process.env.OPENAI_API_KEY)

const item: MlItem = {
  id: "MLB3000000099",
  title: "Mesa Lateral Redonda Madeira Pés Palito Sala",
  price: 189.9,
  currency_id: "BRL",
  available_quantity: 12,
  condition: "new",
  permalink: "https://produto.mercadolivre.com.br/MLB-3000000099",
  attributes: [
    { id: "BRAND", name: "Marca", value_name: "Casa Viva" },
    { id: "MATERIAL", name: "Material", value_name: "MDF" },
    { id: "COLOR", name: "Cor", value_name: "Freijó" },
  ],
  variations: [],
  shipping: { free_shipping: true },
  sale_terms: [{ id: "WARRANTY_TYPE", name: "Tipo de garantia", value_name: "Garantia do vendedor" }],
}

const description =
  "Mesa lateral redonda com pés palito, ideal para sala ou quarto. Acabamento em MDF com pintura freijó. Produto novo, enviado desmontado."

const questions = [
  { text: "Qual a altura da mesa?", answer: "Olá! A mesa tem 55 cm de altura." },
  { text: "Qual o diâmetro do tampo?", answer: "Olá! O tampo tem 40 cm de diâmetro." },
  { text: "Quantos cm tem de altura?", answer: "Olá! São 55 cm de altura." },
  { text: "Qual a medida do tampo?", answer: "Olá! 40 cm de diâmetro." },
  { text: "Vem montada?", answer: "Olá! Ela vai desmontada, a montagem é simples, só rosquear os pés." },
  { text: "Precisa de ferramenta para montar?", answer: "Olá! Não precisa, os pés são rosqueados à mão." },
  { text: "Os pés são de madeira maciça?", answer: "Olá! Sim, os pés são de eucalipto maciço." },
  { text: "Aguenta quanto peso?", answer: null },
  { text: "Tem na cor branca?", answer: "Olá! No momento só temos na cor freijó." },
  { text: "Qual a altura?", answer: "Olá! 55 cm." },
  { text: "Faz por 150?", answer: null },
  { text: "Os pés são de quê?", answer: "Olá! Eucalipto maciço." },
].map((question, index) => ({ ...question, askedAt: new Date(Date.UTC(2026, 9, 1 + index, 15)).toISOString() }))

describe.skipIf(!enabled)("melhorias de anúncio com a IA real", () => {
  it(
    "encontra as dúvidas repetidas e usa as respostas do vendedor sem inventar",
    async () => {
      const run = await runImprovementModel(
        {
          storeName: "Casa Viva Móveis",
          itemSummary: summarizeItem(item, description),
          isCatalog: false,
          periodDays: 90,
          questions,
        },
        null
      )
      const { result } = run
      console.log(JSON.stringify(result, null, 2))

      expect(result.summary.length).toBeGreaterThan(10)
      expect(result.suggestions.length).toBeGreaterThanOrEqual(2)
      expect(result.suggestions.length).toBeLessThanOrEqual(6)

      const all = result.suggestions.map((suggestion) => `${suggestion.title} ${suggestion.action} ${suggestion.readyText}`).join("\n")
      // Medidas (as mais perguntadas) com os números das respostas do vendedor.
      expect(all).toMatch(/55\s*cm/)
      expect(all).toMatch(/40\s*cm/)
      // A primeira sugestão trata das medidas.
      expect(`${result.suggestions[0].title} ${result.suggestions[0].readyText}`.toLowerCase()).toMatch(/medida|altura|diâmetro/)
      // Nada de contato externo nem de inventar o peso suportado (a loja nunca respondeu).
      for (const suggestion of result.suggestions) {
        expect(containsExternalContact(suggestion.readyText)).toBe(false)
        if (/peso|kg/i.test(suggestion.readyText)) expect(suggestion.readyText).toMatch(/\[[^\]]+\]/)
        if (suggestion.area === "titulo" && suggestion.readyText) expect(suggestion.readyText.length).toBeLessThanOrEqual(60)
      }
    },
    120_000
  )
})
