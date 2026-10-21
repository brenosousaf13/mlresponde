"use client"

import { Menu } from "lucide-react"
import dynamic from "next/dynamic"
import { useEffect, useRef, useState } from "react"

import { AnimatedWordmark } from "./letters"
import { SITE_NAV } from "./nav"
import { SiteButton } from "./site-button"

/** O menu do celular só é baixado quando a pessoa chega perto do ☰ (ou toca nele). */
const loadMobileMenu = () => import("./mobile-menu")
const MobileMenu = dynamic(loadMobileMenu, { ssr: false })
const preloadMobileMenu = () => void loadMobileMenu()

/**
 * Uma barra só, flutuante, com logo, links e botões dentro dela. No topo é transparente; depois de rolar ganha fundo
 * sólido, que troca de escuro para claro conforme a seção que passa por baixo (cada seção marca o tema com
 * `data-nav="dark|light"`). Antes eram peças soltas sobre um véu de degradê, e o conteúdo parecia cortado atrás delas.
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
      data-scrolled="false"
      className="group/header fixed inset-x-0 top-0 z-50 px-3 pt-3 text-white sm:px-5 sm:pt-4"
    >
      <div
        className={[
          "relative mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 rounded-full border border-transparent pr-2 pl-5 transition-[background-color,border-color,color] duration-300",
          "group-data-[scrolled=true]/header:border-white/10 group-data-[scrolled=true]/header:bg-brand-night/95 group-data-[scrolled=true]/header:backdrop-blur-md",
          "group-data-[scrolled=true]/header:group-data-[theme=light]/header:border-brand-graphite/10 group-data-[scrolled=true]/header:group-data-[theme=light]/header:bg-white/95 group-data-[theme=light]/header:text-brand-graphite",
        ].join(" ")}
      >
        <a
          href="#topo"
          aria-label="maanu, voltar ao início"
          className="relative z-10 block w-[6.2rem] rounded-md outline-none focus-visible:ring-3 focus-visible:ring-brand-teal/60 sm:w-[6.8rem]"
        >
          <AnimatedWordmark intro />
        </a>

        <nav aria-label="Seções da página" className="absolute top-1/2 left-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-0.5 lg:flex">
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
            className="hidden sm:inline-flex group-data-[theme=light]/header:bg-brand-graphite group-data-[theme=light]/header:text-white group-data-[theme=light]/header:hover:bg-brand-graphite/90"
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
            className="inline-flex size-10 items-center justify-center rounded-full bg-white/10 transition-colors group-data-[theme=light]/header:bg-brand-graphite/8 lg:hidden"
          >
            <Menu className="size-5" aria-hidden />
          </button>
        </div>
      </div>

      {menuRequested ? <MobileMenu open={menuOpen} onOpenChange={setMenuOpen} signupHref={signupHref} loginHref={loginHref} /> : null}
    </header>
  )
}