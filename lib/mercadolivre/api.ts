import "server-only"

export const ML_API_URL = "https://api.mercadolibre.com"

export type MlUser = {
  id: number
  nickname: string
  site_id: string
}

export class MlApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message)
    this.name = "MlApiError"
  }
}

export async function fetchMlMe(accessToken: string): Promise<MlUser> {
  const response = await fetch(`${ML_API_URL}/users/me`, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
    cache: "no-store",
  })
  if (!response.ok) {
    throw new MlApiError(`Falha ao consultar o usuário do Mercado Livre (HTTP ${response.status})`, response.status)
  }
  const data = (await response.json()) as Partial<MlUser>
  if (typeof data.id !== "number") {
    throw new MlApiError("Resposta inesperada do Mercado Livre em /users/me", response.status)
  }
  return { id: data.id, nickname: data.nickname ?? "", site_id: data.site_id ?? "MLB" }
}
