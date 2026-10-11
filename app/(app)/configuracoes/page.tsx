import type { Metadata } from "next"

import { updateBillingProfile } from "@/app/(app)/configuracoes/actions"
import { PageHeader } from "@/components/app/page-header"
import { BillingProfileForm } from "@/components/billing/billing-profile-form"
import {
  OrganizationForm,
  PasswordForm,
  ProfileForm,
} from "@/components/configuracoes/settings-forms"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { maskPostalCode } from "@/lib/billing/documents"
import { canManageOrganization, requireSection } from "@/lib/dal/app-context"
import { getBillingProfile } from "@/lib/dal/billing"
import { formatWhatsapp } from "@/lib/validation/forms"

export const metadata: Metadata = { title: "Configurações" }

export default async function SettingsPage() {
  const context = await requireSection("configuracoes")
  const canManage = canManageOrganization(context.role)
  const billing = canManage ? await getBillingProfile(context.organization.id) : null

  return (
    <>
      <PageHeader title="Configurações" description="Seus dados de acesso, da sua loja e de cobrança." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Seus dados</CardTitle>
            <CardDescription>Como falamos com você.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm
              fullName={context.profile.fullName}
              whatsapp={formatWhatsapp(context.profile.whatsapp)}
              email={context.user.email}
            />
          </CardContent>
        </Card>
        <div className="flex flex-col gap-6">
          {canManage ? (
            <Card>
              <CardHeader>
                <CardTitle>Sua loja</CardTitle>
                <CardDescription>Nome exibido no painel.</CardDescription>
              </CardHeader>
              <CardContent>
                <OrganizationForm storeName={context.organization.name} />
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>Senha</CardTitle>
              <CardDescription>Use pelo menos 8 caracteres.</CardDescription>
            </CardHeader>
            <CardContent>
              <PasswordForm />
            </CardContent>
          </Card>
        </div>
        {canManage ? (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Dados de cobrança</CardTitle>
              <CardDescription>
                CPF ou CNPJ e endereço usados na cobrança e na nota fiscal da assinatura.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BillingProfileForm
                action={updateBillingProfile}
                defaults={{
                  documentType: billing?.documentType ?? "cpf",
                  document: "",
                  legalName: billing?.legalName ?? context.profile.fullName,
                  postalCode: billing ? maskPostalCode(billing.postalCode) : "",
                  street: billing?.street ?? "",
                  addressNumber: billing?.addressNumber ?? "",
                  complement: billing?.complement ?? "",
                  district: billing?.district ?? "",
                  city: billing?.city ?? "",
                  state: billing?.state ?? "",
                }}
                lockedDocument={
                  billing
                    ? { type: billing.documentType, document: billing.document, registeredAt: billing.registeredAt }
                    : null
                }
                personName={context.profile.fullName}
                accountEmail={context.user.email}
                submitLabel={billing ? "Salvar alterações" : "Salvar dados de cobrança"}
                columns
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  )
}
