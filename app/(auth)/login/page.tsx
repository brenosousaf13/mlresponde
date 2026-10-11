import type { Metadata } from "next"

import { AuthShell, LegalFootnote } from "@/components/auth/auth-shell"
import { LoginForm } from "@/components/auth/login-form"
import { safeRedirectPath } from "@/lib/validation/forms"

export const metadata: Metadata = { title: "Entrar" }

const NOTICES: Record<string, { ok?: boolean; message: string }> = {
  "link-invalido": { message: "Esse link é inválido ou já expirou. Entre com seu e-mail e senha." },
  "senha-atualizada": { ok: true, message: "Senha atualizada. Entre com a nova senha." },
  confirmado: { ok: true, message: "E-mail confirmado! Entre com seu e-mail e senha para continuar." },
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams
  const next = safeRedirectPath(params.next, "")
  const notice = typeof params.erro === "string" ? NOTICES[params.erro] : undefined

  return (
    <AuthShell>
      <LoginForm next={next || undefined} notice={notice} />
      <LegalFootnote />
    </AuthShell>
  )
}
