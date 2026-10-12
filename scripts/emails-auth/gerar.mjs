// Gera os e-mails do Supabase Auth (português, marca maanu) em supabase/templates/ e imprime o corpo JSON para a
// Management API (PATCH /v1/projects/{ref}/config/auth). Uso:
//   node scripts/emails-auth/gerar.mjs > <arquivo temporário>.json   (depois a IA envia o JSON pela API)
// Só funciona com SMTP próprio ligado no Supabase (no plano grátis os modelos padrão não são editáveis sem SMTP).
// Os links usam token_hash e passam por /auth/confirm (app/auth/confirm/route.ts): funcionam em qualquer navegador,
// inclusive quando o cliente abre o e-mail no celular.
import { mkdirSync, writeFileSync } from "node:fs"

const confirmUrl = (type, next) =>
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=${type}&next=${encodeURIComponent(next)}`

const escapeAttr = (value) => value.replace(/&/g, "&amp;")

function layout({ title, heading, intro, body }) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#F8FAFC;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:32px 16px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0F172A;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
<tr><td style="padding:0 4px 20px;font-size:26px;font-weight:700;letter-spacing:-0.5px;color:#0F172A;">maanu<span style="color:#1FAF9A;">.</span></td></tr>
<tr><td style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;padding:32px;">
<h1 style="margin:0 0 12px;font-size:20px;line-height:28px;font-weight:700;color:#0F172A;">${heading}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:24px;color:#334155;">${intro}</p>
${body}
</td></tr>
<tr><td style="padding:20px 4px 0;font-size:12px;line-height:18px;color:#94A3B8;">maanu &middot; Respostas automáticas com IA para marketplaces<br>Você recebeu este e-mail porque ele foi usado na maanu. Se não foi você, pode ignorar.</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`
}

function withButton({ url, cta, note }) {
  return `<a href="${escapeAttr(url)}" style="display:inline-block;background:#009682;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;line-height:20px;padding:12px 20px;border-radius:8px;">${cta}</a>
<p style="margin:24px 0 0;font-size:13px;line-height:20px;color:#64748B;">${note}</p>
<p style="margin:16px 0 0;font-size:12px;line-height:18px;color:#94A3B8;word-break:break-all;">Se o botão não funcionar, copie e cole este endereço no navegador:<br>${escapeAttr(url)}</p>`
}

const templates = {
  confirmation: {
    subject: "Confirme seu e-mail na maanu",
    html: layout({
      title: "Confirme seu e-mail",
      heading: "Confirme seu e-mail",
      intro: "Falta só um passo para criar sua conta na maanu: confirme que este e-mail é seu.",
      body: withButton({ url: confirmUrl("email", "/onboarding"), cta: "Confirmar e-mail", note: "O link vale por 1 hora." }),
    }),
  },
  recovery: {
    subject: "Crie uma nova senha na maanu",
    html: layout({
      title: "Crie uma nova senha",
      heading: "Crie uma nova senha",
      intro: "Recebemos um pedido para trocar a senha da sua conta na maanu.",
      body: withButton({
        url: confirmUrl("recovery", "/redefinir-senha"),
        cta: "Criar nova senha",
        note: "O link vale por 1 hora. Se você não pediu a troca, ignore este e-mail: sua senha continua a mesma.",
      }),
    }),
  },
  email_change: {
    subject: "Confirme a troca de e-mail na maanu",
    html: layout({
      title: "Confirme a troca de e-mail",
      heading: "Confirme a troca de e-mail",
      intro: "Pediram para trocar o e-mail de acesso da conta na maanu de {{ .Email }} para {{ .NewEmail }}.",
      body: withButton({
        url: confirmUrl("email_change", "/configuracoes"),
        cta: "Confirmar troca",
        note: "O link vale por 1 hora. Se você não pediu a troca, ignore este e-mail e fale com o suporte.",
      }),
    }),
  },
  magic_link: {
    subject: "Seu link de acesso à maanu",
    html: layout({
      title: "Seu link de acesso",
      heading: "Seu link de acesso",
      intro: "Use o botão abaixo para entrar na sua conta da maanu.",
      body: withButton({ url: confirmUrl("email", "/painel"), cta: "Entrar na maanu", note: "O link vale por 1 hora e só pode ser usado uma vez." }),
    }),
  },
  invite: {
    subject: "Você foi convidado para a maanu",
    html: layout({
      title: "Convite para a maanu",
      heading: "Você foi convidado para a maanu",
      intro: "Aceite o convite e crie uma senha para acessar a conta.",
      body: withButton({ url: confirmUrl("invite", "/redefinir-senha"), cta: "Aceitar convite", note: "O link vale por 1 hora." }),
    }),
  },
  reauthentication: {
    subject: "Seu código de confirmação da maanu",
    html: layout({
      title: "Seu código de confirmação",
      heading: "Seu código de confirmação",
      intro: "Use este código para confirmar a ação na maanu:",
      body: `<p style="margin:0;font-size:28px;line-height:36px;font-weight:700;letter-spacing:6px;color:#0F172A;">{{ .Token }}</p>
<p style="margin:24px 0 0;font-size:13px;line-height:20px;color:#64748B;">Se não foi você, ignore este e-mail.</p>`,
    }),
  },
  // Avisos de segurança (sem link de ação): ligados por mailer_notifications_*_enabled abaixo.
  password_changed_notification: {
    subject: "A senha da sua conta na maanu foi alterada",
    html: layout({
      title: "Senha alterada",
      heading: "Sua senha foi alterada",
      intro: "A senha da conta {{ .Email }} na maanu acabou de ser alterada.",
      body: withButton({
        url: "{{ .SiteURL }}/recuperar-senha",
        cta: "Não fui eu: criar nova senha",
        note: "Se foi você, está tudo certo e não precisa fazer nada.",
      }),
    }),
  },
  email_changed_notification: {
    subject: "O e-mail da sua conta na maanu foi trocado",
    html: layout({
      title: "E-mail trocado",
      heading: "O e-mail da sua conta foi trocado",
      intro: "O e-mail de acesso da sua conta na maanu foi trocado de {{ .OldEmail }} para {{ .Email }}.",
      body: `<p style="margin:0;font-size:13px;line-height:20px;color:#64748B;">Se não foi você, responda este e-mail ou fale com o suporte da maanu agora.</p>`,
    }),
  },
}

mkdirSync("supabase/templates", { recursive: true })
const payload = {}
for (const [name, { subject, html }] of Object.entries(templates)) {
  writeFileSync(`supabase/templates/${name}.html`, html)
  payload[`mailer_subjects_${name}`] = subject
  payload[`mailer_templates_${name}_content`] = html
}
payload.mailer_notifications_password_changed_enabled = true
payload.mailer_notifications_email_changed_enabled = true
process.stdout.write(JSON.stringify(payload))