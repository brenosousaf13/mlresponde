export type MlAttribute = { id?: string; name: string; value_name: string | null }

export type MlVariation = {
  id: number
  price?: number
  available_quantity: number
  attribute_combinations: { name: string; value_name: string | null }[]
}

export type MlItem = {
  id: string
  title: string
  price: number
  currency_id?: string
  available_quantity?: number
  sold_quantity?: number
  condition?: string
  permalink: string
  thumbnail?: string
  secure_thumbnail?: string
  status?: string
  listing_type_id?: string
  attributes?: MlAttribute[]
  variations?: MlVariation[]
  shipping?: { free_shipping?: boolean; logistic_type?: string; local_pick_up?: boolean }
  warranty?: string | null
  sale_terms?: { id?: string; name: string; value_name: string | null }[]
}

const LOGISTIC_LABELS: Record<string, string> = {
  fulfillment: "Mercado Envios Full",
  cross_docking: "Mercado Envios (coleta)",
  drop_off: "Mercado Envios (agência)",
  self_service: "Mercado Envios Flex",
  xd_drop_off: "Mercado Envios (agência)",
}

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export function summarizeItem(item: MlItem, description?: string | null): string {
  const lines: string[] = [`Título: ${item.title}`, `Preço: ${money(item.price)}`]

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
    if (item.shipping.local_pick_up) shipping.push("aceita retirada")
    if (shipping.length) lines.push(`Envio: ${shipping.join(", ")}`)
  }

  const warranty = item.sale_terms?.find((term) => term.id === "WARRANTY_TIME")?.value_name ?? item.warranty
  if (warranty) lines.push(`Garantia: ${warranty}`)

  const attributes = (item.attributes ?? [])
    .filter((attribute) => attribute.value_name)
    .slice(0, 60)
    .map((attribute) => `- ${attribute.name}: ${attribute.value_name}`)
  if (attributes.length) lines.push("Ficha técnica:", ...attributes)

  if (hasVariations) {
    const variations = item.variations!.slice(0, 50).map((variation) => {
      const name = variation.attribute_combinations.map((combo) => combo.value_name).filter(Boolean).join(" / ")
      const stock = variation.available_quantity > 0 ? "com estoque" : "ESGOTADA"
      const price = variation.price && variation.price !== item.price ? `, ${money(variation.price)}` : ""
      return `- ${name || `Variação ${variation.id}`}: ${stock}${price}`
    })
    lines.push("Variações:", ...variations)
  }

  if (description?.trim()) lines.push("Descrição do anúncio:", truncate(description.trim(), 6000))

  return lines.join("\n")
}
