"use client"

import { CalendarPlusIcon } from "lucide-react"
import { useTransition } from "react"
import { toast } from "sonner"

import { extendTrial } from "@/app/admin/actions"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { TRIAL_EXTENSIONS } from "@/lib/admin/schemas"

/** Estende o teste grátis a partir de hoje (ou do fim atual, se ainda não acabou). */
export function ExtendTrialMenu({ organizationId }: { organizationId: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" disabled={pending} />}>
        {pending ? <Spinner data-icon="inline-start" /> : <CalendarPlusIcon data-icon="inline-start" />}
        Estender teste
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Somar ao teste</DropdownMenuLabel>
          {TRIAL_EXTENSIONS.map((days) => (
            <DropdownMenuItem
              key={days}
              onClick={() =>
                startTransition(async () => {
                  const result = await extendTrial(organizationId, days)
                  if (result.ok) toast.success(result.message)
                  else toast.error(result.message)
                })
              }
            >
              +{days} dias
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
