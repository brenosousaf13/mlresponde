import { describe, expect, it } from "vitest"

import {
  DESCRIPTION_LIMIT,
  attributeValue,
  htmlToText,
  summarizeItem,
  truncateMiddle,
  type MlItem,
} from "@/lib/mercadolivre/item"

// Formato da API do Mercado Livre (GET /items/{id}?include_attributes=all), com dados de exemplo.
const item: MlItem = {
  id: "MLB3456789012",
  title: "Camiseta Dry Fit Masculina",
  price: 79.9,
  original_price: 99.9,
  permalink: "https://x",
  condition: "new",
  catalog_product_id: "MLB19876543",
  shipping: { free_shipping: false, mode: "me2", logistic_type: "cross_docking", local_pick_up: true },
  sale_terms: [
    { id: "WARRANTY_TYPE", name: "Tipo de garantia", value_name: "Garantia do vendedor" },
    { id: "WARRANTY_TIME", name: "Tempo de garantia", value_name: "30 dias" },
    { id: "MANUFACTURING_TIME", name: "Disponibilidade de estoque", value_name: "5 dias" },
    { id: "INVOICE", name: "Faturamento", value_name: null },
  ],
  attributes: [
    { id: "BRAND", name: "Marca", value_name: "Noord" },
    { id: "COMPATIBLE_MODELS", name: "Modelos compatíveis", value_name: "Aro 26", values: [{ name: "Aro 26" }, { name: "Aro 27,5" }, { name: "Aro 29" }] },
    { id: "SIZE_GRID_ID", name: "ID da guia de tamanhos", value_name: "123456" },
    { id: "SELLER_SKU", name: "SKU", value_name: "CAM-001" },
    { id: "ITEM_CONDITION", name: "Condição do item", value_name: "Novo" },
    { id: "MATERIAL", name: "Material", value_name: null },
  ],
  variations: [
    {
      id: 1,
      available_quantity: 4,
      attribute_combinations: [
        { id: "COLOR", name: "Cor", value_name: "Azul" },
        { id: "SIZE", name: "Tamanho", value_name: "M" },
      ],
    },
    {
      id: 2,
      price: 89.9,
      available_quantity: 0,
      attribute_combinations: [
        { id: "COLOR", name: "Cor", value_name: "Preta" },
        { id: "SIZE", name: "Tamanho", value_name: "G" },
      ],
    },
  ],
}

describe("summarizeItem: o que a IA lê do anúncio", () => {
  const summary = summarizeItem(item, "Tecido com proteção UV 50+. Lavar à mão.", {
    product: {
      short_description: { content: "Camiseta leve para corrida." },
      main_features: [{ text: "Secagem rápida" }, { text: "" }, { text: "Costura reforçada" }],
    },
    sizeChart: {
      rows: [
        {
          attributes: [
            { id: "SIZE", name: "Tamanho", values: [{ name: "M" }] },
            { id: "CHEST_CIRCUMFERENCE_FROM", name: "Tórax", values: [{ name: "96 cm" }] },
          ],
        },
        { attributes: [{ id: "SIZE", name: "Tamanho", values: [{ name: "G" }] }, { name: "Tórax", values: [{ name: "104 cm" }] }] },
        { attributes: [{ name: "Vazio", values: [] }] },
      ],
    },
  })

  it("traz código, preço com promoção e envio", () => {
    expect(summary).toContain("Código do anúncio: MLB3456789012")
    expect(summary).toMatch(/Preço: R\$\s?79,90 \(em promoção; antes R\$\s?99,90\)/)
    expect(summary).toContain("Envio: Mercado Envios (coleta), aceita retirada")
  })

  it("traz todas as condições de venda, inclusive prazo de fabricação", () => {
    expect(summary).toContain("Condições de venda:")
    expect(summary).toContain("- Tipo de garantia: Garantia do vendedor")
    expect(summary).toContain("- Garantia: 30 dias")
    expect(summary).toContain("- Prazo de fabricação (antes de despachar): 5 dias")
    expect(summary).not.toContain("Faturamento")
  })

  it("junta atributos com vários valores e esconde os internos", () => {
    expect(summary).toContain("- Marca: Noord")
    expect(summary).toContain("- Modelos compatíveis: Aro 26, Aro 27,5, Aro 29")
    expect(summary).not.toContain("123456")
    expect(summary).not.toContain("CAM-001")
    expect(summary).not.toContain("Condição do item")
    expect(summary).not.toContain("Material")
  })

  it("descreve cada variação pelo nome do atributo, com estoque e preço próprio", () => {
    expect(summary).toContain("- Cor: Azul; Tamanho: M — com estoque")
    expect(summary).toMatch(/- Cor: Preta; Tamanho: G — ESGOTADA, R\$\s?89,90/)
  })

  it("inclui a tabela de medidas e os dados do catálogo", () => {
    expect(summary).toContain("Tabela de medidas do anúncio:\n- Tamanho: M; Tórax: 96 cm\n- Tamanho: G; Tórax: 104 cm")
    expect(summary).not.toContain("Vazio")
    expect(summary).toContain("Informações do produto no catálogo do Mercado Livre:\nCamiseta leve para corrida.\n- Secagem rápida\n- Costura reforçada")
  })

  it("termina com a descrição escrita pelo vendedor", () => {
    expect(summary).toContain("Descrição do anúncio (escrita pelo vendedor):\nTecido com proteção UV 50+. Lavar à mão.")
  })

  it("avisa quando não há descrição e usa a garantia antiga quando não há condição de venda", () => {
    const plain = summarizeItem({ id: "MLB1", title: "X", price: 10, permalink: "", warranty: "Garantia de fábrica: 6 meses" })
    expect(plain).toContain("- Garantia: Garantia de fábrica: 6 meses")
    expect(plain).toContain("Descrição do anúncio: o vendedor não escreveu descrição.")
  })

  it("lista até 100 variações e avisa quantas ficaram de fora", () => {
    const many = summarizeItem({
      id: "MLB2",
      title: "Y",
      price: 10,
      permalink: "",
      variations: Array.from({ length: 105 }, (_, index) => ({
        id: index,
        available_quantity: 1,
        attribute_combinations: [{ name: "Modelo", value_name: `M${index}` }],
      })),
    })
    expect(many).toContain("- Modelo: M99 — com estoque")
    expect(many).not.toContain("M100")
    expect(many).toContain("(mais 5 variações não listadas)")
  })
})

describe("descrição longa e em HTML", () => {
  it("mantém o começo e o fim de descrições enormes", () => {
    const text = `INICIO ${"a".repeat(30_000)} FIM-GARANTIA`
    const cut = truncateMiddle(text, DESCRIPTION_LIMIT)
    expect(cut.length).toBeLessThan(DESCRIPTION_LIMIT + 100)
    expect(cut.startsWith("INICIO")).toBe(true)
    expect(cut.endsWith("FIM-GARANTIA")).toBe(true)
    expect(cut).toContain("trecho do meio da descrição omitido")
    expect(truncateMiddle("curta", DESCRIPTION_LIMIT)).toBe("curta")
  })

  it("converte descrição em HTML para texto", () => {
    expect(htmlToText("<p>Medidas:</p><ul><li>Altura: 30 cm</li><li>Peso&nbsp;1 kg</li></ul><script>x()</script>")).toBe(
      "Medidas:\n- Altura: 30 cm\n- Peso 1 kg"
    )
  })

  it("valor de atributo com um valor só usa value_name", () => {
    expect(attributeValue({ name: "Cor", value_name: "Azul", values: [{ name: "Azul" }] })).toBe("Azul")
    expect(attributeValue({ name: "Cor", value_name: null, values: [{ name: "Verde" }] })).toBe("Verde")
  })
})
