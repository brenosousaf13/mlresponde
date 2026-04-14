'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function saveKnowledgeBase(sellerId: string, content: string) {
  if (!sellerId) {
    return { error: 'É necessário conectar o Mercado Livre antes de configurar a IA.' }
  }

  const supabase = createAdminClient()

  // Salvar a Base de Conhecimento, contornando proteções de RLS caso não feitas pelo usuário ainda
  const { error } = await supabase
    .from('knowledge_base')
    .upsert(
      {
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
