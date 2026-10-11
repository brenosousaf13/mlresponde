import Link from "next/link"

import { LogoWordmark } from "@/components/brand/logo"

export function AuthShell({
  children,
  wide = false,
  size,
}: {
  children: React.ReactNode
  wide?: boolean
  /** "lg" para formulários maiores (dados de cobrança no cadastro). */
  size?: "lg"
}) {
  const width = size === "lg" ? "max-w-lg" : wide ? "max-w-md" : "max-w-sm"
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className={`flex w-full ${width} flex-col gap-6`}>
        <Link href="/login" className="self-center" aria-label="Página inicial">
          <LogoWordmark className="h-7" />
        </Link>
        {children}
      </div>
    </div>
  )
}

export function LegalFootnote() {
  return (
    <p className="px-6 text-center text-xs text-balance text-muted-foreground *:[a]:underline *:[a]:underline-offset-4 *:[a]:hover:text-primary">
      Ao continuar, você concorda com os <Link href="/termos">Termos de Uso</Link> e a{" "}
      <Link href="/privacidade">Política de Privacidade</Link>.
    </p>
  )
}
