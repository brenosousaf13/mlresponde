'use client'

import { useState } from 'react'
import { saveKnowledgeBase } from './actions'

export default function KnowledgeForm({
  sellerId,
  initialContent
}: {
  sellerId: string | undefined
  initialContent: string
}) {
  const [content, setContent] = useState(initialContent)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!sellerId) {
      setMessage({ type: 'error', text: 'Você precisa conectar o ID do Mercado Livre primeiro!' })
      return
    }

    setSaving(true)
    setMessage(null)

    const result = await saveKnowledgeBase(sellerId, content)

    setSaving(false)

    if (result.error) {
      setMessage({ type: 'error', text: result.error })
    } else {
      setMessage({ type: 'success', text: 'Regras da IA salvas com sucesso!' })
      setTimeout(() => setMessage(null), 3000)
    }
  }

  if (!sellerId) {
    return (
      <div className="p-4 bg-gray-50 text-gray-500 rounded-lg dark:bg-gray-800/50 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-700">
        Conecte sua conta do Mercado Livre acima para destravar a Base de Conhecimento.
      </div>
    )
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-4">
      {message && (
        <div className={\`p-3 rounded-lg text-sm font-medium \${
          message.type === 'success' 
            ? 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/30 dark:border-green-800 dark:text-green-400' 
            : 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400'
        }\`}>
          {message.text}
        </div>
      )}

      <div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          placeholder="Exemplo: Postamos produtos sempre até as 16h em dias úteis. Nunca damos desconto diretamente nas perguntas. Nossos produtos têm 90 dias de garantia..."
          className="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-y"
          required
        />
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Seja direto e claro nas regras. O GPT-4o-mini vai ler esse manual sempre que um cliente fizer qualquer pergunta e vai respondê-la de acordo com suas regras.
        </p>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-semibold text-white transition-all bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <svg className="w-4 h-4 animate-spin outline-none" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Salvando...
            </>
          ) : (
            'Salvar Instruções da IA'
          )}
        </button>
      </div>
    </form>
  )
}
