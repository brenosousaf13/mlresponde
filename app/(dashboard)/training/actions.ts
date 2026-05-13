'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { fetchAnsweredQuestions } from '@/lib/mercadolivre/questions'
import { revalidatePath } from 'next/cache'

export async function syncHistoricalQuestions(sellerId: string) {
  try {
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

    // Puxar as últimas 50 perguntas respondidas
    const mlData = await fetchAnsweredQuestions(sellerId, 50)
    
    if (!mlData || !mlData.questions) {
      return { error: 'Falha ao buscar perguntas do Mercado Livre.' }
    }

    let insertedCount = 0

    // Para cada pergunta, preparamos o dado para salvar no banco
    for (const q of mlData.questions) {
      // Ignorar se não tiver texto da pergunta ou texto da resposta
      if (!q.text || !q.answer || !q.answer.text) continue

      const { error } = await supabaseAdmin
        .from('training_examples')
        .upsert({
          user_id: user.id,
          seller_id: sellerId,
          question_id: q.id.toString(),
          item_id: q.item_id,
          question_text: q.text,
          answer_text: q.answer.text,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'question_id'
        })

      if (!error) {
        insertedCount++
      } else {
        console.error('Erro ao inserir training example:', error)
      }
    }

    revalidatePath('/training')
    return { success: true, count: insertedCount }

  } catch (err: any) {
    console.error('Erro ao sincronizar treinamento:', err)
    return { error: err?.message || 'Erro desconhecido.' }
  }
}
