import { createAdminClient } from '@/lib/supabase/server'
import { fetchQuestion, fetchItem, postAnswer } from '@/lib/mercadolivre/questions'
import { generateAnswer } from '@/lib/ai/responder'

export async function processQuestionWorkflow(question_id: string, seller_id: string) {
  const supabase = createAdminClient()

  try {
    // 1. Coletar a pergunta bruta primeiro para sabermos os IDs reais
    const question = await fetchQuestion(seller_id, question_id)
    const item = await fetchItem(seller_id, question.item_id)

    // 2. Antes de mexer no banco com status de processamento, verificar se o ML diz que já não está pendente!
    // (O ML manda webhooks repetidos. Se a gente setar "processing" de cara, a pergunta q já tava verde vai voltar pra azul antes de abortar!)
    if (question.status !== 'UNANSWERED') {
      const { data: existing } = await supabase.from('question_jobs').select('ai_response').eq('question_id', question_id).single()
      
      if (!existing?.ai_response || existing.ai_response.includes('Buscando')) {
        await supabase
          .from('question_jobs')
          .update({ 
            status: 'done', 
            ai_response: 'Respondida manualmente pelo vendedor na plataforma.',
            item_id: item.id,
            item_title: item.title,
            item_url: item.permalink,
            question_text: question.text
          })
          .eq('question_id', question_id)
      } else {
        // Se já tem a nossa resposta perfeita lá, força manter o status "done" só por garantia
         await supabase.from('question_jobs').update({ status: 'done' }).eq('question_id', question_id)
      }
      
      return { success: true, message: 'Already answered' }
    }

    // 3. Como a pergunta é virgem, vamos marcar como "processing" e salvar a pergunta de verdade no banco
    await supabase
      .from('question_jobs')
      .update({ 
        status: 'processing',
        item_id: item.id,
        item_title: item.title,
        item_url: item.permalink,
        question_text: question.text
      })
      .eq('question_id', question_id)

    // 3. IA Formula a resposta baseada nas regras
    const finalAnswer = await generateAnswer(seller_id, question, item)

    // 4. Postar na plataforma do Mercado Livre
    await postAnswer(seller_id, question_id, finalAnswer)

    // 5. Atualizar o banco com o trabalho concluído
    await supabase
      .from('question_jobs')
      .update({ 
        status: 'done',
        ai_response: finalAnswer,
        updated_at: new Date().toISOString()
      })
      .eq('question_id', question_id)

    return { success: true, answer: finalAnswer }
  } catch (error: any) {
    console.error(`Erro processando pergunta ${question_id}:`, error)
    
    // Marca o job como "error", para não prender no "processing"
    await supabase
      .from('question_jobs')
      .update({ 
        status: 'error',
        error_message: error?.message || 'Erro desconhecido',
        updated_at: new Date().toISOString()
      })
      .eq('question_id', question_id)

    return { error: error?.message || 'Unknown error' }
  }
}
