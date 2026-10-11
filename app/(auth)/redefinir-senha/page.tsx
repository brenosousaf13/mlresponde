import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { AuthShell } from "@/components/auth/auth-shell"
import { ResetPasswordForm } from "@/components/auth/reset-password-form"
import { getCurrentUser } from "@/lib/dal/app-context"

export const metadata: Metadata = { title: "Nova senha" }

export default async function ResetPasswordPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/recuperar-senha?erro=link-invalido")

  return (
    <AuthShell>
      <ResetPasswordForm />
    </AuthShell>
  )
}
