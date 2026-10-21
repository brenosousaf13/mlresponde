import { notFound } from "next/navigation"

import { AppHeader } from "@/components/app/app-header"
import { AppSidebar, type SidebarNavItem } from "@/components/app/app-sidebar"
import { AppProviders } from "@/components/providers/app-providers"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { NAV_ITEMS } from "@/lib/navigation"

/**
 * Vitrine de demonstração (SÓ no computador de desenvolvimento): monta as telas REAIS do app com dados fictícios, sem
 * banco e sem login, para tirar as capturas usadas na página de vendas (`public/home/`). Em produção a rota não existe
 * (404). Como abrir: `npm run dev` e visitar `/<tela>?demo-print=1` (ex.: `/recuperador?demo-print=1`); o proxy deixa
 * passar e o `next.config.ts` reescreve para esta pasta. Capturas: `docs/brand/scripts/capturas-home.mjs`.
 */
const BADGES: Partial<Record<SidebarNavItem["section"], number>> = { perguntas: 1, recuperador: 2 }

export default function DemoPrintLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound()

  const items: SidebarNavItem[] = NAV_ITEMS.map((item) => ({ ...item, badge: BADGES[item.section] }))

  return (
    <AppProviders>
      <SidebarProvider defaultOpen>
        <AppSidebar
          items={items}
          organizationName="Casa Aurora Store"
          user={{ name: "Marina Alves", email: "marina@casaaurora.com.br" }}
          trialNotice={null}
        />
        <SidebarInset className="bg-canvas lg:has-[[data-fill-viewport]]:h-[max(100svh,44rem)]">
          <AppHeader trialNotice={null} />
          <div className="flex min-h-0 flex-1 flex-col gap-6 p-4 md:p-6">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </AppProviders>
  )
}