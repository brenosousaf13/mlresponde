import { ArrowRightIcon, ClockIcon } from "lucide-react"
import Link from "next/link"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { reviewBannerText } from "@/lib/recovery/banner"

/**
 * Aviso no topo do Recuperador (no lugar do e-mail): quantas devoluções esperam a revisão do dono, o valor e o primeiro
 * prazo. Usa os mesmos números do card "Revise agora" (já sem as vencidas); some quando não há nada para revisar.
 */
export function ReviewBanner({ count, amount, nextDeadline, href }: { count: number; amount: number; nextDeadline: string | null; href: string }) {
  const text = reviewBannerText({ count, amount, nextDeadline })
  if (!text) return null
  return (
    <Alert>
      <ClockIcon />
      <AlertTitle>{text}</AlertTitle>
      <AlertDescription>
        <Link href={href} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
          Ver a lista para revisar <ArrowRightIcon className="size-3.5" />
        </Link>
      </AlertDescription>
    </Alert>
  )
}
