import { ArrowLeftIcon, ShieldCheckIcon } from "lucide-react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { MfaCodeForm } from "@/components/admin/mfa-code-form"
import { MfaEnroll } from "@/components/admin/mfa-enroll"
import { SignOutButton } from "@/components/admin/sign-out-button"
import { LogoWordmark } from "@/components/brand/logo"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { appHomeHref } from "@/lib/admin/host"
import { evaluateAdminSession, lastTotpVerification } from "@/lib/admin/session"
import { getAdminIdentity } from "@/lib/dal/admin"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Verificação em 2 etapas" }

export default async function AdminVerificationPage() {
  const identity = await getAdminIdentity()
  if (evaluateAdminSession(identity.claims) === "ok") redirect("/admin")

  const supabase = await createClient()
  const { data: factors, error } = await supabase.auth.mfa.listFactors()
  if (error) throw error
  const enrolled = factors.totp.length > 0
  const expired = enrolled && lastTotpVerification(identity.claims) !== null

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-brand-graphite p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center justify-center gap-2 text-brand-offwhite">
          <LogoWordmark className="h-7 text-brand-offwhite" />
          <Badge variant="outline" className="border-brand-teal/50 text-brand-teal">
            admin
          </Badge>
        </div>
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-1 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShieldCheckIcon className="size-5" />
            </div>
            <CardTitle className="text-xl">
              {enrolled ? "Digite o código do app autenticador" : "Ative a verificação em 2 etapas"}
            </CardTitle>
            <CardDescription>
              {enrolled
                ? expired
                  ? "Por segurança, o painel pede o código de novo a cada 12 horas."
                  : "O painel do administrador exige a verificação em 2 etapas a cada acesso."
                : "O painel do administrador só abre com o código do celular, além da senha. É feito uma vez; depois, só o código."}
            </CardDescription>
          </CardHeader>
          <CardContent>{enrolled ? <MfaCodeForm submitLabel="Entrar no painel" /> : <MfaEnroll />}</CardContent>
          <CardFooter className="flex-col gap-2 text-xs text-muted-foreground">
            <span>
              Entrando como <strong className="font-medium text-foreground">{identity.email}</strong>
            </span>
            <div className="flex items-center gap-4">
              <a
                href={appHomeHref(process.env.ADMIN_HOST, process.env.NEXT_PUBLIC_SITE_URL)}
                className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
              >
                <ArrowLeftIcon className="size-3.5" />
                Voltar para o app
              </a>
              <SignOutButton />
            </div>
          </CardFooter>
        </Card>
        <p className="text-center text-xs text-balance text-brand-slate">
          Perdeu o celular? A verificação pode ser removida no banco de dados (veja o CEREBRO.md, painel do administrador).
        </p>
      </div>
    </div>
  )
}
