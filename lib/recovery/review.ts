import { containsExternalContact } from "@/lib/answers/compose"

/**
 * Revisão de devolução pelo vendedor (puro, testado em tests/unit/recovery.test.ts): motivos do ML, checklist, fotos,
 * validação e o corpo do POST /post-purchase/v1/returns/{return_id}/return-review (documentação conferida em 2026-10-20):
 *  - "Chegou certinho": corpo {}.
 *  - "Chegou com problema": [{ reason, message, attachments? }]; attachments obrigatórios em SRF2 e SRF4. order_id só para
 *    revisar UM pedido de um carrinho; a maanu revisa sempre o carrinho inteiro (sem order_id).
 */

export type ReviewDecision = "ok" | "fail"

/** Limite do relato. O ML não documenta o máximo; 1.000 caracteres é folgado e cabe na tela do celular. */
export const RETURN_MESSAGE_MAX = 1000
/** Fotos por revisão (cada uma vira um anexo no ML). */
export const RETURN_PHOTOS_MAX = 5
/** Total que a Server Action recebe (limite da Vercel ~4,5 MB); as fotos são reduzidas no navegador antes. */
export const RETURN_PHOTOS_TOTAL_BYTES = 4 * 1024 * 1024
export const RETURN_PHOTO_MAX_BYTES = 5 * 1024 * 1024
const PHOTO_TYPES = new Set(["image/jpeg", "image/png"])

export type ReturnReason = { id: string; label: string; apply: string[]; position: number }

/** Motivos do fluxo seller_return_failed como o ML devolveu em 2026-10-20 (usados se a leitura ao vivo falhar). */
export const FALLBACK_REASONS: readonly ReturnReason[] = [
  { id: "SRF2", label: "O produto chegou avariado", apply: ["order"], position: 1 },
  { id: "SRF3", label: "A devolução está incompleta", apply: ["order"], position: 2 },
  { id: "SRF4", label: "O produto devolvido é diferente do que eu enviei", apply: ["order"], position: 3 },
  { id: "SRF5", label: "O produto não está no pacote", apply: ["order", "package"], position: 4 },
  { id: "SRF6", label: "Reportar outro defeito no produto", apply: ["order"], position: 5 },
  { id: "SRF7", label: "Ainda não chegou", apply: ["package"], position: 6 },
]

/** Motivos em que o ML exige foto. */
export const PHOTO_REQUIRED_REASONS: readonly string[] = ["SRF2", "SRF4"]

export function photosRequired(reasonId: string | null | undefined): boolean {
  return PHOTO_REQUIRED_REASONS.includes(reasonId ?? "")
}

/** Lista do ML (/returns/reasons) → motivos válidos, na ordem recomendada. Resposta estranha → lista de reserva. */
export function parseReturnReasons(raw: unknown): ReturnReason[] {
  if (!Array.isArray(raw)) return [...FALLBACK_REASONS]
  const reasons = raw.flatMap((item: { id?: unknown; detail?: unknown; apply?: unknown; position?: unknown }) => {
    const id = typeof item?.id === "string" && /^[A-Z0-9_]{2,20}$/.test(item.id) ? item.id : null
    const label = typeof item?.detail === "string" && item.detail.trim() ? item.detail.trim().slice(0, 120) : null
    if (!id || !label) return []
    const apply = Array.isArray(item.apply) ? item.apply.filter((value): value is string => typeof value === "string") : ["order"]
    const position = Number(item.position)
    return [{ id, label, apply, position: Number.isFinite(position) ? position : 99 }]
  })
  return reasons.length ? reasons.sort((a, b) => a.position - b.position) : [...FALLBACK_REASONS]
}

/** Devolução simples: motivos de pedido. Carrinho (revisão do carrinho inteiro): só os motivos de pacote. */
export function reasonsFor(reasons: readonly ReturnReason[], isCart: boolean): ReturnReason[] {
  return reasons.filter((reason) => reason.apply.includes(isCart ? "package" : "order"))
}

export type ChecklistItem = { id: string; label: string }

/** O que o dono pode marcar ao conferir o produto (vira fatos no relato; a IA não inventa nada além disso). */
export const CHECKLISTS: Record<string, readonly ChecklistItem[]> = {
  SRF2: [
    { id: "box_damaged", label: "Embalagem amassada, rasgada ou molhada" },
    { id: "broken", label: "Produto quebrado, trincado ou amassado" },
    { id: "scratched", label: "Riscos, manchas ou marcas que não existiam" },
    { id: "not_working", label: "Não liga ou não funciona" },
    { id: "used", label: "Sinais de uso (sujeira, cheiro, desgaste)" },
  ],
  SRF3: [
    { id: "missing_parts", label: "Faltam peças ou acessórios" },
    { id: "missing_units", label: "Voltou menos unidades do que foram vendidas" },
    { id: "missing_manual", label: "Faltam manual, etiqueta ou embalagem original" },
  ],
  SRF4: [
    { id: "other_model", label: "Outro modelo, cor ou tamanho" },
    { id: "other_brand", label: "Outra marca ou produto falsificado" },
    { id: "serial_mismatch", label: "Número de série ou etiqueta diferente da venda" },
    { id: "not_mine", label: "Produto que eu não vendo" },
  ],
  SRF5: [
    { id: "empty_box", label: "A caixa chegou vazia" },
    { id: "other_object", label: "Chegou outro objeto no lugar (pedra, papel...)" },
  ],
  SRF6: [
    { id: "defect", label: "Defeito que não existia no envio" },
    { id: "tampered", label: "Lacre rompido ou produto aberto" },
    { id: "used", label: "Sinais de uso (sujeira, cheiro, desgaste)" },
  ],
  SRF7: [{ id: "not_arrived", label: "O pacote ainda não chegou até mim" }],
}

/** Fotos sugeridas por motivo (o checklist da câmera). */
export const PHOTO_GUIDE: Record<string, readonly string[]> = {
  SRF2: ["Embalagem por fora, com a etiqueta", "O dano de perto", "O produto inteiro"],
  SRF3: ["Tudo o que veio na caixa, lado a lado", "A embalagem por fora, com a etiqueta"],
  SRF4: ["O produto que chegou, com a etiqueta ou o número de série", "A embalagem por fora, com a etiqueta"],
  SRF5: ["A caixa aberta e vazia (ou o que veio dentro)", "A embalagem por fora, com a etiqueta"],
  SRF6: ["O problema de perto", "O produto inteiro", "A embalagem por fora, com a etiqueta"],
  SRF7: [],
}

export function checklistFor(reasonId: string | null | undefined): readonly ChecklistItem[] {
  return CHECKLISTS[reasonId ?? ""] ?? []
}

export function checkLabels(reasonId: string | null | undefined, ids: readonly string[]): string[] {
  const items = checklistFor(reasonId)
  return ids.flatMap((id) => items.find((item) => item.id === id)?.label ?? [])
}

export type PhotoLike = { name: string; type: string; size: number }

export function validatePhotos(photos: readonly PhotoLike[], reasonId: string | null | undefined): string | null {
  if (photosRequired(reasonId) && !photos.length) return "Para este motivo o Mercado Livre pede pelo menos uma foto."
  if (photos.length > RETURN_PHOTOS_MAX) return "Envie no máximo " + RETURN_PHOTOS_MAX + " fotos."
  for (const photo of photos) {
    if (!PHOTO_TYPES.has(photo.type)) return "Envie as fotos em JPG ou PNG (" + photo.name + ")."
    if (photo.size <= 0) return "A foto " + photo.name + " está vazia."
    if (photo.size > RETURN_PHOTO_MAX_BYTES) return "A foto " + photo.name + " passa de 5 MB."
  }
  if (photos.reduce((total, photo) => total + photo.size, 0) > RETURN_PHOTOS_TOTAL_BYTES) {
    return "As fotos passam de 4 MB no total. Envie menos fotos."
  }
  return null
}

export function validateReturnMessage(message: string): string | null {
  const trimmed = message.trim()
  if (!trimmed) return "Escreva o relato do problema."
  if (trimmed.length > RETURN_MESSAGE_MAX) return "O relato pode ter até " + RETURN_MESSAGE_MAX + " caracteres."
  if (containsExternalContact(trimmed)) return "Tire telefone, e-mail, links ou redes sociais do relato: o Mercado Livre não aceita."
  return null
}

/** Confere tudo antes de falar com o ML. null = pode enviar. */
export function validateReview(input: {
  decision: ReviewDecision
  reasonId: string | null
  message: string
  photos: readonly PhotoLike[]
  reasons: readonly ReturnReason[]
  isCart: boolean
}): string | null {
  if (input.decision === "ok") return null
  const reason = reasonsFor(input.reasons, input.isCart).find((item) => item.id === input.reasonId)
  if (!reason) return "Escolha o motivo do problema."
  return validateReturnMessage(input.message) ?? validatePhotos(input.photos, reason.id)
}

/** Corpo do POST return-review. */
export function reviewPayload(
  decision: ReviewDecision,
  fail?: { reasonId: string; message: string; attachments: readonly string[] }
): Record<string, never> | { reason: string; message: string; attachments?: string[] }[] {
  if (decision === "ok" || !fail) return {}
  return [
    {
      reason: fail.reasonId,
      message: fail.message.trim(),
      ...(fail.attachments.length ? { attachments: [...fail.attachments] } : {}),
    },
  ]
}

/** Relato sem IA (pausa da IA, falha ou o dono preferir): só os fatos marcados. */
export function fallbackReturnMessage(input: { reasonLabel: string; checks: readonly string[]; notes: string; photos: number }): string {
  const parts = ["Recebi a devolução e, ao conferir, constatei: " + input.reasonLabel.replace(/\.$/, "") + "."]
  if (input.checks.length) parts.push("Detalhes: " + input.checks.map((item) => item.toLowerCase()).join("; ") + ".")
  const notes = input.notes.trim().replace(/\s+/g, " ")
  if (notes) parts.push(notes.endsWith(".") ? notes : notes + ".")
  if (input.photos > 0) parts.push(input.photos === 1 ? "Envio a foto como evidência." : "Envio " + input.photos + " fotos como evidência.")
  parts.push("Peço a análise do caso.")
  return parts.join(" ").slice(0, RETURN_MESSAGE_MAX)
}
