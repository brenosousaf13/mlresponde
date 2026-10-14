"use client"

import { ArrowRight } from "lucide-react"
import { useSyncExternalStore } from "react"

import { buttonVariants } from "@/components/ui/button"
import { siteConfig } from "@/lib/config/site"
import { cn } from "@/lib/utils"

function subscribe(callback: () => void) {
  window.addEventListener("scroll", callback, { passive: true })
  window.addEventListener("resize", callback)
  return () => {
    window.removeEventListener("scroll", callback)
    window.removeEventListener("resize", callback)
  }
}

/** Depois do topo e até o convite final aparecer (lá já há um botão grande). */
function shouldShow() {
  const { scrollY, innerHeight } = window
  const finalCta = document.getElementById("cta-final")
  const finalTop = finalCta ? finalCta.getBoundingClientRect().top : Number.POSITIVE_INFINITY
  return scrollY > innerHeight * 0.9 && finalTop > innerHeight * 0.85
}

/** Botão fixo no rodapé do celular (quem chega pelo anúncio quase sempre está no celular). */
export function MobileCtaBar({ signupHref }: { signupHref: string }) {
  const visible = useSyncExternalStore(subscribe, shouldShow, () => false)
  return (
    <div
      className={cn(
        "fixed inset-x-3 bottom-3 z-40 transition-[opacity,transform] duration-300 md:hidden",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"
      )}
    >
      <div className="flex items-center gap-3 rounded-full border border-white/10 bg-brand-graphite/90 p-1.5 pl-5 text-white shadow-2xl backdrop-blur-xl">
        <span className="min-w-0 flex-1 truncate text-sm text-white/75">{siteConfig.trialDays} dias grátis, sem cartão</span>
        <a
          href={signupHref}
          tabIndex={visible ? undefined : -1}
          className={cn(
            buttonVariants(),
            "h-11 rounded-full bg-brand-teal px-5 text-sm font-semibold text-brand-graphite hover:bg-brand-mint"
          )}
        >
          Testar grátis
          <ArrowRight data-icon="inline-end" aria-hidden />
        </a>
      </div>
    </div>
  )
}
