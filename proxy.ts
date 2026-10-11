import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

const PUBLIC_PREFIXES = [
  "/login",
  "/cadastro",
  "/verificar-email",
  "/recuperar-senha",
  "/auth/confirm",
  "/termos",
  "/privacidade",
  "/api/webhook",
]

const GUEST_ONLY_PREFIXES = ["/login", "/cadastro", "/verificar-email", "/recuperar-senha"]

function matches(pathname: string, prefixes: readonly string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export async function proxy(request: NextRequest) {
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
    url.pathname = "/painel"
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
