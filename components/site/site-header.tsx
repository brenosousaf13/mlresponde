"use client"

import { Menu } from "lucide-react"
import { useState, useSyncExternalStore } from "react"

import { LogoWordmark } from "@/components/brand/logo"
import { buttonVariants } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { siteConfig } from "@/lib/config/site"
import { cn } from "@/lib/utils"

import { SiteButton } from "./site-button"

export const SITE_NAV = [
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#recursos", label: "Recursos" },
  { href: "#planos", label: "Planos" },
  { href: "#duvidas", label: "Dúvidas" },
] as const

function subscribeScroll(callback: () => void) {
  window.addEventListener("scroll", callback, { passive: true })
  return () => window.removeEventListener("scroll", callback)
}

/** Barra de navegação flutuante: transparente sobre o topo escuro, vidro grafite depois de rolar. */
export function SiteHeader({ signupHref, loginHref }: { signupHref: string; loginHref: string }) {
  const scrolled = useSyncExternalStore(subscribeScroll, () => window.scrollY > 24, () => false)
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-4 sm:pt-4">
      <div
        className={cn(
          "relative mx-auto flex h-14 max-w-6xl items-center gap-2 rounded-full border pr-2 pl-5 transition-[background-color,border-color,box-shadow] duration-300",
          scrolled
            ? "border-white/10 bg-brand-graphite/90 shadow-[0_18px_50px_-20px] shadow-brand-graphite/60 backdrop-blur-xl"
            : "border-transparent bg-transparent"
        )}
      >
        <a href="#topo" aria-label={`${siteConfig.name}, voltar ao início`} className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-brand-teal/60">
          <LogoWordmark label="" className="h-[1.35rem] text-white" />
        </a>

        {/* Links no centro da barra (só no computador; em telas menores ficam no menu). */}
        <nav
          aria-label="Seções da página"
          className="absolute top-1/2 left-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-0.5 lg:flex"
        >
          {SITE_NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-full px-3.5 py-2 text-sm text-white/70 transition-colors outline-none hover:bg-white/[0.06] hover:text-white focus-visible:ring-3 focus-visible:ring-brand-teal/60"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <a
            href={loginHref}
            className="hidden rounded-full px-3.5 py-2 text-sm font-medium text-white/80 transition-colors outline-none hover:text-white focus-visible:ring-3 focus-visible:ring-brand-teal/60 sm:inline-flex"
          >
            Entrar
          </a>
          {/* No celular o botão fica na barra fixa de baixo (mobile-cta-bar). */}
          <SiteButton href={signupHref} variant="teal" size="sm" className="hidden shadow-none md:inline-flex">
            Testar grátis
          </SiteButton>

          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger
              aria-label="Abrir menu"
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon-lg" }),
                "rounded-full text-white hover:bg-white/10 hover:text-white lg:hidden"
              )}
            >
              <Menu aria-hidden />
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[86%] border-white/10 bg-brand-night text-white [&>[data-slot=sheet-close]]:text-white [&>[data-slot=sheet-close]]:hover:bg-white/10"
            >
              <SheetHeader className="pt-6">
                <SheetTitle className="sr-only">Menu</SheetTitle>
                <LogoWordmark label={siteConfig.name} className="h-6 self-start text-white" />
              </SheetHeader>
              <nav aria-label="Seções da página" className="flex flex-col gap-1 px-4">
                {SITE_NAV.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={closeMenu}
                    className="rounded-xl px-3 py-3 text-lg font-medium text-white/85 hover:bg-white/[0.06] hover:text-white"
                  >
                    {item.label}
                  </a>
                ))}
              </nav>
              <div className="mt-auto flex flex-col gap-2 p-4">
                <SiteButton href={signupHref} variant="teal" block>
                  Testar grátis por {siteConfig.trialDays} dias
                </SiteButton>
                <SiteButton href={loginHref} variant="outline-dark" icon={null} block>
                  Já tenho conta
                </SiteButton>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
