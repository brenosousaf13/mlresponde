import "server-only"

import { serverEnv } from "@/lib/env"

const AUTHORIZATION_URL = "https://auth.mercadolivre.com.br/authorization"
const TOKEN_URL = "https://api.mercadolibre.com/oauth/token"

export type MlTokenResponse = {
  access_token: string
  refresh_token: string
  expires_in: number
  user_id: number
  scope?: string
}

export class MlOAuthError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly status?: number
  ) {
    super(message)
    this.name = "MlOAuthError"
  }
}

export function buildAuthorizationUrl(params: { state: string; codeChallenge: string }) {
  const url = new URL(AUTHORIZATION_URL)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", serverEnv.mlClientId())
  url.searchParams.set("redirect_uri", serverEnv.mlRedirectUri())
  url.searchParams.set("state", params.state)
  url.searchParams.set("code_challenge", params.codeChallenge)
  url.searchParams.set("code_challenge_method", "S256")
  return url
}

async function requestToken(body: Record<string, string>): Promise<MlTokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
    cache: "no-store",
  })
  const data = (await response.json().catch(() => ({}))) as Partial<MlTokenResponse> & {
    error?: string
    message?: string
  }
  if (!response.ok || !data.access_token || !data.refresh_token || !data.expires_in) {
    throw new MlOAuthError(
      data.message || data.error || `Falha no token do Mercado Livre (HTTP ${response.status})`,
      data.error,
      response.status
    )
  }
  return data as MlTokenResponse
}

export function exchangeAuthorizationCode(code: string, codeVerifier: string) {
  return requestToken({
    grant_type: "authorization_code",
    client_id: serverEnv.mlClientId(),
    client_secret: serverEnv.mlClientSecret(),
    code,
    redirect_uri: serverEnv.mlRedirectUri(),
    code_verifier: codeVerifier,
  })
}

export function refreshAccessToken(refreshToken: string) {
  return requestToken({
    grant_type: "refresh_token",
    client_id: serverEnv.mlClientId(),
    client_secret: serverEnv.mlClientSecret(),
    refresh_token: refreshToken,
  })
}
