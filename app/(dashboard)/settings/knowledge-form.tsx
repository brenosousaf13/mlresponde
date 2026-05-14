'use client'

import { useState } from 'react'
import { saveKnowledgeBase, generateKnowledgeFromHistory } from './actions'

export default function KnowledgeForm({
  sellerId,
  initialContent
}: {
  sellerId: string | undefined
  initialContent: string
}) {
  const [content, setContent] = useState(initialContent)
  const [saving, setSaving] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  const handleGenerateFromHistory = async () => {
    if (!sellerId) return
    setIsGenerating(true)
    setMessage(null)

    const result = await generateKnowledgeFromHistory(sellerId)
    setIsGenerating(false)

    if (result.error) {
      setMessage({ type: 'error', text: result.error })
    } else if (result.text) {
      setContent(result.text)
      setMessage({ type: 'success', text: 'Regras geradas com sucesso! Revise o texto e clique em Salvar.' })
    }
  }

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
        <div className={`p-3 rounded-lg text-sm font-medium ${
          message.type === 'success' 
            ? 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/30 dark:border-green-800 dark:text-green-400' 
            : 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400'
        }`}>
          {message.text}
        </div>
      )}

      <div>
        <div className="flex justify-between items-end mb-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Regras de Atendimento
          </label>
          <button
            type="button"
            onClick={handleGenerateFromHistory}
            disabled={isGenerating}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 transition-colors dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800"
          >
            {isGenerating ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Analisando Histórico...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                  <path fillRule="evenodd" d="M9 4.5a.75.75 0 0 1 .721.544l.813 2.846a3.75 3.75 0 0 0 2.576 2.576l2.846.813a.75.75 0 0 1 0 1.442l-2.846.813a3.75 3.75 0 0 0-2.576 2.576l-.813 2.846a.75.75 0 0 1-1.442 0l-.813-2.846a3.75 3.75 0 0 0-2.576-2.576l-2.846-.813a.75.75 0 0 1 0-1.442l2.846-.813A3.75 3.75 0 0 0 7.466 7.89l.813-2.846A.75.75 0 0 1 9 4.5ZM18 1.5a.75.75 0 0 1 .728.568l.258 1.036c.236.94.97 1.674 1.91 1.91l1.036.258a.75.75 0 0 1 0 1.456l-1.036.258c-.94.236-1.674.97-1.91 1.91l-.258 1.036a.75.75 0 0 1-1.456 0l-.258-1.036a2.625 2.625 0 0 0-1.91-1.91l-1.036-.258a.75.75 0 0 1 0-1.456l1.036-.258a2.625 2.625 0 0 0 1.91-1.91l.258-1.036A.75.75 0 0 1 18 1.5ZM16.5 15a.75.75 0 0 1 .712.513l.394 1.183c.15.447.5.799.948.948l1.183.395a.75.75 0 0 1 0 1.422l-1.183.395c-.447.15-.799.5-.948.948l-.395 1.183a.75.75 0 0 1-1.422 0l-.395-1.183a1.5 1.5 0 0 0-.948-.948l-1.183-.395a.75.75 0 0 1 0-1.422l1.183-.395c.447-.15.799-.5.948-.948l.395-1.183A.75.75 0 0 1 16.5 15Z" clipRule="evenodd" />
                </svg>
                Extrair Regras da IA Magicamente
              </>
            )}
          </button>
        </div>
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
