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
  const { count: reviewCount } = await supabase
    .from("ml_questions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", context.organization.id)
    .in("status", ["needs_review", "failed"])

  const items: SidebarNavItem[] = NAV_ITEMS.map((item) => {
    const decision = decideSectionAccess(item.section, {
      access: context.access.state,
      hasActiveMlAccount,
      isPlatformAdmin: context.profile.isPlatformAdmin,
    })
    if (!decision.allowed) return { ...item, lockedReason: LOCK_REASONS[decision.reason] }
    return item.section === "perguntas" ? { ...item, badge: reviewCount ?? 0 } : item
  })

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar
        items={items}
        organizationName={context.organization.name}
        user={{ name: context.profile.fullName, email: context.user.email, isPlatformAdmin: context.profile.isPlatformAdmin }}
      />
      <SidebarInset className="bg-canvas">
        <AccessBanners access={context.access} mlAccounts={context.mlAccounts} />
        <AppHeader />
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">{children}</div>
      </SidebarInset>
      {context.profile.tourCompletedAt ? null : <WelcomeTour />}
    </SidebarProvider>
  )
}
