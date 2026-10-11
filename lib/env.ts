import "server-only"

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
  openaiApiKey: () => required("OPENAI_API_KEY"),
  openaiModel: () => process.env.OPENAI_MODEL || "gpt-4o-mini",
  cronSecret: () => process.env.CRON_SECRET || "",
}
