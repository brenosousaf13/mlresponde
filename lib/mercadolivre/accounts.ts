import "server-only"

import { fetchMlMe, type MlUser } from "@/lib/mercadolivre/api"
import {
  MlOAuthError,
  refreshAccessToken,
  type MlTokenResponse,
} from "@/lib/mercadolivre/oauth"
import { decryptSecret, encryptSecret } from "@/lib/security/crypto"
import { getTokenEncryptionKey } from "@/lib/security/keys"
import { createServiceClient } from "@/lib/supabase/admin"

const REFRESH_MARGIN_MS = 5 * 60 * 1000
const LEASE_SECONDS = 30
const LEASE_WAIT_ATTEMPTS = 10
const LEASE_WAIT_MS = 500

type ServiceClient = ReturnType<typeof createServiceClient>

function associatedData(accountId: string, kind: "access" | "refresh") {
  return `ml_account:${accountId}:${kind}`
}

async function storeTokens(admin: ServiceClient, accountId: string, tokens: MlTokenResponse) {
  const key = getTokenEncryptionKey()
  const { error } = await admin.from("ml_account_tokens").upsert(
    {
      ml_account_id: accountId,
      access_token_enc: encryptSecret(tokens.access_token, key, associatedData(accountId, "access")),
      refresh_token_enc: encryptSecret(tokens.refresh_token, key, associatedData(accountId, "refresh")),
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      refresh_lease_until: null,
    },
    { onConflict: "ml_account_id" }
  )
  if (error) throw error
}

export type ConnectResult =
  | { kind: "connected" | "reconnected" | "connected_inactive"; accountId: string }
  | { kind: "conflict" }

function isLimitError(error: { message?: string } | null) {
  return Boolean(error?.message?.includes("ML_ACCOUNTS_LIMIT_REACHED"))
}

export async function connectMlAccount(params: {
  organizationId: string
  userId: string
  tokens: MlTokenResponse
  mlUser: MlUser
}): Promise<ConnectResult> {
  const admin = createServiceClient()
  const { organizationId, userId, tokens, mlUser } = params

  const { data: existing, error: existingError } = await admin
    .from("ml_accounts")
    .select("id, organization_id, status")
    .eq("ml_user_id", mlUser.id)
    .maybeSingle()
  if (existingError) throw existingError

  if (existing && existing.organization_id !== organizationId) {
    return { kind: "conflict" }
  }

  const profileFields = {
    nickname: mlUser.nickname,
    site_id: mlUser.site_id,
    token_status: "valid",
    connected_by: userId,
    last_refresh_error: null,
    last_refresh_error_at: null,
  }

  if (existing) {
    const { error } = await admin
      .from("ml_accounts")
      .update({ ...profileFields, status: "active" })
      .eq("id", existing.id)
    let kind: ConnectResult["kind"] = "reconnected"
    if (error) {
      if (!isLimitError(error)) throw error
      const { error: inactiveError } = await admin
        .from("ml_accounts")
        .update({ ...profileFields, status: "inactive" })
        .eq("id", existing.id)
      if (inactiveError) throw inactiveError
      kind = "connected_inactive"
    }
    await storeTokens(admin, existing.id, tokens)
    return { kind, accountId: existing.id }
  }

  const insertAccount = (status: "active" | "inactive") =>
    admin
      .from("ml_accounts")
      .insert({ ...profileFields, organization_id: organizationId, ml_user_id: mlUser.id, status })
      .select("id")
      .single()

  let kind: ConnectResult["kind"] = "connected"
  let { data: created, error: createError } = await insertAccount("active")
  if (createError && isLimitError(createError)) {
    kind = "connected_inactive"
    ;({ data: created, error: createError } = await insertAccount("inactive"))
  }
  if (createError || !created) {
    if (createError?.code === "23505") return { kind: "conflict" }
    throw createError ?? new Error("Falha ao salvar a conta do Mercado Livre.")
  }

  await storeTokens(admin, created.id, tokens)
  return { kind, accountId: created.id }
}

export async function markTokenInvalid(accountId: string, message: string, admin: ServiceClient = createServiceClient()) {
  await admin
    .from("ml_accounts")
    .update({
      token_status: "invalid",
      last_refresh_error: message.slice(0, 500),
      last_refresh_error_at: new Date().toISOString(),
    })
    .eq("id", accountId)
}

export class MlAccountUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MlAccountUnavailableError"
  }
}

export async function getValidAccessToken(accountId: string): Promise<string> {
  const admin = createServiceClient()
  const key = getTokenEncryptionKey()

  for (let attempt = 0; attempt <= LEASE_WAIT_ATTEMPTS; attempt++) {
    const { data: row, error } = await admin
      .from("ml_account_tokens")
      .select("access_token_enc, refresh_token_enc, expires_at")
      .eq("ml_account_id", accountId)
      .maybeSingle()
    if (error) throw error
    if (!row) throw new MlAccountUnavailableError("Conta do Mercado Livre sem tokens. Reconecte a conta.")

    if (new Date(row.expires_at).getTime() - Date.now() > REFRESH_MARGIN_MS) {
      return decryptSecret(row.access_token_enc, key, associatedData(accountId, "access"))
    }

    const now = new Date()
    const { data: lease, error: leaseError } = await admin
      .from("ml_account_tokens")
      .update({ refresh_lease_until: new Date(now.getTime() + LEASE_SECONDS * 1000).toISOString() })
      .eq("ml_account_id", accountId)
      .or(`refresh_lease_until.is.null,refresh_lease_until.lt.${now.toISOString()}`)
      .select("refresh_token_enc")
      .maybeSingle()
    if (leaseError) throw leaseError

    if (!lease) {
      await new Promise((resolve) => setTimeout(resolve, LEASE_WAIT_MS))
      continue
    }

    try {
      const refreshToken = decryptSecret(lease.refresh_token_enc, key, associatedData(accountId, "refresh"))
      const tokens = await refreshAccessToken(refreshToken)
      await storeTokens(admin, accountId, tokens)
      await admin
        .from("ml_accounts")
        .update({ token_status: "valid", last_refresh_error: null, last_refresh_error_at: null })
        .eq("id", accountId)
      return tokens.access_token
    } catch (refreshError) {
      await admin.from("ml_account_tokens").update({ refresh_lease_until: null }).eq("ml_account_id", accountId)
      if (refreshError instanceof MlOAuthError && refreshError.code === "invalid_grant") {
        await markTokenInvalid(accountId, refreshError.message, admin)
        throw new MlAccountUnavailableError("A autorização do Mercado Livre expirou. Reconecte a conta.")
      }
      throw refreshError
    }
  }

  throw new Error("Tempo esgotado aguardando a renovação do token do Mercado Livre.")
}

export async function checkMlAccountConnection(accountId: string) {
  const accessToken = await getValidAccessToken(accountId)
  const mlUser = await fetchMlMe(accessToken)
  const admin = createServiceClient()
  await admin
    .from("ml_accounts")
    .update({ nickname: mlUser.nickname, site_id: mlUser.site_id, token_status: "valid" })
    .eq("id", accountId)
  return mlUser
}
