import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { processQuestionWorkflow } from '@/lib/mercadolivre/workflow'
import { after } from 'next/server'

export const maxDuration = 60 // Liberar 1 minuto completo pra nossa IA responder calmamente sem a Vercel matar o processo!

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

        // 1. Criar o Job Pendente no banco de dados já como processing para bloquear retries
        const { error: insertError } = await supabase
          .from('question_jobs')
          .insert({
            question_id: questionId,
            seller_id: sellerId,
            item_id: 'buscando_item',
            question_text: 'Buscando do Mercado Livre...',
            status: 'processing',
          })
          
        if (insertError) {
          console.log(`[Webhook Duplicado] Ignorando pergunta ${questionId}. Erro ao inserir (já existe): ${insertError.message}`)
        } else {
          // 2. Colocar o processamento pesadão na fila de background do Next.js!
          // O `after()` garante que a Vercel não vai matar a função imediatamente após o return 200 OK,
          // mas permite que a gente devolva o 200 OK pro Mercado Livre em menos de 100ms!
          after(async () => {
            await processQuestionWorkflow(questionId, sellerId)
          })
        }
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
