import { ArrowRightIcon, CircleAlertIcon, ClockIcon, StoreIcon } from "lucide-react"
import Link from "next/link"

import type { Access } from "@/lib/access/access"

function plural(days: number) {
  return days === 1 ? "1 dia" : `${days} dias`
}

export function AccessBanners({
  access,
  mlAccounts,
}: {
  access: Access
  mlAccounts: { total: number; active: number }
}) {
  const hasActiveMlAccount = mlAccounts.active > 0
  return (
    <>
      {access.state === "trial" ? (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-brand-graphite px-4 py-2 text-center text-sm text-white">
          <ClockIcon className="size-4 text-brand-teal" />
          <span>
            Você está no período de teste. Restam <strong>{plural(access.trialDaysLeft)}</strong>.
          </span>
          <Link href="/assinatura" className="inline-flex items-center gap-1 font-semibold text-brand-teal hover:underline">
            Ver planos <ArrowRightIcon className="size-3.5" />
          </Link>
        </div>
      ) : null}
      {access.state === "blocked" ? (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-destructive px-4 py-2 text-center text-sm text-white">
          <CircleAlertIcon className="size-4" />
          <span>Seu período de teste terminou. Assine um plano para voltar a usar a plataforma.</span>
          <Link href="/assinatura" className="inline-flex items-center gap-1 font-semibold underline-offset-4 hover:underline">
            Ver planos <ArrowRightIcon className="size-3.5" />
          </Link>
        </div>
      ) : null}
      {access.state !== "blocked" && !hasActiveMlAccount ? (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-brand-sage px-4 py-2 text-center text-sm text-brand-graphite">
          <StoreIcon className="size-4" />
          <span>
            {mlAccounts.total === 0
              ? "Você ainda não conectou nenhuma conta do Mercado Livre."
              : "Nenhuma conta do Mercado Livre está ativa no momento."}
          </span>
          <Link href="/contas" className="inline-flex items-center gap-1 font-semibold text-brand-teal-ink hover:underline">
            {mlAccounts.total === 0 ? "Conectar agora" : "Ver contas"} <ArrowRightIcon className="size-3.5" />
          </Link>
        </div>
      ) : null}
    </>
  )
}
