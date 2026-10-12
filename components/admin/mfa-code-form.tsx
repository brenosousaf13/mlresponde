"use client"

import { REGEXP_ONLY_DIGITS } from "input-otp"
import { useActionState, useRef, useState } from "react"

import { verifyMfaCode } from "@/app/admin/verificacao/actions"
import { FormMessage, SubmitButton } from "@/components/forms/form-feedback"
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp"
import type { FormState } from "@/lib/validation/forms"

const SLOT = "size-11 text-lg font-semibold tabular-nums"

/** Código de 6 números do app autenticador. Envia sozinho ao completar o sexto número. */
export function MfaCodeForm({ factorId, submitLabel }: { factorId?: string; submitLabel: string }) {
  const formRef = useRef<HTMLFormElement>(null)
  const [code, setCode] = useState("")
  const [state, action, pending] = useActionState(async (previous: FormState, formData: FormData) => {
    const result = await verifyMfaCode(previous, formData)
    setCode("")
    return result
  }, {})

  return (
    <form ref={formRef} action={action} className="flex flex-col items-center gap-4">
      {factorId ? <input type="hidden" name="factorId" value={factorId} /> : null}
      <InputOTP
        name="code"
        value={code}
        onChange={setCode}
        maxLength={6}
        pattern={REGEXP_ONLY_DIGITS}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        disabled={pending}
        aria-label="Código de 6 números do app autenticador"
        aria-invalid={Boolean(state.fieldErrors?.code)}
        onComplete={() => formRef.current?.requestSubmit()}
      >
        <InputOTPGroup>
          <InputOTPSlot index={0} className={SLOT} />
          <InputOTPSlot index={1} className={SLOT} />
          <InputOTPSlot index={2} className={SLOT} />
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          <InputOTPSlot index={3} className={SLOT} />
          <InputOTPSlot index={4} className={SLOT} />
          <InputOTPSlot index={5} className={SLOT} />
        </InputOTPGroup>
      </InputOTP>
      <div className="w-full">
        <FormMessage state={state} />
      </div>
      <SubmitButton pending={pending} pendingLabel="Conferindo..." className="w-full">
        {submitLabel}
      </SubmitButton>
    </form>
  )
}
