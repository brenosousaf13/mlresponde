import { createAdminClient } from '@/lib/supabase/server'
import { fetchQuestion, fetchItem, postAnswer } from '@/lib/mercadolivre/questions'
import { generateAnswer } from '@/lib/ai/responder'

export async function processQuestionWorkflow(question_id: string, seller_id: string) {
  const supabase = createAdminClient()

  try {
    // 1. Coletar a pergunta bruta primeiro para sabermos os IDs reais
    const question = await fetchQuestion(seller_id, question_id)
    const item = await fetchItem(seller_id, question.item_id)

    // 2. Marcar como "processing" e salvar a pergunta de verdade no banco
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

    // Evitar tentar postar resposta se o ML diz que já não está como pendente lá na loja
    if (question.status !== 'UNANSWERED') {
      // Vamos verificar se nós mesmos acabamos de responder isso no disparo anterior do ML
      const { data: existing } = await supabase.from('question_jobs').select('ai_response').eq('question_id', question_id).single()
      
      // Se tiver vazio, significa que o humano foi lá no app do ML e respondeu com o dedo
      if (!existing?.ai_response || existing.ai_response.includes('Buscando')) {
        await supabase
          .from('question_jobs')
          .update({ status: 'done', ai_response: 'Respondida manualmente pelo vendedor na plataforma.' })
          .eq('question_id', question_id)
      }
      
      return { success: true, message: 'Already answered' }
    }

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
