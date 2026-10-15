import type { Metadata, Viewport } from "next"
import { Funnel_Display } from "next/font/google"

import { siteConfig } from "@/lib/config/site"
import { cn } from "@/lib/utils"

import "./site.css"

/** Fonte dos títulos da página de vendas (o texto corrido continua em Geist, a fonte da marca). */
const funnelDisplay = Funnel_Display({ variable: "--font-funnel", subsets: ["latin"], display: "swap" })

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.marketingUrl),
}

/** Cor da barra do navegador no celular (grafite da marca). */
export const viewport: Viewport = { themeColor: "#0F172A" }

export default function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={cn(funnelDisplay.variable, "min-h-svh overflow-x-clip bg-background")}>
      {/* Sem JavaScript, nada fica escondido esperando a animação de entrada. */}
      <noscript>
        <style>{"[data-reveal]{opacity:1!important;transform:none!important;filter:none!important}"}</style>
      </noscript>
      {children}
    </div>
  )
}
