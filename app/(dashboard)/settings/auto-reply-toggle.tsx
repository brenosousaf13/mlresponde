'use client'

import { useState } from 'react'
import { toggleAutoReply } from './actions'

export default function AutoReplyToggle({ sellerId, initialStatus }: { sellerId: string, initialStatus: boolean }) {
  const [enabled, setEnabled] = useState(initialStatus)
  const [loading, setLoading] = useState(false)

  const handleToggle = async () => {
    setLoading(true)
    const newStatus = !enabled
    
    // Optimistic update
    setEnabled(newStatus)
    
    const res = await toggleAutoReply(sellerId, newStatus)
    if (res.error) {
      // Revert on error
      setEnabled(!newStatus)
      alert(res.error)
    }
    
    setLoading(false)
  }

  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700 mb-6">
      <div>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Automação de Respostas</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {enabled 
            ? "O robô está ativo e responderá clientes automaticamente." 
            : "O robô está pausado. Você pode acompanhar as perguntas, mas ele não responderá."}
        </p>
      </div>
      
      <button
        onClick={handleToggle}
        disabled={loading}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#011c3a] focus:ring-offset-2 ${
          enabled ? 'bg-[#011c3a]' : 'bg-gray-300 dark:bg-gray-600'
        } ${loading ? 'opacity-50' : 'opacity-100'}`}
        role="switch"
        aria-checked={enabled}
      >
        <span
          aria-hidden="true"
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            enabled ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}
