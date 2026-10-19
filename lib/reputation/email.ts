import type { AlertKind } from "@/lib/reputation/alerts"

/**
 * E-mails dos alertas urgentes do Escudo (puro, testado). Um e-mail por conta e tipo, com os alertas juntos.
 * HTML simples (estilos inline, sem imagens externas) + versão em texto.
 */

export type EmailAlertItem = { title: string; body: string }

export type AlertEmail = { subject: string; html: string; text: string }

const SUBJECTS: Partial<Record<AlertKind, (count: number) => string>> = {
  shipment_late: (count) => (count === 1 ? "Envio atrasado" : count + " envios atrasados"),
  shipment_at_risk: (count) => (count === 1 ? "Despacho perto do prazo" : count + " despachos perto do prazo"),
  margin_low: () => "Sua reputação está no limite da cor",
  color_dropped: () => "Sua reputação caiu de cor",
  claim_new: (count) => (count === 1 ? "Reclamação nova" : count + " reclamações novas"),
  claim_due_soon: (count) => (count === 1 ? "Prazo de reclamação vencendo" : count + " prazos de reclamação vencendo"),
}

const INTROS: Partial<Record<AlertKind, string>> = {
  shipment_late: "Estes envios passaram do prazo de despacho. Envio atrasado conta na sua reputação:",
  shipment_at_risk: "Estes envios precisam ser despachados logo para não contarem como atraso:",
  margin_low: "Mais um problema e a cor do seu termômetro cai:",
  color_dropped: "A cor do seu termômetro mudou:",
  claim_new: "Chegou reclamação nova. Responder rápido ajuda a não afetar a reputação:",
  claim_due_soon: "Estas reclamações têm uma ação obrigatória vencendo em menos de 24 horas:",
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

export function alertEmailSubject(kind: AlertKind, count: number, accountName: string): string {
  const base = (SUBJECTS[kind] ?? (() => "Alerta da sua reputação"))(count)
  return base + " na " + accountName + " · maanu"
}

export function buildAlertEmail(input: {
  kind: AlertKind
  accountName: string
  storeName: string
  items: readonly EmailAlertItem[]
  url: string
}): AlertEmail {
  const items = input.items.slice(0, 20)
  const extra = input.items.length - items.length
  const subject = alertEmailSubject(input.kind, input.items.length, input.accountName)
  const intro = INTROS[input.kind] ?? "Veja os alertas da sua reputação:"

  const text = [
    "Olá! Aqui é a maanu, cuidando da reputação da " + input.accountName + " (" + input.storeName + ").",
    "",
    intro,
    "",
    ...items.flatMap((item) => ["• " + item.title, "  " + item.body]),
    ...(extra > 0 ? ["• e mais " + extra + " na maanu"] : []),
    "",
    "Abrir na maanu: " + input.url,
    "",
    "Você recebe este e-mail porque os alertas por e-mail do Escudo de Reputação estão ligados. Dá para desligar na tela Reputação.",
  ].join("\n")

  const list = items
    .map(
      (item) =>
        '<tr><td style="padding:12px 0;border-top:1px solid #e2e8f0">' +
        '<div style="font-weight:600;color:#0f172a">' +
        escapeHtml(item.title) +
        "</div>" +
        '<div style="margin-top:4px;color:#475569">' +
        escapeHtml(item.body) +
        "</div></td></tr>"
    )
    .join("")

  const html =
    '<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:28px">' +
    '<tr><td style="font-size:22px;font-weight:700;color:#0f172a">maanu<span style="color:#1faf9a">.</span></td></tr>' +
    '<tr><td style="padding-top:16px;font-size:18px;font-weight:600;color:#0f172a">' +
    escapeHtml(subject.replace(/ · maanu$/, "")) +
    "</td></tr>" +
    '<tr><td style="padding-top:8px;color:#334155">' +
    escapeHtml(intro) +
    "</td></tr>" +
    '<tr><td style="padding-top:8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">' +
    list +
    (extra > 0 ? '<tr><td style="padding:12px 0;border-top:1px solid #e2e8f0;color:#475569">e mais ' + extra + " na maanu</td></tr>" : "") +
    "</table></td></tr>" +
    '<tr><td style="padding-top:20px"><a href="' +
    escapeHtml(input.url) +
    '" style="display:inline-block;background:#009682;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">Abrir a Reputação na maanu</a></td></tr>' +
    '<tr><td style="padding-top:24px;font-size:12px;color:#64748b">' +
    escapeHtml(input.storeName) +
    " · Você recebe este e-mail porque os alertas por e-mail do Escudo de Reputação estão ligados. Dá para desligar na tela Reputação.</td></tr>" +
    "</table></td></tr></table></body></html>"

  return { subject, html, text }
}

/** Link da tela Reputação de uma conta. */
export function reputationUrl(siteUrl: string, accountId: string): string {
  return siteUrl.replace(/\/$/, "") + "/reputacao?conta=" + encodeURIComponent(accountId)
}
