import { cookies } from "next/headers"

import { AccountNotices } from "@/components/app/account-notices"
import { AppHeader } from "@/components/app/app-header"
import { AppSidebar, type SidebarNavItem } from "@/components/app/app-sidebar"
import { WelcomeTour } from "@/components/app/welcome-tour"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { decideSectionAccess } from "@/lib/access/access"
import { answersUsageNotice, mlConnectionNotice, trialNotice } from "@/lib/access/notices"
import { canManageOrganization, requireOnboardedContext } from "@/lib/dal/app-context"
import { getPlanUsage } from "@/lib/dal/plan"
import { adminPanelHref } from "@/lib/admin/host"
import { isPlatformAiPaused } from "@/lib/ai/usage"
import { LOCK_REASONS, NAV_ITEMS } from "@/lib/navigation"
import { periodText } from "@/lib/plans/usage"
import { createClient } from "@/lib/supabase/server"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const context = await requireOnboardedContext()
  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false"
  const hasActiveMlAccount = context.mlAccounts.active > 0

  const supabase = await createClient()
  const [{ count: reviewCount }, { count: afterSaleCount }, platformAiPaused, usage] = await Promise.all([
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
    isPlatformAiPaused(),
    // Uso do plano (aviso de 80% e de limite esgotado). Uma falha aqui não derruba a página.
    context.access.state === "blocked"
      ? Promise.resolve(null)
      : getPlanUsage(context).catch((error: unknown) => {
          console.error("[app] uso do plano:", error instanceof Error ? error.message : error)
          return null
        }),
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

  // Teste grátis: no rodapé do menu (e no topo do celular) até acabar ou a assinatura ficar ativa.
  // Conta do ML: no topo do conteúdo até existir uma conta ativa.
  const trial = trialNotice(context.access, context.organization.subscriptionStatus)
  const mlNotice = mlConnectionNotice(context.access, context.mlAccounts)
  const usageNotice = usage ? answersUsageNotice(context.access, usage.answers, periodText(usage.period)) : null

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar
        items={items}
        organizationName={context.organization.name}
        adminHref={
          context.profile.isPlatformAdmin
            ? adminPanelHref(process.env.ADMIN_HOST, process.env.NEXT_PUBLIC_SITE_URL)
            : undefined
        }
        user={{ name: context.profile.fullName, email: context.user.email, isPlatformAdmin: context.profile.isPlatformAdmin }}
        trialNotice={trial}
      />
      {/* Páginas com [data-fill-viewport] (caixa de entrada) ocupam exatamente a altura da tela no computador,
          com rolagem própria em cada coluna; abaixo de 44rem de altura a página volta a rolar. */}
      <SidebarInset className="bg-canvas lg:has-[[data-fill-viewport]]:h-[max(100svh,44rem)]">
        <AppHeader trialNotice={trial} />
        <div className="flex min-h-0 flex-1 flex-col gap-6 p-4 md:p-6">
          <AccountNotices
            ml={mlNotice}
            canManage={canManageOrganization(context.role)}
            platformAiPaused={platformAiPaused}
            usage={usageNotice}
          />
          {children}
        </div>
      </SidebarInset>
      {context.profile.tourCompletedAt ? null : <WelcomeTour />}
    </SidebarProvider>
  )
}
