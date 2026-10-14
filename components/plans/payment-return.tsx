"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

/**
 * Volta da página de pagamento enquanto a confirmação da AbacatePay (webhook) não chegou: atualiza a tela a cada
 * 4 segundos, por até 2 minutos.
 */
export function PaymentReturnRefresher() {
  const router = useRouter()
  useEffect(() => {
    const started = Date.now()
    const timer = setInterval(() => {
      if (Date.now() - started > 120_000) {
        clearInterval(timer)
        return
      }
      router.refresh()
    }, 4000)
    return () => clearInterval(timer)
  }, [router])
  return null
}