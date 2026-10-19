import { mlId, type SellerAction } from "@/lib/reputation/claims"

/**
 * Reclamações (etapa 2): detalhe, mensagens, venda, ações e anexos (puro, testado em
 * tests/unit/reputation-claims.test.ts). Nada de dados pessoais do comprador além do apelido.
 */

// ---------------------------------------------------------------------------------------------- rótulos

export const CLAIM_TYPE_LABELS: Record<string, string> = {
  mediations: "Reclamação",
  returns: "Devolução",
  fulfillment: "Reclamação (Full)",
  ml_case: "Cancelamento por atraso",
  cancel_sale: "Cancelada por você",
  cancel_purchase: "Cancelada pelo comprador",
  change: "Troca",
  service: "Serviço",
}

export const CLAIM_STAGE_LABELS: Record<string, string> = {
  claim: "Com o comprador",
  dispute: "Em mediação",
  recontact: "Reaberta",
  stale: "Com o Mercado Livre",
  none: "Sem etapa",
}

export const ROLE_LABELS: Record<string, string> = {
  complainant: "Comprador",
  respondent: "Você",
  mediator: "Mediador do ML",
}

export const EXPECTED_RESOLUTION_LABELS: Record<string, string> = {
  refund: "Quer o dinheiro de volta",
  product: "Quer receber o produto",
  change_product: "Quer trocar o produto",
  return_product: "Quer devolver o produto e receber o dinheiro",
  partial_refund: "Reembolso parcial",
}

export const EXPECTED_STATUS_LABELS: Record<string, string> = {
  pending: "pendente",
  accepted: "aceito",
  rejected: "recusado",
}

/** PDD = produto com defeito ou diferente; PNR = não recebido; CS = compra cancelada. */
export function reasonGroup(reasonId: string | null | undefined): string | null {
  const prefix = (reasonId ?? "").slice(0, 3).toUpperCase()
  if (prefix === "PDD") return "Produto com defeito ou diferente do anunciado"
  if (prefix === "PNR") return "Produto não recebido"
  if (prefix.startsWith("CS")) return "Compra cancelada"
  return null
}

/** Tipos que aparecem na aba Reclamações e recebem detalhe e IA (cancelamentos ficam de fora). */
export const LISTED_CLAIM_TYPES = ["mediations", "returns", "change", "fulfillment", "ml_case"] as const

export function claimTypeLabel(type: string): string {
  return CLAIM_TYPE_LABELS[type] ?? "Reclamação"
}

// ---------------------------------------------------------------------------------------------- ações

/** Ações que a maanu executa (sempre com o clique do vendedor). */
export type ClaimActionKind = "message_buyer" | "message_mediator" | "refund" | "partial_refund" | "allow_return" | "open_dispute"

const ML_ACTION_KINDS: Record<string, ClaimActionKind> = {
  send_message_to_complainant: "message_buyer",
  send_message_to_mediator: "message_mediator",
  refund: "refund",
  allow_partial_refund: "partial_refund",
  allow_return: "allow_return",
  allow_return_label: "allow_return",
  open_dispute: "open_dispute",
}

/** O que cada ação do ML significa (para as que só dá para fazer no próprio ML). */
export const ML_ACTION_LABELS: Record<string, string> = {
  send_message_to_complainant: "Responder ao comprador",
  send_message_to_mediator: "Escrever ao mediador",
  refund: "Devolver o dinheiro",
  allow_partial_refund: "Oferecer reembolso parcial",
  allow_return: "Aceitar a devolução",
  allow_return_label: "Aceitar a devolução",
  open_dispute: "Pedir a mediação do ML",
  add_shipping_evidence: "Enviar comprovante de envio",
  send_tracking_number: "Informar o rastreio",
  send_potential_shipping: "Informar a data de envio",
  return_review: "Revisar a devolução",
  send_attachments: "Enviar anexos",
}

export const CLAIM_ACTION_LABELS: Record<ClaimActionKind, string> = {
  message_buyer: "Responder ao comprador",
  message_mediator: "Escrever ao mediador",
  refund: "Devolver o dinheiro",
  partial_refund: "Oferecer reembolso parcial",
  allow_return: "Aceitar a devolução",
  open_dispute: "Pedir a mediação do ML",
}

/** Dinheiro e mediação: só dono ou administrador, com 2ª confirmação. */
export const RESTRICTED_ACTIONS: readonly ClaimActionKind[] = ["refund", "partial_refund", "allow_return", "open_dispute"]

export type AvailableClaimAction = { kind: ClaimActionKind; mandatory: boolean; dueDate: string | null }

/**
 * O que o vendedor pode fazer agora, só do que o ML lista em available_actions (reclamação aberta). As ações que a maanu
 * não executa (comprovante, rastreio, revisão de devolução) ficam em onlyInMl.
 */
export function claimActions(actions: readonly SellerAction[], status: string): {
  available: AvailableClaimAction[]
  onlyInMl: { action: string; label: string; mandatory: boolean; dueDate: string | null }[]
} {
  if (status !== "opened") return { available: [], onlyInMl: [] }
  const available = new Map<ClaimActionKind, AvailableClaimAction>()
  const onlyInMl = new Map<string, { action: string; label: string; mandatory: boolean; dueDate: string | null }>()
  for (const action of actions) {
    const kind = ML_ACTION_KINDS[action.action]
    if (kind) {
      const current = available.get(kind)
      available.set(kind, {
        kind,
        mandatory: Boolean(current?.mandatory || action.mandatory),
        dueDate: current?.dueDate ?? action.due_date,
      })
    } else if (ML_ACTION_LABELS[action.action] && action.action !== "send_attachments") {
      onlyInMl.set(action.action, {
        action: action.action,
        label: ML_ACTION_LABELS[action.action],
        mandatory: action.mandatory,
        dueDate: action.due_date,
      })
    }
  }
  return { available: [...available.values()], onlyInMl: [...onlyInMl.values()] }
}

export function isRestrictedAction(kind: ClaimActionKind): boolean {
  return RESTRICTED_ACTIONS.includes(kind)
}

// ---------------------------------------------------------------------------------------------- leitura do ML

type MlAttachment = { filename?: unknown; original_filename?: unknown; size?: unknown; type?: unknown }

export type MlClaimMessage = {
  sender_role?: string | null
  receiver_role?: string | null
  message?: string | null
  date_created?: string | null
  message_date?: string | null
  status?: string | null
  stage?: string | null
  message_moderation?: { status?: string | null } | null
  attachments?: MlAttachment[] | null
  hash?: string | null
}

export type ClaimMessageRow = {
  hash: string
  sender_role: string | null
  receiver_role: string | null
  message: string
  message_at: string | null
  stage: string | null
  status: string | null
  moderation_status: string | null
  attachments: { filename: string; original_filename: string | null; size: number | null; type: string | null }[]
}

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? new Date(time).toISOString() : null
}

/** Assinatura curta e estável de um texto (FNV-1a 32 bits, hexadecimal). */
export function shortHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, "0")
}

// ---------------------------------------------------------------------------------------------- texto das mensagens

const HTML_TAG = /<\s*\/?\s*(p|span|br|div|section|article|b|strong|i|em|u|a|ul|ol|li|code|h[1-6]|table|tr|td|font)\b[^>]*>/i

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", hellip: "…", ndash: "–", mdash: "—", bull: "•",
  laquo: "«", raquo: "»", ordm: "º", ordf: "ª", deg: "°", copy: "©", reg: "®",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  agrave: "à", Agrave: "À", acirc: "â", ecirc: "ê", ocirc: "ô", Acirc: "Â", Ecirc: "Ê", Ocirc: "Ô",
  atilde: "ã", otilde: "õ", Atilde: "Ã", Otilde: "Õ", ccedil: "ç", Ccedil: "Ç", uuml: "ü", Uuml: "Ü",
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const point = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match
    }
    return NAMED_ENTITIES[code] ?? match
  })
}

/**
 * Texto de uma mensagem de reclamação como a pessoa leria. O mediador do ML escreve num editor que manda HTML (parágrafos,
 * spans com espaços, negrito, links, listas, entidades como &nbsp;): vira texto com quebras de linha, links como
 * "texto (endereço)" e listas com "•". Texto comum só tem as entidades decodificadas e os espaços arrumados.
 */
export function claimMessageText(raw: string | null | undefined): string {
  if (!raw) return ""
  let value = raw.replace(/\r\n?/g, "\n")
  if (HTML_TAG.test(value)) {
    value = value
      .replace(/<\s*(script|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
      .replace(/\n/g, " ")
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\s*li\b[^>]*>/gi, "\n• ")
      .replace(/<\s*\/\s*(p|div|section|article|h[1-6]|ul|ol|tr|table)\s*>/gi, "\n")
      .replace(/<\s*a\b[^>]*?href\s*=\s*("([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\s*\/\s*a\s*>/gi, (_match, _q, double, single, label) => {
        const href = decodeEntities(String(double ?? single ?? "")).trim()
        const text = String(label).replace(/<[^>]*>/g, "").trim()
        if (!/^https?:\/\//i.test(href)) return text
        return text && decodeEntities(text) !== href ? text + " (" + href + ")" : href
      })
      .replace(/<[^>]*>/g, "")
  }
  return decodeEntities(value)
    .split("\n")
    .map((line) => line.replace(/[\s\u00a0]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function parseClaimMessages(raw: readonly MlClaimMessage[] | null | undefined): ClaimMessageRow[] {
  const rows = new Map<string, ClaimMessageRow>()
  for (const [index, message] of (raw ?? []).entries()) {
    const at = isoDate(message.message_date ?? message.date_created)
    const original = typeof message.message === "string" ? message.message.trim().slice(0, 5000) : ""
    // A assinatura própria (quando o ML não manda hash) usa o texto original, para não mudar se a limpeza mudar.
    const hash =
      text(message.hash, 200) ??
      "maanu:" + shortHash((at ?? "") + "|" + (message.sender_role ?? "") + "|" + original + "|" + index)
    rows.set(hash, {
      hash,
      sender_role: text(message.sender_role, 40),
      receiver_role: text(message.receiver_role, 40),
      message: claimMessageText(typeof message.message === "string" ? message.message : "").slice(0, 5000),
      message_at: at,
      stage: text(message.stage, 40),
      status: text(message.status, 40),
      moderation_status: text(message.message_moderation?.status, 40),
      attachments: (message.attachments ?? []).slice(0, 20).flatMap((attachment) => {
        const filename = text(attachment?.filename, 200)
        if (!filename) return []
        const size = Number(attachment?.size)
        return [
          {
            filename,
            original_filename: text(attachment?.original_filename, 200),
            size: Number.isFinite(size) ? size : null,
            type: text(attachment?.type, 60),
          },
        ]
      }),
    })
  }
  return [...rows.values()].sort((a, b) => Date.parse(a.message_at ?? "") - Date.parse(b.message_at ?? ""))
}

export type ClaimDetail = {
  title: string | null
  description: string | null
  problem: string | null
  due_date: string | null
  action_responsible: string | null
}

export function parseClaimDetail(raw: Record<string, unknown> | null | undefined): ClaimDetail | null {
  if (!raw) return null
  const detail = {
    title: text(raw.title, 300),
    description: text(raw.description, 800),
    problem: text(raw.problem, 800),
    due_date: isoDate(raw.due_date),
    action_responsible: text(raw.action_responsible, 40),
  }
  return Object.values(detail).some(Boolean) ? detail : null
}

export type ExpectedResolution = { player_role: string | null; expected_resolution: string; status: string | null }

export function parseExpectedResolutions(raw: unknown): ExpectedResolution[] {
  if (!Array.isArray(raw)) return []
  return raw
    .flatMap((item: { player_role?: unknown; expected_resolution?: unknown; status?: unknown }) => {
      const resolution = text(item?.expected_resolution, 40)
      return resolution ? [{ player_role: text(item?.player_role, 40), expected_resolution: resolution, status: text(item?.status, 20) }] : []
    })
    .slice(0, 20)
}

export type OrderSummary = {
  order_id: number | null
  pack_id: number | null
  date: string | null
  total_amount: number | null
  currency_id: string | null
  items: { title: string; quantity: number; unit_price: number | null }[]
}

export type OrderLike = {
  id?: unknown
  pack_id?: unknown
  date_created?: unknown
  total_amount?: unknown
  currency_id?: unknown
  order_items?: { item?: { title?: unknown } | null; quantity?: unknown; unit_price?: unknown }[] | null
}

function money(value: unknown): number | null {
  const number = Number(value)
  return value !== null && value !== undefined && Number.isFinite(number) ? Math.round(number * 100) / 100 : null
}

/** Resumo da venda vindo do ML (/orders/{id}): itens, valor e data. Comprador, endereço e pagamento ficam de fora. */
export function orderSummaryFromMl(order: OrderLike | null | undefined): OrderSummary | null {
  if (!order) return null
  return {
    order_id: mlId(order.id as never),
    pack_id: mlId(order.pack_id as never),
    date: isoDate(order.date_created),
    total_amount: money(order.total_amount),
    currency_id: text(order.currency_id, 10),
    items: (order.order_items ?? []).slice(0, 10).flatMap((item) => {
      const title = text(item?.item?.title, 200)
      return title ? [{ title, quantity: Math.max(1, Number(item?.quantity) || 1), unit_price: money(item?.unit_price) }] : []
    }),
  }
}

/** Resumo da venda a partir de ml_orders (aba Clientes), quando a venda já está gravada. */
export function orderSummaryFromRow(row: {
  ml_order_id: number
  pack_id: number | null
  ordered_at: string | null
  total_amount: number | null
  currency_id: string | null
  items: unknown
}): OrderSummary {
  const items = Array.isArray(row.items) ? (row.items as { title?: unknown; quantity?: unknown; unit_price?: unknown }[]) : []
  return {
    order_id: Number(row.ml_order_id),
    pack_id: row.pack_id ? Number(row.pack_id) : null,
    date: row.ordered_at,
    total_amount: money(row.total_amount),
    currency_id: row.currency_id,
    items: items.slice(0, 10).flatMap((item) => {
      const title = text(item?.title, 200)
      return title ? [{ title, quantity: Math.max(1, Number(item?.quantity) || 1), unit_price: money(item?.unit_price) }] : []
    }),
  }
}

/** Assinatura do que a IA lê: mudou a reclamação ou chegou mensagem = análise nova. */
export function claimInputHash(parts: {
  status: string
  stage: string | null
  mlUpdatedAt: string | null
  actions: readonly SellerAction[]
  messageHashes: readonly string[]
}): string {
  return shortHash(
    [
      parts.status,
      parts.stage ?? "",
      parts.mlUpdatedAt ?? "",
      parts.actions.map((action) => action.action + ":" + action.mandatory).join(","),
      [...parts.messageHashes].sort().join(","),
    ].join("|")
  )
}

/** No máximo 8 análises da IA por reclamação. */
export const MAX_CLAIM_ANALYSES = 8

// ---------------------------------------------------------------------------------------------- reembolso parcial

export type PartialRefundOffers = {
  currency: string
  offers: { percentage: number; amount: number }[]
  /** O ML recomenda não passar deste percentual (reembolso parcial melhor que devolução). */
  recommendedMax: number | null
  /** O ML não aceita menos que este percentual. */
  minimum: number | null
}

type OfferRule = { percentage?: unknown; reason?: unknown; type?: unknown; restrictions?: unknown }

export function parsePartialRefundOffers(raw: Record<string, unknown> | null | undefined): PartialRefundOffers {
  const offers = (Array.isArray(raw?.available_offers) ? (raw?.available_offers as { amount?: unknown; percentage?: unknown }[]) : [])
    .flatMap((offer) => {
      const percentage = Number(offer?.percentage)
      const amount = Number(offer?.amount)
      return Number.isFinite(percentage) && Number.isFinite(amount) && percentage > 0 && percentage < 100
        ? [{ percentage, amount: Math.round(amount * 100) / 100 }]
        : []
    })
    .sort((a, b) => b.percentage - a.percentage)
  const rules: OfferRule[] = []
  for (const key of ["recommendations", "restrictions"]) {
    const list = raw?.[key]
    if (Array.isArray(list)) {
      for (const rule of list as OfferRule[]) {
        rules.push(rule)
        if (Array.isArray(rule?.restrictions)) rules.push(...(rule.restrictions as OfferRule[]))
      }
    }
  }
  const pick = (type: string) => {
    const rule = rules.find((item) => String(item?.type).toLowerCase() === type && Number.isFinite(Number(item?.percentage)))
    return rule ? Number(rule.percentage) : null
  }
  const minimum = pick("minimum")
  return {
    currency: text(raw?.currency_id, 10) ?? "BRL",
    offers: minimum === null ? offers : offers.filter((offer) => offer.percentage >= minimum),
    recommendedMax: pick("maximum"),
    minimum,
  }
}

// ---------------------------------------------------------------------------------------------- mensagens e anexos

export const CLAIM_MESSAGE_MAX = 2000
/** O ML aceita até 5 MB por arquivo; a Server Action da maanu leva até 4 MB no total (limite da Vercel). */
export const CLAIM_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024
export const CLAIM_ATTACHMENTS_TOTAL_BYTES = 4 * 1024 * 1024
export const CLAIM_ATTACHMENT_MAX_FILES = 5
const ATTACHMENT_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" }

/** Nome aceito pelo ML: letras, números, ponto, hífen e sublinhado, até 125 caracteres, com a extensão do tipo. */
export function sanitizeAttachmentName(name: string, type: string): string {
  const extension = ATTACHMENT_TYPES[type] ?? "bin"
  const base = name
    .replace(/\.[^.]*$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_.-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 125 - extension.length - 1)
  return (base || "anexo") + "." + extension
}

export function validateAttachment(file: { name: string; type: string; size: number }): string | null {
  if (!ATTACHMENT_TYPES[file.type]) return "O ML aceita só JPG, PNG ou PDF (" + file.name + ")."
  if (file.size <= 0) return "O arquivo " + file.name + " está vazio."
  if (file.size > CLAIM_ATTACHMENT_MAX_BYTES) return "O arquivo " + file.name + " passa de 5 MB."
  return null
}

export function validateAttachments(files: readonly { name: string; type: string; size: number }[]): string | null {
  if (files.length > CLAIM_ATTACHMENT_MAX_FILES) return "Anexe no máximo " + CLAIM_ATTACHMENT_MAX_FILES + " arquivos por mensagem."
  const invalid = files.map(validateAttachment).find(Boolean)
  if (invalid) return invalid
  if (files.reduce((total, file) => total + file.size, 0) > CLAIM_ATTACHMENTS_TOTAL_BYTES) {
    return "Os anexos passam de 4 MB no total. Envie menos arquivos ou arquivos menores."
  }
  return null
}

export function validateClaimMessage(message: string): string | null {
  const trimmed = message.trim()
  if (!trimmed) return "Escreva a mensagem."
  if (trimmed.length > CLAIM_MESSAGE_MAX) return "A mensagem pode ter até " + CLAIM_MESSAGE_MAX + " caracteres."
  return null
}
