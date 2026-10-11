import type { Metadata } from "next"

import { PageHeader } from "@/components/app/page-header"
import {
  OrganizationForm,
  PasswordForm,
  ProfileForm,
} from "@/components/configuracoes/settings-forms"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { canManageOrganization, requireSection } from "@/lib/dal/app-context"
import { formatWhatsapp } from "@/lib/validation/forms"

export const metadata: Metadata = { title: "Configurações" }

export default async function SettingsPage() {
  const context = await requireSection("configuracoes")

  return (
    <>
      <PageHeader title="Configurações" description="Seus dados de acesso e da sua loja." />
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
          {canManageOrganization(context.role) ? (
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
      </div>
    </>
  )
}
