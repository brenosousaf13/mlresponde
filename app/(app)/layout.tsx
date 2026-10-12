import { cookies } from "next/headers"

import { AccessBanners } from "@/components/app/access-banners"
import { AppHeader } from "@/components/app/app-header"
import { AppSidebar, type SidebarNavItem } from "@/components/app/app-sidebar"
import { WelcomeTour } from "@/components/app/welcome-tour"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { decideSectionAccess } from "@/lib/access/access"
import { requireOnboardedContext } from "@/lib/dal/app-context"
import { LOCK_REASONS, NAV_ITEMS } from "@/lib/navigation"
import { createClient } from "@/lib/supabase/server"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const context = await requireOnboardedContext()
  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false"
  const hasActiveMlAccount = context.mlAccounts.active > 0

  const supabase = await createClient()
  const [{ count: reviewCount }, { count: afterSaleCount }] = await Promise.all([
    supabase
      .from("ml_questions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", context.organization.id)
      .in("status", ["needs_review", "failed"]),
    context.features.pos_venda
      ? supabase
          .from("ml_conversations")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", context.organization.id)
          .in("status", ["needs_review", "failed"])
      : Promise.resolve({ count: 0 }),
  ])
  const badges: Partial<Record<SidebarNavItem["section"], number>> = {
    perguntas: reviewCount ?? 0,
    pos_venda: afterSaleCount ?? 0,
  }

  const items = NAV_ITEMS.flatMap((item): SidebarNavItem[] => {
    const decision = decideSectionAccess(item.section, {
      access: context.access.state,
      hasActiveMlAccount,
      isPlatformAdmin: context.profile.isPlatformAdmin,
      features: context.features,
    })
    // Itens exclusivos de um plano só aparecem para quem tem o plano.
    if (!decision.allowed && decision.reason === "plan") return []
    if (!decision.allowed) return [{ ...item, lockedReason: LOCK_REASONS[decision.reason] }]
    return [{ ...item, badge: badges[item.section] }]
  })

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar
        items={items}
        organizationName={context.organization.name}
        user={{ name: context.profile.fullName, email: context.user.email, isPlatformAdmin: context.profile.isPlatformAdmin }}
      />
      {/* Páginas com [data-fill-viewport] (caixa de entrada) ocupam exatamente a altura da tela no computador,
          com rolagem própria em cada coluna; abaixo de 44rem de altura a página volta a rolar. */}
      <SidebarInset className="bg-canvas lg:has-[[data-fill-viewport]]:h-[max(100svh,44rem)]">
        <AccessBanners access={context.access} mlAccounts={context.mlAccounts} />
        <AppHeader />
        <div className="flex min-h-0 flex-1 flex-col gap-6 p-4 md:p-6">{children}</div>
      </SidebarInset>
      {context.profile.tourCompletedAt ? null : <WelcomeTour />}
    </SidebarProvider>
  )
}
