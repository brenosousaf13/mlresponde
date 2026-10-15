import { appHref } from "@/lib/site/host"
import { buildLlmsTxt } from "@/lib/site/seo"

/** /llms.txt: resumo da maanu para assistentes de IA (gerado na build a partir dos mesmos dados da página de vendas). */
export const dynamic = "force-static"

export function GET() {
  const body = buildLlmsTxt({ signup: appHref("/cadastro"), login: appHref("/login") })
  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  })
}
