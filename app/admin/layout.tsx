import type { Metadata } from "next"

import { AppProviders } from "@/components/providers/app-providers"
import { getAdminIdentity } from "@/lib/dal/admin"

export const metadata: Metadata = {
  title: { default: "Admin · maanu", template: "%s · Admin · maanu" },
  robots: { index: false, follow: false, nocache: true },
}

/**
 * Raiz do painel do administrador: quem não é administrador da plataforma vai para a tela de acesso negado.
 * A verificação em 2 etapas é exigida pelo layout de (painel) e por cada página, ação e função do banco.
 */
export default async function AdminRootLayout({ children }: { children: React.ReactNode }) {
  await getAdminIdentity()
  return <AppProviders>{children}</AppProviders>
}
