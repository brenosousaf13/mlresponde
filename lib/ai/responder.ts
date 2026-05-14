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

  // 2. Buscar o Histórico de Respostas deste Produto (Treinamento)
  const { data: itemExamples } = await supabase
    .from('training_examples')
    .select('question_text, answer_text')
    .eq('seller_id', sellerId)
    .eq('item_id', item.id)
    .order('created_at', { ascending: false })
    .limit(3)

  // Se o item não tiver muitos exemplos, vamos buscar uma carga generosa (Amostragem Geral) da loja para entender o "Tom de voz"
  const fetchGeneralLimit = 20;
  let generalExamples: any[] = [];
  
  if (fetchGeneralLimit > 0) {
    const { data: genData } = await supabase
      .from('training_examples')
      .select('question_text, answer_text')
      .eq('seller_id', sellerId)
      .order('created_at', { ascending: false })
      .limit(fetchGeneralLimit)
      
    generalExamples = genData || []
  }

  // Filtrar duplicados e unir os do item específico com os gerais
  const allExamples = [...(itemExamples || []), ...generalExamples].filter(
    (ex, index, self) => index === self.findIndex((t) => t.question_text === ex.question_text)
  ).slice(0, 25)

  let trainingPromptBlock = ''
  if (allExamples.length > 0) {
    trainingPromptBlock = `\n<EXEMPLOS_HISTORICOS_DO_VENDEDOR>\nAbaixo estão dezenas de exemplos reais de como o vendedor respondeu aos clientes recentemente. Utilize-os estritamente para copiar o TOM DE VOZ, a formatação e as saudações do vendedor:\n`
    allExamples.forEach((ex, idx) => {
      trainingPromptBlock += `Exemplo ${idx + 1}:\nQ: ${ex.question_text}\nA: ${ex.answer_text}\n\n`
    })
    trainingPromptBlock += `</EXEMPLOS_HISTORICOS_DO_VENDEDOR>\n`
  }

  // 3. Extrair os atributos do item para a IA entender o produto de forma rápida
  const attributesString = item.attributes
    .map((attr) => `- ${attr.name}: ${attr.value_name}`)
    .join('\n')

  let variationsString = ''
  if (item.variations && item.variations.length > 0) {
    const activeVariations = item.variations.filter(v => v.available_quantity > 0)
    if (activeVariations.length > 0) {
      variationsString = '\n- Variações Disponíveis (Cores/Tamanhos COM ESTOQUE):\n'
      activeVariations.forEach(v => {
        const varAttrs = v.attribute_combinations.map(a => `${a.value_name}`).join(', ')
        variationsString += `  * ${varAttrs} (Estoque: ${v.available_quantity})\n`
      })
    } else {
      variationsString = '\n- Variações: (Todas as outras variações estão ESGOTADAS no momento)\n'
    }
  }

  // 4. Montar o Prompt Sistêmico (como a IA deve pensar e agir)
  const systemPrompt = `
Você é um excelente e experiente assistente de vendas no Mercado Livre. 
Seu papel é responder às perguntas dos clientes de forma direta, clara, cortês e que ajude a concretizar a venda.
Siga rigidamente as instruções gerais da loja repassadas abaixo. Se a pergunta for sobre um dado técnico, atributo ou disponibilidade de cor/tamanho, olhe os dados do produto abaixo e responda com base nisso.

<INSTRUÇÕES_DA_LOJA_E_POLITICAS>
${knowledgeContent}
</INSTRUÇÕES_DA_LOJA_E_POLITICAS>
${trainingPromptBlock}
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
- Atributos Principais:
${attributesString}${variationsString}

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
