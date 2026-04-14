import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    console.log("Recebido Webhook do Mercado Livre:", JSON.stringify(body))

    // Validar se é uma pergunta
    if (body.topic === 'questions' || body.resource?.startsWith('/questions/')) {
      const resourceUrl = body.resource as string
      // "/questions/123456" => "123456"
      const questionId = resourceUrl.split('/').pop()
      const sellerId = body.user_id?.toString()

      if (questionId && sellerId) {
        const supabase = createAdminClient()

        // 1. Criar o Job Pendente no banco de dados para segurança
        const { error: insertError } = await supabase
          .from('question_jobs')
          .insert({
            question_id: questionId,
            seller_id: sellerId,
            item_id: 'buscando_item',
            question_text: 'Baixando detalhes da pergunta...',
            status: 'pending',
          })
          
        if (insertError) {
          // Se já existir por duplicate hook do ML, vai falhar (unique index/PK), podemos ignorar.
          console.log(`Aviso ao inserir job: ${insertError.message}`)
        }

        // 2. Disparar a nossa rota interna de processamento pesadão.
        // NÃO daremos AWAIT para que a resposta HTTP 200 volte imediatamente 
        // pro Mercado Livre, evitando de tomar timeout da plataforma deles!
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.url.split('/api')[0]
        fetch(`${appUrl}/api/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question_id: questionId, seller_id: sellerId }),
        }).catch(err => console.error("Falha ao invocar backend worker:", err))
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
