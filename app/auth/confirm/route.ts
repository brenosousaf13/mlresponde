import type { EmailOtpType } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"

import { safeRedirectPath } from "@/lib/validation/forms"
import { createClient } from "@/lib/supabase/server"

const ALLOWED_TYPES: readonly EmailOtpType[] = ["signup", "email", "recovery", "email_change", "invite"]

// Recebe os links dos e-mails do Supabase Auth em dois formatos:
// - padrão do Supabase (?code=...): troca o código pela sessão; exige o mesmo navegador do cadastro/pedido;
// - template personalizado (?token_hash=...&type=...): funciona em qualquer navegador (requer SMTP próprio).
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const next = safeRedirectPath(searchParams.get("next"), "/painel")
  const isRecovery = next === "/redefinir-senha" || searchParams.get("type") === "recovery"
  const go = (path: string) => NextResponse.redirect(new URL(path, request.url))

  const supabase = await createClient()

  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  if (tokenHash && type && ALLOWED_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) return go(next)
  }

  const code = searchParams.get("code")
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return go(next)
    if (!searchParams.get("error_code")) {
      return go(isRecovery ? "/recuperar-senha?erro=outro-navegador" : "/login?erro=confirmado")
    }
  }

  return go(isRecovery ? "/recuperar-senha?erro=link-invalido" : "/login?erro=link-invalido")
}
