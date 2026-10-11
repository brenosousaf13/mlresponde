import type { AppSection } from "@/lib/access/access"

export type NavItemConfig = {
  section: AppSection
  title: string
  href: string
  icon: "painel" | "perguntas" | "assistente" | "contas" | "assinatura" | "configuracoes"
}

export const NAV_ITEMS: readonly NavItemConfig[] = [
  { section: "painel", title: "Painel", href: "/painel", icon: "painel" },
  { section: "perguntas", title: "Perguntas", href: "/perguntas", icon: "perguntas" },
  { section: "assistente", title: "Assistente de IA", href: "/assistente", icon: "assistente" },
  { section: "contas", title: "Contas do Mercado Livre", href: "/contas", icon: "contas" },
  { section: "assinatura", title: "Assinatura", href: "/assinatura", icon: "assinatura" },
  { section: "configuracoes", title: "Configurações", href: "/configuracoes", icon: "configuracoes" },
]

export const PAGE_TITLES: Record<string, string> = {
  "/painel": "Painel",
  "/perguntas": "Perguntas",
  "/assistente": "Assistente de IA",
  "/contas": "Contas do Mercado Livre",
  "/assinatura": "Assinatura",
  "/configuracoes": "Configurações",
}

export const LOCK_REASONS = {
  blocked: "Seu teste terminou. Assine um plano para liberar.",
  no_ml_account: "Conecte uma conta do Mercado Livre para liberar.",
} as const
