import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchQuestion, fetchItem, postAnswer } from '@/lib/mercadolivre/questions'
import { generateAnswer } from '@/lib/ai/responder'

export async function POST(request: Request) {
  const body = await request.json()
  const { question_id, seller_id } = body

  if (!question_id || !seller_id) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
  }

  const supabase = createAdminClient()

  try {
    // 1. Marcar como "processing"
    await supabase
      .from('question_jobs')
      .update({ status: 'processing' })
      .eq('question_id', question_id)

    // 2. Coletar a pergunta bruta
    const question = await fetchQuestion(seller_id, question_id)
    
    // Evitar responder perguntas que já foram respondidas no passado (Status !== UNANSWERED)
    if (question.status !== 'UNANSWERED') {
      await supabase
        .from('question_jobs')
        .update({ status: 'done', response_generated: 'Pergunta já não estava pendente.' })
        .eq('question_id', question_id)
      
      return NextResponse.json({ success: true, message: 'Already answered' })
    }

    // 3. Coletar detalhes do anúncio para contexto
    const item = await fetchItem(seller_id, question.item_id)

    // 4. Magia Pura: Passar pra IA entender a pergunta baseada nas regras da loja 
    const finalAnswer = await generateAnswer(seller_id, question, item)

    // 5. Postar no Mercado Livre ("digitar enter" como atendente real)
    await postAnswer(seller_id, question_id, finalAnswer)

    // 6. Atualizar o banco com o trabalho finalizado perfeitamente
    await supabase
      .from('question_jobs')
      .update({ 
        status: 'done',
        response_generated: finalAnswer,
        updated_at: new Date().toISOString()
      })
      .eq('question_id', question_id)

    return NextResponse.json({ success: true, answer: finalAnswer })
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

    return NextResponse.json({ error: error?.message }, { status: 500 })
  }
}
