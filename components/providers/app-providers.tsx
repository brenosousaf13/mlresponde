import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"

/**
 * Avisos (toasts) e dicas (tooltips) do app. Ficam nos layouts do app, do login, do onboarding e do painel admin, e
 * não no layout raiz: assim a página de vendas não carrega esse código (fica mais leve e rápida).
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TooltipProvider>{children}</TooltipProvider>
      <Toaster position="top-right" richColors />
    </>
  )
}
