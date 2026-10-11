import { MailCheckIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { AuthShell } from "@/components/auth/auth-shell"
import { ResendConfirmationForm } from "@/components/auth/resend-confirmation-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata: Metadata = { title: "Confirme seu e-mail" }

export default async function VerifyEmailPage({ searchParams }: PageProps<"/verificar-email">) {
  const params = await searchParams
  const email = typeof params.email === "string" ? params.email.slice(0, 254) : ""

  return (
    <AuthShell>
      <Card>
        <CardHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MailCheckIcon className="size-6" />
          </div>
          <CardTitle className="text-xl">Confirme seu e-mail</CardTitle>
          <CardDescription className="text-balance">
            {email ? (
              <>
                Enviamos um link de confirmação para <strong className="text-foreground">{email}</strong>.
              </>
            ) : (
              "Enviamos um link de confirmação para o seu e-mail."
            )}{" "}
            Clique nele para ativar sua conta e começar o teste grátis.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-center text-sm text-muted-foreground">
            Não chegou? Confira a caixa de spam ou promoções.
          </p>
          {email ? <ResendConfirmationForm email={email} /> : null}
          <Link href="/login" className="text-center text-sm underline underline-offset-4">
            Voltar para o login
          </Link>
        </CardContent>
      </Card>
    </AuthShell>
  )
}
