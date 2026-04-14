import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { processQuestionWorkflow } from '@/lib/mercadolivre/workflow'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    console.log("Recebido Webhook do Mercado Livre:", JSON.stringify(body))

    // Validar se é uma pergunta
    if (body.topic === 'questions' || body.resource?.startsWith('/questions/')) {
      const resourceUrl = body.resource as string
      const questionId = resourceUrl.split('/').pop()
      const sellerId = body.user_id?.toString()

      if (questionId && sellerId) {
        const supabase = createAdminClient()

        // 1. Criar o Job Pendente no banco de dados
        const { error: insertError } = await supabase
          .from('question_jobs')
          .insert({
            question_id: questionId,
            seller_id: sellerId,
            item_id: 'buscando_item',
            question_text: 'Buscando do Mercado Livre...',
            status: 'pending',
          })
          
        if (insertError) {
          console.log(`Aviso ao inserir job: ${insertError.message}`)
        }

        // 2. Aguarda o processamento de forma síncrona. 
        // A Vercel mata a execução de fetch() em background não-awaitted nas suas functions serverless (Hobby).
        // Como o GPT-4o-mini responde em ~2-3s e o limite de HTTP do Webhook da ML é 20s, podemos e devemos usar await!
        await processQuestionWorkflow(questionId, sellerId)
      }
    }

    // Mercado Livre exige que a gente mande um HTTP 200 de forma muito agressiva/rápida.
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function GET() {
  // Mantemos o GET para a validação inicial do app (quando o usuário cadastra a URL)
  return NextResponse.json({ status: 'Webhook is active' }, { status: 200 })
}
