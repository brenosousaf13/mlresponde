import { containsExternalContact } from "@/lib/answers/compose"
import { RETURN_MESSAGE_MAX, fallbackReturnMessage } from "@/lib/recovery/review"

/**
 * Relato da revisão de devolução pela IA (puro, testado em tests/unit/recovery.test.ts). A IA só escreve, a partir do
 * motivo e do que o dono marcou: não vê as fotos (fase futura), não inventa dano e não põe contato externo. O dono lê,
 * edita e decide; nada é enviado sozinho.
 */

export type ReturnMessageInput = {
  storeName: string
  reasonLabel: string
  checks: string[]
  notes: string
  photos: number
  itemTitle: string | null
  quantity: number | null
}

export const RETURN_MESSAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { message: { type: "string" } },
  required: ["message"],
} as const

export function buildReturnMessageSystemPrompt(storeName: string): string {
  return [
    "Você escreve, para a loja \"" + storeName + "\" (vendedora no Mercado Livre Brasil), o relato da revisão de uma devolução que chegou com problema.",
    "O relato vai para a equipe do Mercado Livre que decide se o vendedor é ressarcido.",
    "",
    "Regras:",
    "- Português do Brasil, primeira pessoa (o vendedor), tom objetivo e educado. Até 600 caracteres.",
    "- Use SÓ os fatos informados (motivo, itens marcados e observações do vendedor). Nunca invente dano, peça, data, valor ou estado do produto.",
    "- Se houver fotos, diga que elas vão anexadas. Se não houver, não mencione fotos.",
    "- Não acuse o comprador de má-fé nem use adjetivos fortes. Descreva o que foi constatado.",
    "- Proibido contato fora do Mercado Livre: nada de telefone, WhatsApp, e-mail, links ou redes sociais.",
    "- Termine pedindo a análise do caso.",
  ].join("\n")
}

export function buildReturnMessageUserPrompt(input: ReturnMessageInput): string {
  return [
    "Produto: " + (input.itemTitle ?? "(não informado)") + (input.quantity ? " · " + input.quantity + " unidade(s)" : ""),
    "Motivo escolhido: " + input.reasonLabel,
    "O que o vendedor marcou ao conferir: " + (input.checks.length ? input.checks.join("; ") : "(nada marcado)"),
    "Observações do vendedor: " + (input.notes.trim() ? input.notes.trim().slice(0, 600) : "(nenhuma)"),
    "Fotos anexadas: " + input.photos,
  ].join("\n")
}

export function buildReturnMessageMessages(input: ReturnMessageInput) {
  return [
    { role: "system" as const, content: buildReturnMessageSystemPrompt(input.storeName) },
    { role: "user" as const, content: buildReturnMessageUserPrompt(input) },
  ]
}

/** Valida o texto da IA: limite de tamanho e nada de contato externo. Inválido → relato sem IA (só os fatos). */
export function normalizeReturnMessage(raw: unknown, input: ReturnMessageInput): { message: string; fromAi: boolean } {
  const text = typeof (raw as { message?: unknown } | null)?.message === "string" ? ((raw as { message: string }).message).trim() : ""
  const clipped = text.length > RETURN_MESSAGE_MAX ? text.slice(0, RETURN_MESSAGE_MAX - 1).trimEnd() + "…" : text
  if (!clipped || containsExternalContact(clipped)) {
    return {
      message: fallbackReturnMessage({ reasonLabel: input.reasonLabel, checks: input.checks, notes: input.notes, photos: input.photos }),
      fromAi: false,
    }
  }
  return { message: clipped, fromAi: true }
}
