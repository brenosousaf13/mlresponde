"use client"

import { Menu } from "lucide-react"
import dynamic from "next/dynamic"
import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

import { AnimatedWordmark } from "./letters"
import { SITE_NAV } from "./nav"
import { SiteButton } from "./site-button"

/** O menu do celular só é baixado quando a pessoa chega perto do ☰ (ou toca nele). */
const loadMobileMenu = () => import("./mobile-menu")
const MobileMenu = dynamic(loadMobileMenu, { ssr: false })
const preloadMobileMenu = () => void loadMobileMenu()

/**
 * Barra flutuante em "pílula" (como a do Outlign) que troca de claro para escuro conforme a seção que passa por baixo
 * dela (como a do Escutaí): cada seção marca o seu tema com `data-nav="dark|light"`.
 */
export function SiteHeader({ signupHref, loginHref }: { signupHref: string; loginHref: string }) {
  const headerRef = useRef<HTMLElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuRequested, setMenuRequested] = useState(false)

  useEffect(() => {
    const header = headerRef.current
    if (!header) return
    let raf = 0
    const check = () => {
      raf = 0
      const y = header.getBoundingClientRect().bottom - 6
      const sections = document.querySelectorAll<HTMLElement>("[data-nav]")
      let mode = header.dataset.theme ?? "dark"
      for (const section of sections) {
        const box = section.getBoundingClientRect()
        if (box.top <= y && box.bottom > y) mode = section.dataset.nav ?? mode
      }
      header.dataset.theme = mode
      header.dataset.scrolled = window.scrollY > 24 ? "true" : "false"
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(check)
    }
    check()
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
    return () => {
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <header
      ref={headerRef}
      data-theme="dark"
      className="group/header fixed inset-x-0 top-0 z-50 px-3 pt-3 text-white transition-colors duration-300 data-[theme=light]:text-brand-graphite sm:px-5 sm:pt-4"
    >
      {/* Véu atrás da barra depois de rolar: o texto da página não passa por baixo da logo e dos botões. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[5.2rem] bg-gradient-to-b from-brand-night from-55% via-brand-night/85 to-transparent opacity-0 transition-opacity duration-300 group-data-[scrolled=true]/header:opacity-100 group-data-[theme=light]/header:from-brand-offwhite group-data-[theme=light]/header:via-brand-offwhite/85"
      />
      <div className="relative mx-auto flex h-14 max-w-7xl items-center justify-between gap-3">
        <a
          href="#topo"
          aria-label="maanu, voltar ao início"
          className="relative z-10 block w-[6.6rem] rounded-md outline-none focus-visible:ring-3 focus-visible:ring-brand-teal/60 sm:w-[7.4rem]"
        >
          <AnimatedWordmark intro />
        </a>

        {/* Pílula de links no centro (computador). */}
        <nav
          aria-label="Seções da página"
          className={cn(
            "absolute top-1/2 left-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-0.5 rounded-full border p-1 backdrop-blur-xl transition-colors duration-300 lg:flex",
            "border-white/12 bg-white/[0.07] group-data-[theme=light]/header:border-brand-graphite/10 group-data-[theme=light]/header:bg-white/80 group-data-[theme=light]/header:shadow-[0_10px_40px_-18px] group-data-[theme=light]/header:shadow-brand-graphite/30"
          )}
        >
          {SITE_NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="relative inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium opacity-80 transition-[opacity,background-color] duration-200 hover:bg-current/8 hover:opacity-100"
            >
              {item.label}
              {item.isNew ? (
                <span className="rounded-full bg-brand-teal px-1.5 py-px text-[10px] font-bold tracking-wide text-brand-graphite uppercase">Novo</span>
              ) : null}
            </a>
          ))}
        </nav>

        <div className="relative z-10 flex items-center gap-1.5">
          <a href={loginHref} className="hidden rounded-full px-4 py-2 text-sm font-medium opacity-80 transition-opacity hover:opacity-100 sm:inline-flex">
            Entrar
          </a>
          <SiteButton
            href={signupHref}
            size="sm"
            variant="teal"
            className="hidden shadow-none sm:inline-flex group-data-[theme=light]/header:bg-brand-graphite group-data-[theme=light]/header:text-white group-data-[theme=light]/header:hover:bg-brand-graphite/90"
          >
            Testar grátis
          </SiteButton>
          <button
            type="button"
            aria-label="Abrir menu"
            onClick={() => {
              setMenuRequested(true)
              setMenuOpen(true)
            }}
            onPointerEnter={preloadMobileMenu}
            onFocus={preloadMobileMenu}
            onTouchStart={preloadMobileMenu}
            className="inline-flex size-11 items-center justify-center rounded-full border border-white/15 bg-white/[0.07] backdrop-blur-xl transition-colors group-data-[theme=light]/header:border-brand-graphite/10 group-data-[theme=light]/header:bg-white/80 lg:hidden"
          >
            <Menu className="size-5" aria-hidden />
          </button>
        </div>
      </div>

      {menuRequested ? <MobileMenu open={menuOpen} onOpenChange={setMenuOpen} signupHref={signupHref} loginHref={loginHref} /> : null}
    </header>
  )
}