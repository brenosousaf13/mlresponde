import { ArrowRightIcon, ClockIcon } from "lucide-react"
import Link from "next/link"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { reviewBannerSecondary, reviewBannerText } from "@/lib/recovery/banner"
import type { RecoveryQueueGroups } from "@/lib/recovery/contract"

/**
 * Aviso no topo do Recuperador (no lugar do e-mail): quantas devoluções esperam a revisão do dono, o valor e o primeiro
 * prazo. Usa os mesmos números do card "Revise agora" (já sem as vencidas); some quando não há nada para revisar.
 */
export function ReviewBanner({ groups, href }: { groups: RecoveryQueueGroups; href: string }) {
  const text = reviewBannerText({ groups })
  const secondary = reviewBannerSecondary({ groups })
  if (!text) return null
  return (
    <Alert>
      <ClockIcon />
      <AlertTitle>{text}</AlertTitle>
      <AlertDescription className="space-y-1">
        {secondary ? <span className="block text-sm">{secondary}</span> : null}
        <Link href={href} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
          Ver a lista para revisar <ArrowRightIcon className="size-3.5" />
        </Link>
      </AlertDescription>
    </Alert>
  )
}
