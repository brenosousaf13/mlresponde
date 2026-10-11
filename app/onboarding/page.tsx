import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { AuthShell } from "@/components/auth/auth-shell"
import { OnboardingForm } from "@/components/onboarding/onboarding-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getAppContext } from "@/lib/dal/app-context"
import { formatWhatsapp } from "@/lib/validation/forms"

export const metadata: Metadata = { title: "Bem-vindo" }

export default async function OnboardingPage() {
  const context = await getAppContext()
  if (context.profile.onboardingCompletedAt) redirect("/painel")

  const firstName = context.profile.fullName.split(" ")[0]
  const storeName = context.organization.name === "Minha loja" ? "" : context.organization.name

  return (
    <AuthShell wide>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">
            {firstName ? `Boas-vindas, ${firstName}!` : "Boas-vindas!"}
          </CardTitle>
          <CardDescription>
            Só mais dois dados para preparar sua conta. Seu teste grátis já começou.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingForm
            defaultStoreName={storeName}
            defaultWhatsapp={formatWhatsapp(context.profile.whatsapp)}
          />
        </CardContent>
      </Card>
    </AuthShell>
  )
}
