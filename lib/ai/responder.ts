import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/server'
import { MLQuestion, MLItem } from '../mercadolivre/questions'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
})

export async function generateAnswer(
  sellerId: string,
  question: MLQuestion,
  item: MLItem
) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Chave da API da OpenAI não está configurada (OPENAI_API_KEY)')
  }

  // 1. Opcional: Buscar a base de conhecimento (Knowledge Base) desse vendedor no Supabase
  const supabase = createAdminClient()
  const { data: kb_data } = await supabase
    .from('knowledge_base')
    .select('content')
    .eq('seller_id', sellerId)
    .single()

  const knowledgeContent = kb_data?.content || 'Nenhuma regra específica cadastrada no sistema. Use o bom senso comercial.'

  // 2. Extrair os atributos do item para a IA entender o produto de forma rápida
  const attributesString = item.attributes
    .map((attr) => `- ${attr.name}: ${attr.value_name}`)
    .join('\n')

  // 3. Montar o Prompt Sistêmico (como a IA deve pensar e agir)
  const systemPrompt = `
Você é um excelente e experiente assistente de vendas no Mercado Livre. 
Seu papel é responder às perguntas dos clientes de forma direta, clara, cortês e que ajude a concretizar a venda.
Siga rigidamente as instruções gerais da loja repassadas abaixo. Se a pergunta for sobre um dado técnico ou atributo, e constar nos atributos abaixo, responda informando.

<INSTRUÇÕES_DA_LOJA_E_POLITICAS>
${knowledgeContent}
</INSTRUÇÕES_DA_LOJA_E_POLITICAS>

Lembre-se:
1. Comece com uma saudação breve (ex: "Olá!").
2. Em chamadas para ação use gatilhos sutis (ex: "Aguardamos sua compra!").
3. Não divague, não minta. Se não souber responder, diga que precisa confirmar e o cliente pode enviar a pergunta novamente depois.
4. Responda APENAS o texto livre para o chat, sem título, sem formatação markdown (* ou #), pois o Mercado Livre não suporta isso de maneira agradável e é texto simples.
`

  // 4. Montar a instrução específica daquela requisição
  const userPrompt = `
O cliente fez a seguinte pergunta no nosso anúncio.

DADOS DO PRODUTO:
- Título: ${item.title}
- Preço: R$ ${item.price}
- Atributos:
${attributesString}

MENSAGEM/PERGUNTA DO CLIENTE:
"${question.text}"

Por favor, elabore a resposta final e me entregue apenas o texto que eu devo enviar a ele.
  `

  // 5. Chamar a IA para inferência
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini', // Modelo rápido e inteligente para tarefas de resposta
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    max_tokens: 400,
    temperature: 0.3,
  })

  // Obtendo o texto gerado
  const finalMessage = response.choices[0]?.message?.content
  if (finalMessage) {
    return finalMessage.trim()
  }

  return 'Olá! Não conseguimos processar sua solicitação no momento. Por favor tente novamente.'
}
