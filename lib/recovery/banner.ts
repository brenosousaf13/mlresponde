import { pluralize } from "@/lib/format"

/**
 * Texto do aviso no topo do /recuperador (puro, testado): "N devoluções pra revisar · R$ X · a primeira vence em dd/mm".
 * Usa os números de overview.waiting (já sem as devoluções vencidas). Devolve null quando não há nada para revisar.
 */
export function reviewBannerText(input: { count: number; amount: number; nextDeadline: string | null }): string | null {
  if (input.count <= 0) return null
  const parts = [pluralize(input.count, "devolução pra revisar", "devoluções pra revisar")]
  if (input.amount > 0) {
    parts.push(new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(input.amount))
  }
  if (input.nextDeadline) {
    const date = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(
      new Date(input.nextDeadline)
    )
    parts.push((input.count === 1 ? "vence em " : "a primeira vence em ") + date)
  }
  return parts.join(" · ")
}

