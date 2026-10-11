import type { Metadata } from "next"

import { AuthShell } from "@/components/auth/auth-shell"
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form"

export const metadata: Metadata = { title: "Recuperar senha" }

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/recuperar-senha">) {
  const params = await searchParams
  const notices: Record<string, { message: string }> = {
    "link-invalido": { message: "Esse link é inválido ou já expirou. Peça um novo abaixo." },
    "outro-navegador": {
      message: "Abra o link no mesmo navegador em que você pediu a nova senha. Peça um novo link abaixo.",
    },
  }
  const notice = typeof params.erro === "string" ? notices[params.erro] : undefined

  return (
    <AuthShell>
      <ForgotPasswordForm notice={notice} />
    </AuthShell>
  )
}
