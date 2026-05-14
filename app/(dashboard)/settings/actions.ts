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

import OpenAI from 'openai'

export async function generateKnowledgeFromHistory(sellerId: string) {
  if (!sellerId) return { error: 'Seller ID inválido.' }

  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()

  if (!user) return { error: 'Não autenticado.' }

  const supabaseAdmin = createAdminClient()

  const { data: creds } = await supabaseAdmin
    .from('ml_credentials')
    .select('id')
    .eq('user_id', user.id)
    .eq('seller_id', sellerId)
    .single()

  if (!creds) {
    return { error: 'Permissão negada. Esta conta ML não está vinculada a você.' }
  }

  // 1. Puxar 100 exemplos mais recentes da base de treinamento
  const { data: examples } = await supabaseAdmin
    .from('training_examples')
    .select('question_text, answer_text')
    .eq('user_id', user.id)
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (!examples || examples.length === 0) {
    return { error: 'Você ainda não possui histórico sincronizado. Vá na aba "Treinamento" e sincronize suas perguntas primeiro.' }
  }

  // 2. Montar texto formatado
  let historyText = ''
  examples.forEach((ex, idx) => {
    historyText += `[Q${idx+1}]: ${ex.question_text}\n[A${idx+1}]: ${ex.answer_text}\n\n`
  })

  // 3. Chamar GPT-4o-mini para analisar
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || '',
  })

  const systemPrompt = `
Você é um especialista em análise de atendimento ao cliente e estruturação de manuais.
O usuário fornecerá um histórico com até 100 perguntas de clientes e respostas dadas pelo vendedor no Mercado Livre.

Sua missão é:
1. Ler todas essas respostas.
2. Extrair o PADRÃO DE COMPORTAMENTO do vendedor.
3. Criar um "Manual de Instruções" claro, direto e em primeira pessoa do plural (Nós), que será usado por uma IA no futuro para imitar o vendedor.

Pontos a analisar no histórico (se existirem):
- Como o vendedor cumprimenta e se despede?
- O que ele diz sobre prazos de postagem?
- O que ele diz sobre garantias e devoluções?
- Ele costuma dar descontos quando o cliente pede? Como ele nega?
- Que tipo de tom ele usa? (formal, direto, animado, seco?)

Formato da saída:
Devolva APENAS O TEXTO DO MANUAL, sem formatações Markdown complexas, sem títulos grandes, direto ao ponto. Comece direto com as regras, por exemplo:
"Sempre cumprimente o cliente com 'Olá!'. Nossas postagens são feitas até as 16h..."
`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Aqui está o histórico das minhas últimas respostas:\n\n${historyText}` }
      ],
      max_tokens: 800,
      temperature: 0.3,
    })

    const generatedText = response.choices[0]?.message?.content?.trim()
    
    if (!generatedText) {
      return { error: 'A IA não conseguiu gerar o texto. Tente novamente.' }
    }

    return { success: true, text: generatedText }
  } catch (error: any) {
    console.error('Erro ao gerar manual da IA:', error)
    return { error: 'Erro de comunicação com a OpenAI. Verifique os logs.' }
  }
}
