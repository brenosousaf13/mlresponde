'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function saveKnowledgeBase(sellerId: string, content: string) {
  if (!sellerId) {
    return { error: 'É necessário conectar o Mercado Livre antes de configurar a IA.' }
  }

  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()

  if (!user) {
    return { error: 'Não autenticado.' }
  }

  const supabaseAdmin = createAdminClient()

  // Validar se o sellerId pertence de fato a este usuário
  const { data: creds } = await supabaseAdmin
    .from('ml_credentials')
    .select('id')
    .eq('user_id', user.id)
    .eq('seller_id', sellerId)
    .single()

  if (!creds) {
    return { error: 'Permissão negada. Esta conta ML não está vinculada a você.' }
  }

  // Salvar a Base de Conhecimento vinculada ao seller e ao user
  const { error } = await supabaseAdmin
    .from('knowledge_base')
    .upsert(
      {
        user_id: user.id,
        seller_id: sellerId,
        content: content,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'seller_id' }
    )

  if (error) {
    console.error('Save KnowledgeBase error:', error)
    return { error: 'Falha ao salvar a base de conhecimento no Banco de Dados.' }
  }

  revalidatePath('/settings') // Dispara um refresh no server componente para os dados mais recentes
  return { success: true }
}

export async function toggleAutoReply(sellerId: string, enabled: boolean) {
  if (!sellerId) return { error: 'Seller ID inválido.' }

  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()

  if (!user) return { error: 'Não autenticado.' }

  const supabaseAdmin = createAdminClient()

  // Atualizar a coluna auto_reply_enabled
  const { error } = await supabaseAdmin
    .from('ml_credentials')
    .update({ auto_reply_enabled: enabled, updated_at: new Date().toISOString() })
    .eq('seller_id', sellerId)
    .eq('user_id', user.id)

  if (error) {
    console.error('Toggle AutoReply error:', error)
    return { error: 'Falha ao atualizar o status da automação no Banco de Dados.' }
  }

  revalidatePath('/settings')
  return { success: true }
}
