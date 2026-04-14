export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Dashboard</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Acompanhe as perguntas do Mercado Livre em tempo real.</p>
      </div>
      
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
        </div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">ML AI Responder — em construção</h3>
        <p className="text-gray-500 dark:text-gray-400 mt-2 max-w-sm">
          A lista de perguntas aparecerá aqui nas próximas fases do desenvolvimento.
        </p>
      </div>
    </div>
  )
}
