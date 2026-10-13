import type { AppSection } from "@/lib/access/access"

export type NavItemConfig = {
  section: AppSection
  title: string
  href: string
  icon: "painel" | "perguntas" | "pos_venda" | "melhorias" | "resultados" | "assistente" | "contas" | "assinatura" | "configuracoes"
}

export const NAV_ITEMS: readonly NavItemConfig[] = [
  { section: "painel", title: "Painel", href: "/painel", icon: "painel" },
  { section: "perguntas", title: "Perguntas", href: "/perguntas", icon: "perguntas" },
  { section: "pos_venda", title: "Pós-venda", href: "/pos-venda", icon: "pos_venda" },
  { section: "resultados", title: "Resultados", href: "/resultados", icon: "resultados" },
  { section: "melhorias", title: "Melhorias de anúncio", href: "/melhorias", icon: "melhorias" },
  { section: "assistente", title: "Assistente de IA", href: "/assistente", icon: "assistente" },
  { section: "contas", title: "Contas do Mercado Livre", href: "/contas", icon: "contas" },
  { section: "assinatura", title: "Assinatura", href: "/assinatura", icon: "assinatura" },
  { section: "configuracoes", title: "Configurações", href: "/configuracoes", icon: "configuracoes" },
]

export const PAGE_TITLES: Record<string, string> = {
  "/painel": "Painel",
  "/perguntas": "Perguntas",
  "/pos-venda/agente": "Agente de pós-venda",
  "/pos-venda": "Pós-venda",
  "/resultados": "Resultados",
  "/melhorias": "Melhorias de anúncio",
  "/assistente": "Assistente de IA",
  "/contas": "Contas do Mercado Livre",
  "/assinatura": "Assinatura",
  "/configuracoes": "Configurações",
}

export const LOCK_REASONS = {
  blocked: "Seu teste terminou. Assine um plano para liberar.",
  no_ml_account: "Conecte uma conta do Mercado Livre para liberar.",
  plan: "Disponível a partir do plano Pro.",
} as const
