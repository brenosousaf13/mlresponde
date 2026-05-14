import { login } from './actions'

export default async function LoginPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const searchParams = await props.searchParams;
  const error = searchParams?.error;

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 bg-gradient-to-br from-gray-50 to-gray-200 dark:from-gray-900 dark:to-gray-800">
      <div className="w-full max-w-sm p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700">
        <div className="flex flex-col items-center mb-8">
          <img src="/logo.png" alt="Meli Fácil Logo" className="h-16 mb-4 object-contain drop-shadow-md" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white text-center">Meli Fácil</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Faça login para acessar o sistema</p>
        </div>
        
        <form className="flex flex-col gap-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5" htmlFor="email">E-mail</label>
            <input className="block w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#011c3a] focus:border-transparent transition-all sm:text-sm dark:bg-gray-700/50 dark:border-gray-600 dark:text-white dark:focus:ring-[#011c3a]" id="email" name="email" type="email" placeholder="seu@email.com" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5" htmlFor="password">Senha</label>
            <input className="block w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#011c3a] focus:border-transparent transition-all sm:text-sm dark:bg-gray-700/50 dark:border-gray-600 dark:text-white dark:focus:ring-[#011c3a]" id="password" name="password" type="password" placeholder="••••••••" required />
          </div>
          {error && (
             <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 dark:bg-red-900/30 dark:border-red-900/50 dark:text-red-400 text-center">
               E-mail ou senha incorretos
             </div>
          )}
          <button formAction={login} className="w-full flex justify-center py-3 px-4 rounded-lg shadow-lg shadow-[#011c3a]/30 text-sm font-medium text-white bg-[#011c3a] hover:bg-[#022c5c] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#011c3a] mt-2 transition-all active:scale-[0.98]">
            Entrar
          </button>
        </form>
      </div>
    </div>
  )
}
