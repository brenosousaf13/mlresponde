import "server-only"

import { DEFAULT_ANSWER_MODEL } from "@/lib/answers/model"

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Variável de ambiente ausente: ${name}`)
  }
  return value
}

export const serverEnv = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  mlClientId: () => required("ML_CLIENT_ID"),
  mlClientSecret: () => required("ML_CLIENT_SECRET"),
  mlRedirectUri: () => required("ML_REDIRECT_URI"),
  tokenEncryptionKey: () => required("ML_TOKEN_ENCRYPTION_KEY"),
  /** Último recurso das chamadas à IA: vale quando não há chave em uso no painel (lib/ai/key-store.ts). */
  openaiApiKey: () => process.env.OPENAI_API_KEY?.trim() || null,
  /** Chave-mestra (32 bytes em base64) que tranca as chaves de IA cadastradas no painel. */
  aiKeysEncryptionKey: () => process.env.AI_KEYS_ENCRYPTION_KEY?.trim() || null,
  openaiModel: () => process.env.OPENAI_MODEL?.trim() || DEFAULT_ANSWER_MODEL,
  cronSecret: () => process.env.CRON_SECRET || "",
  /** E-mails de alerta do Escudo de Reputação (Resend). Sem ela, os e-mails ficam desligados. */
  resendApiKey: () => process.env.RESEND_API_KEY?.trim() || null,
}
