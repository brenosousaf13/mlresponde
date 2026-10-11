import { NextResponse, type NextRequest } from "next/server"

import { canManageOrganization, getAppContext } from "@/lib/dal/app-context"
import { buildAuthorizationUrl } from "@/lib/mercadolivre/oauth"
import {
  ML_OAUTH_COOKIE,
  ML_OAUTH_COOKIE_PATH,
  ML_OAUTH_MAX_AGE_SECONDS,
  sealOAuthPayload,
} from "@/lib/mercadolivre/oauth-cookie"
import { codeChallengeS256, generateCodeVerifier, generateState } from "@/lib/mercadolivre/pkce"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const context = await getAppContext()

  if (!context.profile.onboardingCompletedAt) {
    return NextResponse.redirect(new URL("/onboarding", request.url))
  }
  if (context.access.state === "blocked") {
    return NextResponse.redirect(new URL("/assinatura", request.url))
  }
  if (!canManageOrganization(context.role)) {
    return NextResponse.redirect(new URL("/contas?ml=sem-permissao", request.url))
  }

  const state = generateState()
  const verifier = generateCodeVerifier()

  const response = NextResponse.redirect(
    buildAuthorizationUrl({ state, codeChallenge: codeChallengeS256(verifier) })
  )
  response.cookies.set(
    ML_OAUTH_COOKIE,
    sealOAuthPayload({
      state,
      verifier,
      userId: context.user.id,
      organizationId: context.organization.id,
      expiresAt: Date.now() + ML_OAUTH_MAX_AGE_SECONDS * 1000,
    }),
    {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: ML_OAUTH_COOKIE_PATH,
      maxAge: ML_OAUTH_MAX_AGE_SECONDS,
    }
  )
  return response
}
