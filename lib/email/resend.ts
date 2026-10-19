import "server-only"

import { serverEnv } from "@/lib/env"

// E-mails transacionais pela API do Resend (https://resend.com/docs/api-reference/emails/send-email). O domínio
// maanu.com.br já está verificado no Resend (é ele que entrega os e-mails do login). Sem RESEND_API_KEY, nada é enviado.

export const ALERTS_FROM = "maanu <alertas@maanu.com.br>"

export function emailEnabled(): boolean {
  return Boolean(serverEnv.resendApiKey())
}

export type SendEmailResult = { ok: true; id: string | null } | { ok: false; error: string }

export async function sendEmail(input: {
  to: string
  subject: string
  html: string
  text: string
  /** Mesma chave = o Resend não manda de novo (proteção contra repetição). */
  idempotencyKey?: string
}): Promise<SendEmailResult> {
  const key = serverEnv.resendApiKey()
  if (!key) return { ok: false, error: "RESEND_API_KEY ausente." }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: "Bearer " + key,
        "content-type": "application/json",
        ...(input.idempotencyKey ? { "idempotency-key": input.idempotencyKey.slice(0, 256) } : {}),
      },
      body: JSON.stringify({ from: ALERTS_FROM, to: [input.to], subject: input.subject, html: input.html, text: input.text }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    })
    const data = (await response.json().catch(() => null)) as { id?: unknown; message?: unknown } | null
    if (!response.ok) {
      const message = typeof data?.message === "string" ? data.message : "HTTP " + response.status
      return { ok: false, error: ("Resend: " + message).slice(0, 300) }
    }
    return { ok: true, id: typeof data?.id === "string" ? data.id : null }
  } catch (error) {
    return { ok: false, error: ("Resend: " + (error instanceof Error ? error.message : String(error))).slice(0, 300) }
  }
}
