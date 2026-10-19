"use client"

import { CircleAlertIcon, RotateCwIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

import { retryCustomerImport } from "@/app/(app)/clientes/actions"
import { AutoRefresh } from "@/components/clientes/auto-refresh"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { formatNumber } from "@/lib/format"

/** Importação das vendas em andamento (com atualização automática) e importações que falharam (com "Tentar de novo"). */
export function ImportStatus({
  importing,
  ordersImported,
  failed,
}: {
  importing: boolean
  ordersImported: number
  failed: { accountId: string; nickname: string }[]
}) {
  if (!importing && !failed.length) return null
  return (
    <div className="flex flex-col gap-3">
      {importing ? (
        <Alert className="border-primary/25 bg-primary/5">
          <Spinner className="text-primary" />
          <AlertTitle>
            Importando suas vendas dos últimos 12 meses… {formatNumber(ordersImported)}{" "}
            {ordersImported === 1 ? "venda" : "vendas"}
          </AlertTitle>
          <AlertDescription>
            Os clientes aparecem aqui conforme as vendas chegam. Pode levar alguns minutos (ou mais, em lojas com muitas
            vendas). Você pode sair desta tela: a importação continua.
          </AlertDescription>
          <AutoRefresh />
        </Alert>
      ) : null}
      {failed.map((account) => (
        <RetryAlert key={account.accountId} accountId={account.accountId} nickname={account.nickname} />
      ))}
    </div>
  )
}

function RetryAlert({ accountId, nickname }: { accountId: string; nickname: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <Alert variant="destructive">
      <CircleAlertIcon />
      <AlertTitle>Não conseguimos importar as vendas de {nickname}</AlertTitle>
      <AlertDescription>
        <p>O Mercado Livre não respondeu depois de várias tentativas. As vendas já importadas continuam aqui.</p>
        <Button
          size="sm"
          variant="outline"
          className="mt-2"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await retryCustomerImport(accountId)
              if (!result.ok) {
                toast.error(result.message)
                return
              }
              toast.success(result.message)
              router.refresh()
            })
          }
        >
          {pending ? <Spinner data-icon="inline-start" /> : <RotateCwIcon data-icon="inline-start" />}
          Tentar de novo
        </Button>
      </AlertDescription>
    </Alert>
  )
}
