import { OctagonPauseIcon } from "lucide-react"
import { cookies } from "next/headers"
import Link from "next/link"

import { AdminSidebar } from "@/components/admin/admin-sidebar"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { appHomeHref } from "@/lib/admin/host"
import { isPlatformAiPaused } from "@/lib/ai/usage"
import { requireAdmin } from "@/lib/dal/admin"

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin()
  const [cookieStore, aiPaused] = await Promise.all([cookies(), isPlatformAiPaused()])
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false"

  return (
    // data-admin-shell: o menu fica grafite (app/globals.css), inclusive a gaveta do celular.
    <SidebarProvider defaultOpen={defaultOpen} data-admin-shell="">
      <AdminSidebar
        user={{ name: admin.name, email: admin.email }}
        sessionSecondsLeft={admin.sessionSecondsLeft}
        aiPaused={aiPaused}
        appHref={appHomeHref(process.env.ADMIN_HOST, process.env.NEXT_PUBLIC_SITE_URL)}
      />
      {/* min-w-0: tabelas largas rolam dentro do próprio cartão em vez de esticar a página. */}
      <SidebarInset className="min-w-0 bg-canvas">
        {aiPaused ? (
          <Link
            href="/admin/operacao"
            className="flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-center text-sm font-medium text-white hover:bg-destructive/90"
          >
            <OctagonPauseIcon className="size-4 shrink-0" />
            A IA de toda a plataforma está pausada: nenhuma resposta automática está saindo. Ver Operação.
          </Link>
        ) : null}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-4 md:hidden">
          <SidebarTrigger className="-ml-1" aria-label="Abrir menu" />
          <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-auto" />
          <span className="text-sm font-medium">Painel do administrador</span>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-6 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
