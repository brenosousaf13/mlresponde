import { containsExternalContact } from "@/lib/answers/compose"
import { RETURN_MESSAGE_MAX, fallbackReturnMessage } from "@/lib/recovery/review"

/**
 * Relato da revisão de devolução pela IA (puro, testado em tests/unit/recovery.test.ts). A IA só escreve, a partir do
 * motivo, do que o dono marcou e (na contestação da revisão do armazém) do que o comprador declarou e do que o ML
 * registrou: não vê as fotos (quem olha as fotos é a conferência com visão, photo-review.ts, antes do envio), não inventa
 * dano e não põe contato externo. O dono lê, edita e decide; nada é enviado sozinho. O fluxo chama este relato sozinho quando
 * o motivo e o que o dono viu estão escolhidos; o botão "Escrever de novo com a IA" regenera.
 */

export type ReturnMessageInput = {
  storeName: string
  reasonLabel: string
  checks: string[]
  notes: string
  photos: number
  itemTitle: string | null
  quantity: number | null
  /** Contestação da revisão do armazém do ML (o vendedor pode não ter o produto em mãos). */
  appeal?: boolean
  /** Motivo declarado pelo comprador ao abrir a devolução (texto do ML). */
  buyerReason?: string | null
  /** O que o armazém do ML registrou na revisão (texto do ML). */
  warehouseVerdict?: string | null
}

export const RETURN_MESSAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { message: { type: "string" } },
  required: ["message"],
} as const

export function buildReturnMessageSystemPrompt(storeName: string, appeal = false): string {
  return [
    appeal
      ? "Você escreve, para a loja \"" + storeName + "\" (vendedora no Mercado Livre Brasil), a contestação da revisão que o armazém do Mercado Livre fez numa devolução: o armazém marcou o produto como sem condição de venda e devolveu o dinheiro ao comprador."
      : "Você escreve, para a loja \"" + storeName + "\" (vendedora no Mercado Livre Brasil), o relato da revisão de uma devolução que chegou com problema.",
    "O relato vai para a equipe do Mercado Livre que decide se o vendedor é ressarcido.",
    "",
    "Regras:",
    "- Português do Brasil, primeira pessoa (o vendedor), tom objetivo e educado. Até 600 caracteres.",
    "- Use SÓ os fatos informados (motivo, itens marcados e observações do vendedor). Nunca invente dano, peça, data, valor ou estado do produto.",
    "- Se houver fotos, diga que elas vão anexadas. Se não houver, não mencione fotos.",
    "- Não acuse o comprador de má-fé nem use adjetivos fortes. Descreva o que foi constatado.",
    "- Proibido contato fora do Mercado Livre: nada de telefone, WhatsApp, e-mail, links ou redes sociais.",
    "- Termine pedindo a análise do caso" + (appeal ? " e o ressarcimento do valor da venda." : "."),
    ...(appeal
      ? [
          "- Na contestação, cite o motivo que o comprador declarou e o que o armazém registrou só como estão no texto (não acrescente nada) e explique, com os fatos do vendedor, por que o produto voltou fora das condições em que foi enviado.",
        ]
      : []),
  ].join("\n")
}

export function buildReturnMessageUserPrompt(input: ReturnMessageInput): string {
  return [
    "Produto: " + (input.itemTitle ?? "(não informado)") + (input.quantity ? " · " + input.quantity + " unidade(s)" : ""),
    "Motivo escolhido: " + input.reasonLabel,
    "O que o vendedor marcou ao conferir: " + (input.checks.length ? input.checks.join("; ") : "(nada marcado)"),
    "Observações do vendedor: " + (input.notes.trim() ? input.notes.trim().slice(0, 600) : "(nenhuma)"),
    "Fotos anexadas: " + input.photos,
    ...(input.appeal
      ? [
          "Motivo declarado pelo comprador: " + (input.buyerReason?.trim() ? input.buyerReason.trim().slice(0, 300) : "(não informado)"),
          "O que o armazém do Mercado Livre registrou: " +
            (input.warehouseVerdict?.trim() ? input.warehouseVerdict.trim().slice(0, 400) : "(não informado)"),
        ]
      : []),
  ].join("\n")
}

export function buildReturnMessageMessages(input: ReturnMessageInput) {
  return [
    { role: "system" as const, content: buildReturnMessageSystemPrompt(input.storeName, Boolean(input.appeal)) },
    { role: "user" as const, content: buildReturnMessageUserPrompt(input) },
  ]
}

/** Valida o texto da IA: limite de tamanho e nada de contato externo. Inválido → relato sem IA (só os fatos). */
export function normalizeReturnMessage(raw: unknown, input: ReturnMessageInput): { message: string; fromAi: boolean } {
  const text = typeof (raw as { message?: unknown } | null)?.message === "string" ? ((raw as { message: string }).message).trim() : ""
  const clipped = text.length > RETURN_MESSAGE_MAX ? text.slice(0, RETURN_MESSAGE_MAX - 1).trimEnd() + "…" : text
  if (!clipped || containsExternalContact(clipped)) {
    return {
      message: fallbackReturnMessage({
        reasonLabel: input.reasonLabel,
        checks: input.checks,
        notes: input.notes,
        photos: input.photos,
        appeal: input.appeal,
      }),
      fromAi: false,
    }
  }
  return { message: clipped, fromAi: true }
}
