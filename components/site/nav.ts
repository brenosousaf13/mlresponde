export type SiteNavItem = { href: string; label: string; isNew?: boolean }

export const SITE_NAV: readonly SiteNavItem[] = [
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#recuperar", label: "Recuperador", isNew: true },
  { href: "#por-dentro", label: "Por dentro" },
  { href: "#planos", label: "Planos" },
  { href: "#duvidas", label: "Dúvidas" },
]