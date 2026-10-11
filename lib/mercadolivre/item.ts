/** Anúncio do Mercado Livre e como ele vira texto para a IA (puro: usado no servidor e testado). */

export type MlAttributeValue = { id?: string | null; name: string | null }

export type MlAttribute = { id?: string; name: string; value_name: string | null; values?: MlAttributeValue[] | null }

export type MlVariation = {
  id: number
  price?: number
  available_quantity: number
  attribute_combinations: { id?: string; name: string; value_name: string | null }[]
}

export type MlSaleTerm = { id?: string; name: string; value_name: string | null }

export type MlItem = {
  id: string
  title: string
  price: number
  original_price?: number | null
  currency_id?: string
  available_quantity?: number
  sold_quantity?: number
  condition?: string
  permalink: string
  thumbnail?: string
  secure_thumbnail?: string
  status?: string
  listing_type_id?: string
  catalog_product_id?: string | null
  attributes?: MlAttribute[]
  variations?: MlVariation[]
  shipping?: { free_shipping?: boolean; logistic_type?: string; local_pick_up?: boolean; mode?: string }
  warranty?: string | null
  sale_terms?: MlSaleTerm[]
}

/** Produto de catálogo (GET /products/{id}): textos que o Mercado Livre mostra na página do produto. */
export type MlProduct = {
  name?: string | null
  short_description?: { content?: string | null } | null
  main_features?: { text?: string | null }[] | null
}

/** Tabela de medidas (GET /catalog/charts/{id}). Leitura defensiva: o formato varia por categoria. */
export type MlSizeChart = {
  names?: Record<string, string> | null
  rows?: { attributes?: { id?: string; name?: string | null; values?: { name?: string | null }[] | null }[] | null }[] | null
}

export type ItemExtras = { product?: MlProduct | null; sizeChart?: MlSizeChart | null }

export const DESCRIPTION_LIMIT = 20_000
const ATTRIBUTE_LIMIT = 150
const VARIATION_LIMIT = 100
const SIZE_CHART_ROW_LIMIT = 40
const PRODUCT_FEATURE_LIMIT = 20

/** Atributos internos ou repetidos que só fazem barulho para a IA. */
const HIDDEN_ATTRIBUTES = new Set(["SIZE_GRID_ID", "SIZE_GRID_ROW_ID", "SELLER_SKU", "ITEM_CONDITION"])

const LOGISTIC_LABELS: Record<string, string> = {
  fulfillment: "Mercado Envios Full",
  cross_docking: "Mercado Envios (coleta)",
  drop_off: "Mercado Envios (agência)",
  self_service: "Mercado Envios Flex",
  xd_drop_off: "Mercado Envios (agência)",
}

const SHIPPING_MODE_LABELS: Record<string, string> = {
  custom: "envio feito pelo próprio vendedor",
  not_specified: "forma de envio a combinar",
}

/** Nomes mais claros para condições de venda conhecidas (o resto usa o nome que o ML devolve). */
const SALE_TERM_LABELS: Record<string, string> = {
  WARRANTY_TYPE: "Tipo de garantia",
  WARRANTY_TIME: "Garantia",
  MANUFACTURING_TIME: "Prazo de fabricação (antes de despachar)",
  PURCHASE_MAX_QUANTITY: "Quantidade máxima por compra",
}

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

function clean(text: string | null | undefined) {
  return (text ?? "").replace(/\s+/g, " ").trim()
}

/** Corta textos enormes mantendo o começo e o fim (onde costumam ficar garantia, medidas e avisos). */
export function truncateMiddle(text: string, max: number): string {
  if (text.length <= max) return text
  const head = Math.ceil(max * 0.7)
  const tail = max - head
  return `${text.slice(0, head).trimEnd()}\n[... trecho do meio da descrição omitido por ser muito longo ...]\n${text.slice(-tail).trimStart()}`
}

/** Descrição em HTML (anúncios antigos) para texto simples. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Valor de um atributo, juntando todos quando há vários (ex.: modelos compatíveis). */
export function attributeValue(attribute: MlAttribute): string {
  const values = (attribute.values ?? []).map((value) => clean(value.name)).filter(Boolean)
  if (values.length > 1) return [...new Set(values)].join(", ")
  return clean(attribute.value_name) || values[0] || ""
}

function variationLine(item: MlItem, variation: MlVariation) {
  const name = variation.attribute_combinations
    .filter((combo) => clean(combo.value_name))
    .map((combo) => (clean(combo.name) ? `${clean(combo.name)}: ${clean(combo.value_name)}` : clean(combo.value_name)))
    .join("; ")
  const stock = variation.available_quantity > 0 ? "com estoque" : "ESGOTADA"
  const price = variation.price && variation.price !== item.price ? `, ${money(variation.price)}` : ""
  return `- ${name || `Variação ${variation.id}`} — ${stock}${price}`
}

function sizeChartLines(chart: MlSizeChart): string[] {
  const rows = (chart.rows ?? [])
    .slice(0, SIZE_CHART_ROW_LIMIT)
    .map((row) =>
      (row.attributes ?? [])
        .map((attribute) => {
          const value = (attribute.values ?? []).map((entry) => clean(entry.name)).filter(Boolean).join(" / ")
          return value && clean(attribute.name) ? `${clean(attribute.name)}: ${value}` : ""
        })
        .filter(Boolean)
        .join("; ")
    )
    .filter(Boolean)
  return rows.map((row) => `- ${row}`)
}

function productLines(product: MlProduct): string[] {
  const lines: string[] = []
  const summary = clean(product.short_description?.content)
  if (summary) lines.push(truncateMiddle(summary, 3000))
  const features = (product.main_features ?? [])
    .map((feature) => clean(feature.text))
    .filter(Boolean)
    .slice(0, PRODUCT_FEATURE_LIMIT)
  if (features.length) lines.push(...features.map((feature) => `- ${feature}`))
  return lines
}

export function summarizeItem(item: MlItem, description?: string | null, extras: ItemExtras = {}): string {
  const lines: string[] = [`Código do anúncio: ${item.id}`, `Título: ${item.title}`]

  const promo = typeof item.original_price === "number" && item.original_price > item.price
  lines.push(promo ? `Preço: ${money(item.price)} (em promoção; antes ${money(item.original_price!)})` : `Preço: ${money(item.price)}`)

  if (item.condition) lines.push(`Condição: ${item.condition === "new" ? "Novo" : item.condition === "used" ? "Usado" : item.condition}`)
  if (item.status && item.status !== "active") lines.push(`Situação do anúncio: ${item.status} (pausado/inativo)`)

  const hasVariations = Boolean(item.variations?.length)
  if (!hasVariations && typeof item.available_quantity === "number") {
    lines.push(item.available_quantity > 0 ? "Estoque: disponível" : "Estoque: ESGOTADO")
  }

  if (item.shipping) {
    const shipping: string[] = []
    if (item.shipping.free_shipping) shipping.push("frete grátis")
    if (item.shipping.logistic_type) shipping.push(LOGISTIC_LABELS[item.shipping.logistic_type] ?? item.shipping.logistic_type)
    else if (item.shipping.mode && SHIPPING_MODE_LABELS[item.shipping.mode]) shipping.push(SHIPPING_MODE_LABELS[item.shipping.mode])
    if (item.shipping.local_pick_up) shipping.push("aceita retirada")
    if (shipping.length) lines.push(`Envio: ${shipping.join(", ")}`)
  }

  const terms = (item.sale_terms ?? [])
    .filter((term) => clean(term.value_name))
    .map((term) => `- ${(term.id && SALE_TERM_LABELS[term.id]) || clean(term.name) || term.id}: ${clean(term.value_name)}`)
  const hasWarrantyTerm = (item.sale_terms ?? []).some((term) => term.id?.startsWith("WARRANTY") && clean(term.value_name))
  if (!hasWarrantyTerm && clean(item.warranty)) terms.unshift(`- Garantia: ${clean(item.warranty)}`)
  if (terms.length) lines.push("Condições de venda:", ...terms)

  const attributes = (item.attributes ?? [])
    .filter((attribute) => !(attribute.id && HIDDEN_ATTRIBUTES.has(attribute.id)))
    .map((attribute) => ({ name: clean(attribute.name) || attribute.id, value: attributeValue(attribute) }))
    .filter((attribute) => attribute.name && attribute.value)
    .slice(0, ATTRIBUTE_LIMIT)
    .map((attribute) => `- ${attribute.name}: ${attribute.value}`)
  if (attributes.length) lines.push("Ficha técnica:", ...attributes)

  if (hasVariations) {
    const variations = item.variations!
    lines.push("Variações (estoque de cada uma):", ...variations.slice(0, VARIATION_LIMIT).map((variation) => variationLine(item, variation)))
    if (variations.length > VARIATION_LIMIT) lines.push(`- (mais ${variations.length - VARIATION_LIMIT} variações não listadas)`)
  }

  const chart = extras.sizeChart ? sizeChartLines(extras.sizeChart) : []
  if (chart.length) lines.push("Tabela de medidas do anúncio:", ...chart)

  const product = extras.product ? productLines(extras.product) : []
  if (product.length) lines.push("Informações do produto no catálogo do Mercado Livre:", ...product)

  const text = description?.trim()
  if (text) lines.push("Descrição do anúncio (escrita pelo vendedor):", truncateMiddle(text, DESCRIPTION_LIMIT))
  else lines.push("Descrição do anúncio: o vendedor não escreveu descrição.")

  return lines.join("\n")
}
