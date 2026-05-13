'use client'

import { useState } from 'react'
import { syncHistoricalQuestions } from './actions'

export default function SyncButton({ sellerId }: { sellerId: string }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success?: boolean, error?: string, count?: number } | null>(null)

  const handleSync = async () => {
    setLoading(true)
    setResult(null)
    const res = await syncHistoricalQuestions(sellerId)
    setResult(res)
    setLoading(false)
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <button
        onClick={handleSync}
        disabled={loading}
        className="inline-flex items-center gap-2 justify-center py-2.5 px-6 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {loading ? (
          <>
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            Sincronizando...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            Sincronizar Histórico do ML
          </>
        )}
      </button>

      {result?.error && (
        <p className="text-sm text-red-600 dark:text-red-400 font-medium">{result.error}</p>
      )}
      {result?.success && (
        <p className="text-sm text-green-600 dark:text-green-400 font-medium">
          Sincronização concluída! {result.count} perguntas processadas/atualizadas.
        </p>
      )}
    </div>
  )
}
