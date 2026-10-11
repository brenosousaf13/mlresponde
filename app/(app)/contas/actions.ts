"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { MlApiError } from "@/lib/mercadolivre/api"
import {
  MlAccountUnavailableError,
  checkMlAccountConnection,
} from "@/lib/mercadolivre/accounts"
import { canManageOrganization, requireSection } from "@/lib/dal/app-context"
import { createServiceClient } from "@/lib/supabase/admin"

export type ActionResult = { ok: boolean; message: string }

const accountIdSchema = z.string().uuid()

async function loadManagedAccount(accountId: string) {
  const context = await requireSection("contas")
  if (!canManageOrganization(context.role)) {
    return { error: "Você não tem permissão para gerenciar as contas desta loja." } as const
  }
  const parsedId = accountIdSchema.safeParse(accountId)
  if (!parsedId.success) return { error: "Conta não encontrada." } as const

  const admin = createServiceClient()
  const { data: account, error } = await admin
    .from("ml_accounts")
    .select("id, status, nickname")
    .eq("id", parsedId.data)
    .eq("organization_id", context.organization.id)
    .maybeSingle()
  if (error) throw error
  if (!account) return { error: "Conta não encontrada." } as const
  return { context, admin, account } as const
}

function refresh() {
  revalidatePath("/", "layout")
}

export async function setMlAccountStatus(
  accountId: string,
  status: "active" | "inactive"
): Promise<ActionResult> {
  const loaded = await loadManagedAccount(accountId)
  if ("error" in loaded) return { ok: false, message: loaded.error ?? "Erro." }
  const { admin, account, context } = loaded

  if (status === "active" && account.status === "disconnected") {
    return { ok: false, message: "Reconecte essa conta antes de ativá-la." }
  }
  if (account.status === status) return { ok: true, message: "Nada mudou." }

  const { error } = await admin.from("ml_accounts").update({ status }).eq("id", account.id)
  if (error) {
    if (error.message.includes("ML_ACCOUNTS_LIMIT_REACHED")) {
      const limit = context.organization.mlAccountsLimit
      return {
        ok: false,
        message: `Seu plano permite ${limit} conta${limit === 1 ? "" : "s"} ativa${limit === 1 ? "" : "s"}. Desative outra conta antes.`,
      }
    }
    throw error
  }

  refresh()
  return {
    ok: true,
    message: status === "active" ? "Conta ativada." : "Conta desativada. O histórico continua guardado.",
  }
}

export async function disconnectMlAccount(accountId: string): Promise<ActionResult> {
  const loaded = await loadManagedAccount(accountId)
  if ("error" in loaded) return { ok: false, message: loaded.error ?? "Erro." }
  const { admin, account } = loaded

  const { error: tokensError } = await admin
    .from("ml_account_tokens")
    .delete()
    .eq("ml_account_id", account.id)
  if (tokensError) throw tokensError

  const { error } = await admin
    .from("ml_accounts")
    .update({ status: "disconnected" })
    .eq("id", account.id)
  if (error) throw error

  refresh()
  return { ok: true, message: "Conta desconectada. Você pode reconectá-la quando quiser." }
}

export async function checkMlAccount(accountId: string): Promise<ActionResult> {
  const loaded = await loadManagedAccount(accountId)
  if ("error" in loaded) return { ok: false, message: loaded.error ?? "Erro." }
  const { admin, account } = loaded

  if (account.status === "disconnected") {
    return { ok: false, message: "Essa conta está desconectada. Reconecte para verificar." }
  }

  try {
    const mlUser = await checkMlAccountConnection(account.id)
    refresh()
    return { ok: true, message: `Conexão funcionando: ${mlUser.nickname}.` }
  } catch (error) {
    if (error instanceof MlAccountUnavailableError) {
      refresh()
      return { ok: false, message: error.message }
    }
    if (error instanceof MlApiError && (error.status === 401 || error.status === 403)) {
      await admin
        .from("ml_accounts")
        .update({
          token_status: "invalid",
          last_refresh_error: error.message.slice(0, 500),
          last_refresh_error_at: new Date().toISOString(),
        })
        .eq("id", account.id)
      refresh()
      return { ok: false, message: "O Mercado Livre recusou o acesso. Reconecte a conta." }
    }
    return { ok: false, message: "Não foi possível falar com o Mercado Livre agora. Tente de novo em instantes." }
  }
}
