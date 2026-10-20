"use client"

import { Menu } from "lucide-react"
import dynamic from "next/dynamic"
import { useState, useSyncExternalStore } from "react"

import { LogoWordmark } from "@/components/brand/logo"
import { buttonVariants } from "@/components/ui/button"
import { siteConfig } from "@/lib/config/site"
import { cn } from "@/lib/utils"

import { SITE_NAV } from "./nav"
import { SiteButton } from "./site-button"

/** O menu do celular só é baixado quando a pessoa chega perto do ☰ (ou toca nele). */
const loadMobileMenu = () => import("./mobile-menu")
const MobileMenu = dynamic(loadMobileMenu, { ssr: false })
const preloadMobileMenu = () => void loadMobileMenu()

function subscribeScroll(callback: () => void) {
  window.addEventListener("scroll", callback, { passive: true })
  return () => window.removeEventListener("scroll", callback)
}

/** Barra de navegação flutuante: transparente sobre o topo escuro, vidro grafite depois de rolar. */
export function SiteHeader({ signupHref, loginHref }: { signupHref: string; loginHref: string }) {
  const scrolled = useSyncExternalStore(subscribeScroll, () => window.scrollY > 24, () => false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuRequested, setMenuRequested] = useState(false)

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
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm text-white/70 transition-colors outline-none hover:bg-white/[0.06] hover:text-white focus-visible:ring-3 focus-visible:ring-brand-teal/60"
            >
              {item.label}
              {item.isNew ? (
                <>
                  <span aria-hidden className="relative flex size-1.5">
                    <span className="site-motion absolute inset-0 animate-[site-ping_1.8s_ease-out_infinite] rounded-full bg-brand-mint" />
                    <span className="relative size-1.5 rounded-full bg-brand-mint" />
                  </span>
                  <span className="sr-only"> (novo)</span>
                </>
              ) : null}
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

          <button
            type="button"
            aria-label="Abrir menu"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            onPointerEnter={preloadMobileMenu}
            onTouchStart={preloadMobileMenu}
            onFocus={preloadMobileMenu}
            onClick={() => {
              setMenuRequested(true)
              setMenuOpen(true)
            }}
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-lg" }),
              "rounded-full text-white hover:bg-white/10 hover:text-white lg:hidden"
            )}
          >
            <Menu aria-hidden />
          </button>
          {menuRequested ? (
            <MobileMenu open={menuOpen} onOpenChange={setMenuOpen} signupHref={signupHref} loginHref={loginHref} />
          ) : null}
        </div>
      </div>
    </header>
  )
}
