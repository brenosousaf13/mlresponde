"use client"

import { CheckIcon, CopyIcon, QrCodeIcon } from "lucide-react"
import Image from "next/image"
import { useState, useTransition } from "react"

import { startMfaEnrollment, type MfaEnrollment } from "@/app/admin/verificacao/actions"
import { MfaCodeForm } from "@/components/admin/mfa-code-form"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

/** Primeiro acesso: gera o QR code, mostra o código secreto e confirma com o primeiro código do app. */
export function MfaEnroll() {
  const [enrollment, setEnrollment] = useState<Extract<MfaEnrollment, { ok: true }> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()

  function start() {
    setError(null)
    startTransition(async () => {
      const result = await startMfaEnrollment()
      if (result.ok) setEnrollment(result)
      else setError(result.message)
    })
  }

  async function copySecret() {
    if (!enrollment) return
    await navigator.clipboard.writeText(enrollment.secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!enrollment) {
    return (
      <div className="flex flex-col gap-4">
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
          <li>Instale um app autenticador no celular (Google Authenticator, Microsoft Authenticator, 1Password ou Authy).</li>
          <li>Gere o QR code abaixo e escaneie com o app.</li>
          <li>Digite o código de 6 números que o app mostrar.</li>
        </ol>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button onClick={start} disabled={pending} className="w-full">
          {pending ? <Spinner data-icon="inline-start" /> : <QrCodeIcon data-icon="inline-start" />}
          Gerar QR code
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-xl bg-white p-3 ring-1 ring-border">
          <Image src={enrollment.qrCode} alt="QR code para o app autenticador" width={176} height={176} unoptimized />
        </div>
        <div className="flex w-full flex-col gap-1.5">
          <p className="text-center text-xs text-muted-foreground">
            Não consegue escanear? Digite este código secreto no app (e guarde-o num lugar seguro: ele permite cadastrar o
            mesmo autenticador em outro aparelho).
          </p>
          <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
            <code className="min-w-0 flex-1 font-mono text-xs break-all">{enrollment.secret}</code>
            <Button type="button" variant="ghost" size="icon-sm" onClick={copySecret} aria-label="Copiar código secreto">
              {copied ? <CheckIcon /> : <CopyIcon />}
            </Button>
          </div>
        </div>
      </div>
      <MfaCodeForm factorId={enrollment.factorId} submitLabel="Ativar e entrar no painel" />
    </div>
  )
}
