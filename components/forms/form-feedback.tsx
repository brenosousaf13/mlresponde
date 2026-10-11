import { CircleAlertIcon, CircleCheckIcon } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import type { FormState } from "@/lib/validation/forms"

export function FormMessage({ state }: { state: FormState }) {
  if (!state.message) return null
  return (
    <Alert variant={state.ok ? "default" : "destructive"}>
      {state.ok ? <CircleCheckIcon /> : <CircleAlertIcon />}
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  )
}

export function fieldErrors(state: FormState, name: string) {
  return state.fieldErrors?.[name]?.map((message) => ({ message }))
}

export function hasFieldError(state: FormState, name: string) {
  return Boolean(state.fieldErrors?.[name]?.length)
}

export function SubmitButton({
  pending,
  children,
  pendingLabel,
  className,
  variant,
}: {
  pending: boolean
  children: React.ReactNode
  pendingLabel?: string
  className?: string
  variant?: React.ComponentProps<typeof Button>["variant"]
}) {
  return (
    <Button type="submit" disabled={pending} className={className} variant={variant}>
      {pending && <Spinner data-icon="inline-start" />}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  )
}
