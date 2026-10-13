import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { signOut } from "@/app/(auth)/actions"
import { completeBillingStep } from "@/app/onboarding/actions"
import { AuthShell } from "@/components/auth/auth-shell"
import { BillingProfileForm } from "@/components/billing/billing-profile-form"
import { OnboardingForm } from "@/components/onboarding/onboarding-form"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ONBOARDING_HOLDER_COPY } from "@/lib/billing/copy"
import { getAppContext, needsOnboarding } from "@/lib/dal/app-context"
import { formatWhatsapp } from "@/lib/validation/forms"

export const metadata: Metadata = { title: "Complete seu cadastro" }

function StepLabel({ current, total }: { current: number; total: number }) {
  return (
    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
      Etapa {current} de {total}
    </p>
  )
}

function SignOutFootnote({ email }: { email: string }) {
  return (
    <form action={signOut} className="text-center text-sm text-muted-foreground">
      Conectado como {email}.{" "}
      <button type="submit" className="underline underline-offset-4 hover:text-foreground">
        Sair
      </button>
    </form>
  )
}

/**
 * Cadastro depois de confirmar o e-mail. Etapa 1: nome da loja + WhatsApp. Etapa 2: CPF/CNPJ + endereço do titular
 * (só para quem administra a loja). Contas antigas, já com a etapa 1 feita, veem só a etapa 2.
 * Quem está começando o teste grátis não vê textos de cobrança/nota fiscal (`lib/billing/copy.ts`).
 */
export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const context = await getAppContext()
  if (!needsOnboarding(context)) redirect("/painel")
  const { etapa } = await searchParams

  const storePending = !context.profile.onboardingCompletedAt
  const billingPending = context.billing.required && !context.billing.completed
  const step =
    storePending && (!context.profile.whatsapp || etapa === "loja" || !billingPending) ? "loja" : "cobranca"
  const totalSteps = storePending && billingPending ? 2 : 1
  const firstName = context.profile.fullName.split(" ")[0]
  const holderCopy = storePending ? ONBOARDING_HOLDER_COPY.firstTime : ONBOARDING_HOLDER_COPY.existing

  if (step === "loja") {
    const storeName = context.organization.name === "Minha loja" ? "" : context.organization.name
    return (
      <AuthShell wide>
        <Card>
          <CardHeader className="text-center">
            {totalSteps > 1 ? <StepLabel current={1} total={totalSteps} /> : null}
            <CardTitle className="text-xl">
              {firstName ? `Boas-vindas, ${firstName}!` : "Boas-vindas!"}
            </CardTitle>
            <CardDescription>
              Seu teste grátis já começou. Primeiro, conte qual é a sua loja e como falamos com você.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OnboardingForm
              defaultStoreName={storeName}
              defaultWhatsapp={formatWhatsapp(context.profile.whatsapp)}
              submitLabel={billingPending ? "Continuar" : "Concluir"}
            />
          </CardContent>
        </Card>
        <SignOutFootnote email={context.user.email} />
      </AuthShell>
    )
  }

  return (
    <AuthShell size="lg">
      <Card>
        <CardHeader className="text-center">
          {totalSteps > 1 ? <StepLabel current={2} total={totalSteps} /> : null}
          <CardTitle className="text-xl">{holderCopy.title}</CardTitle>
          <CardDescription className="text-balance">{holderCopy.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <BillingProfileForm
            action={completeBillingStep}
            defaults={{
              documentType: "cpf",
              document: "",
              legalName: context.profile.fullName,
              postalCode: "",
              street: "",
              addressNumber: "",
              complement: "",
              district: "",
              city: "",
              state: "",
            }}
            lockedDocument={null}
            personName={context.profile.fullName}
            accountEmail={context.user.email}
            submitLabel={holderCopy.submitLabel}
            variant="signup"
          />
          {storePending ? (
            <Link href="/onboarding?etapa=loja" className={buttonVariants({ variant: "ghost", className: "w-full" })}>
              Voltar
            </Link>
          ) : null}
        </CardContent>
      </Card>
      <p className="px-6 text-center text-xs text-balance text-muted-foreground">
        {ONBOARDING_HOLDER_COPY.privacyNotice}{" "}
        <Link href="/privacidade" target="_blank" className="underline underline-offset-4 hover:text-primary">
          Política de Privacidade
        </Link>
        .
      </p>
      <SignOutFootnote email={context.user.email} />
    </AuthShell>
  )
}
