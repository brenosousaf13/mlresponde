import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { adminHostRouting, normalizeHost } from "@/lib/admin/host"

const PUBLIC_PREFIXES = [
  "/login",
  "/cadastro",
  "/verificar-email",
  "/recuperar-senha",
  "/auth/confirm",
  "/termos",
  "/privacidade",
  "/api/webhook",
  "/api/cron",
]

const GUEST_ONLY_PREFIXES = ["/login", "/cadastro", "/verificar-email", "/recuperar-senha"]

function matches(pathname: string, prefixes: readonly string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export async function proxy(request: NextRequest) {
  // Painel do administrador num subdomínio próprio (opcional, variável ADMIN_HOST): fora dele /admin não existe.
  const adminHost = process.env.ADMIN_HOST
  const adminRoute = adminHostRouting({ host: request.headers.get("host"), pathname: request.nextUrl.pathname, adminHost })
  if (adminRoute.kind === "not_found") return new NextResponse("Not Found", { status: 404 })
  if (adminRoute.kind === "redirect") {
    const url = request.nextUrl.clone()
    url.pathname = adminRoute.pathname
    url.search = ""
    return NextResponse.redirect(url)
  }
  const onAdminHost = Boolean(adminHost) && normalizeHost(request.headers.get("host")) === normalizeHost(adminHost)

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data } = await supabase.auth.getClaims()
  const isAuthenticated = Boolean(data?.claims?.sub)
  const { pathname, search } = request.nextUrl

  if (!isAuthenticated && !matches(pathname, PUBLIC_PREFIXES)) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.search = ""
    if (pathname !== "/" && !pathname.startsWith("/api/")) {
      url.searchParams.set("next", `${pathname}${search}`)
    }
    return NextResponse.redirect(url)
  }

  if (isAuthenticated && matches(pathname, GUEST_ONLY_PREFIXES)) {
    const url = request.nextUrl.clone()
    url.pathname = onAdminHost ? "/admin" : "/painel"
    url.search = ""
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.png|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)",
  ],
}
