import { cn } from "cn"
import { ArrowLeftIcon, ShieldXIcon } from "lucide-react"
import type { Metadata } from "next"

import { AuthShell } from "@/components/auth/auth-shell"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { appHomeHref } from "@/lib/admin/host"
import { requireUser } from "@/lib/dal/app-context"

export const metadata: Metadata = {
  title: "Acesso restrito",
  robots: { index: false, follow: false },
}

export default async function AccessDeniedPage() {
  await requireUser()
  const homeHref = appHomeHref(process.env.ADMIN_HOST, process.env.NEXT_PUBLIC_SITE_URL)

  return (
    <AuthShell wide>
      <main>
        <Card>
          <CardHeader className="justify-items-center gap-3 py-4 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ShieldXIcon className="size-7" aria-hidden="true" />
            </div>
            <Badge variant="secondary">Acesso restrito</Badge>
            <CardTitle className="text-2xl text-balance">
              <h1>Você não tem acesso a esta página</h1>
            </CardTitle>
            <CardDescription className="max-w-xs text-sm/relaxed text-pretty">
              Esta área é exclusiva para administradores da plataforma. Você pode continuar usando sua conta pelo painel.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <a href={homeHref} className={cn(buttonVariants(), "w-full sm:w-auto")}>
              <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
              Voltar ao meu painel
            </a>
          </CardFooter>
        </Card>
      </main>
    </AuthShell>
  )
}
