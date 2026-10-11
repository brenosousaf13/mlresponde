import "server-only"

import { createClient } from "@supabase/supabase-js"

import { serverEnv } from "@/lib/env"

import type { Database } from "./database.types"

export function createServiceClient() {
  return createClient<Database>(serverEnv.supabaseUrl(), serverEnv.supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function createStatelessAuthClient() {
  return createClient<Database>(serverEnv.supabaseUrl(), serverEnv.supabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
