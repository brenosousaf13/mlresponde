export type SiteNavItem = { href: string; label: string; isNew?: boolean }

export const SITE_NAV: readonly SiteNavItem[] = [
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#recursos", label: "Recursos" },
  { href: "#reputacao", label: "Reputação", isNew: true },
  { href: "#planos", label: "Planos" },
  { href: "#duvidas", label: "Dúvidas" },
]
