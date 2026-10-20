"use client"

import { LogoWordmark } from "@/components/brand/logo"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { siteConfig } from "@/lib/config/site"

import { SITE_NAV } from "./nav"
import { SiteButton } from "./site-button"

/**
 * Menu do celular (painel lateral). Carregado só quando a pessoa toca no ☰ (site-header.tsx): o painel e o seu
 * código de foco e rolagem (~35 KB) não pesam no carregamento da página de vendas.
 */
export default function MobileMenu({
  open,
  onOpenChange,
  signupHref,
  loginHref,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  signupHref: string
  loginHref: string
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
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
              onClick={() => onOpenChange(false)}
              className="flex items-center gap-2.5 rounded-xl px-3 py-3 text-lg font-medium text-white/85 hover:bg-white/[0.06] hover:text-white"
            >
              {item.label}
              {item.isNew ? (
                <span className="rounded-full bg-brand-teal px-2 py-0.5 text-xs font-semibold text-brand-graphite">Novo</span>
              ) : null}
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
  )
}
