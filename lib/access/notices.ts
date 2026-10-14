import { siteConfig } from "@/lib/config/site"
import { formatNumber } from "@/lib/format"
import type { Quota } from "@/lib/plans/usage"

import type { Access } from "./access"

const dayMonth = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  timeZone: "America/Sao_Paulo",
})

/**
 * Aviso do teste grátis (menu lateral e topo do celular).
 * Aparece durante o teste e, depois, enquanto a conta estiver bloqueada; some quando a assinatura fica ativa
 * (ou a organização tem cortesia), porque aí `access.state` é "active".
 */
export type TrialNotice =
  | {
      kind: "trial"
      daysLeft: number
      totalDays: number
      /** Fração do teste que ainda resta (1 = começou agora, perto de 0 = acabando). */
      remaining: number
      /** Últimos 2 dias: destaque maior para "Ver planos". */
      urgent: boolean
      title: string
      detail: string
      /** Texto curto para o topo do celular. */
      short: string
    }
  | { kind: "ended"; title: string; detail: string; short: string }

export function trialNotice(
  access: Access,
  subscriptionStatus: string,
  totalDays: number = siteConfig.trialDays
): TrialNotice | null {
  if (access.state === "active") return null

  if (access.state === "blocked") {
    if (subscriptionStatus === "past_due") {
      return {
        kind: "ended",
        title: "Pagamento pendente",
        detail: "Regularize a assinatura para voltar a usar.",
        short: "Pagamento pendente",
      }
    }
    if (subscriptionStatus === "trialing") {
      return {
        kind: "ended",
        title: "Seu teste grátis terminou",
        detail: `Assine um plano para voltar a usar a ${siteConfig.name}.`,
        short: "Teste encerrado",
      }
    }
    return {
      kind: "ended",
      title: "Assinatura inativa",
      detail: `Assine um plano para voltar a usar a ${siteConfig.name}.`,
      short: "Assinatura inativa",
    }
  }

  const daysLeft = Math.max(1, access.trialDaysLeft)
  const total = Math.max(totalDays, daysLeft)
  return {
    kind: "trial",
    daysLeft,
    totalDays: total,
    remaining: daysLeft / total,
    urgent: daysLeft <= 2,
    title: daysLeft === 1 ? "Último dia de teste grátis" : `Faltam ${daysLeft} dias de teste`,
    detail: `Grátis até ${dayMonth.format(new Date(access.trialEndsAt))}`,
    short: daysLeft === 1 ? "Último dia de teste" : `${daysLeft} dias de teste`,
  }
}

/**
 * Aviso de conta do Mercado Livre (topo das páginas): aparece até existir uma conta ativa.
 * Com a conta bloqueada não aparece (o aviso do teste é o que importa e a página de contas fica fechada).
 */
export type MlConnectionNotice = {
  kind: "connect" | "reactivate"
  title: string
  description: string
}

export function mlConnectionNotice(
  access: Access,
  mlAccounts: { total: number; active: number }
): MlConnectionNotice | null {
  if (access.state === "blocked" || mlAccounts.active > 0) return null
  if (mlAccounts.total === 0) {
    return {
      kind: "connect",
      title: "Conecte sua conta do Mercado Livre",
      description: "Com ela conectada, a plataforma é liberada e você já pode configurar a IA. Leva menos de um minuto.",
    }
  }
  return {
    kind: "reactivate",
    title: "Nenhuma conta do Mercado Livre ativa",
    description: "Ative ou reconecte uma conta para a plataforma voltar a funcionar.",
  }
}

/**
 * Aviso do limite de respostas automáticas (topo das páginas): a partir de 80% do limite e quando acaba.
 * Com a conta bloqueada ou sem limite não aparece.
 */
export type AnswersUsageNotice = {
  level: "warning" | "reached"
  title: string
  description: string
}

export function answersUsageNotice(access: Access, quota: Quota | null, resetText: string): AnswersUsageNotice | null {
  if (!quota || access.state === "blocked" || quota.limit === null) return null
  if (quota.level === "reached") {
    return {
      level: "reached",
      title: "As respostas automáticas do período acabaram",
      description: `A IA usou as ${formatNumber(quota.limit)} respostas do seu plano. As perguntas novas ficam para você responder (nada se perde). ${resetText}.`,
    }
  }
  if (quota.level === "warning") {
    return {
      level: "warning",
      title: `Você já usou ${quota.percent}% das respostas automáticas`,
      description: `${formatNumber(quota.used)} de ${formatNumber(quota.limit)}. ${resetText}. Quando acabar, as perguntas novas ficam para você responder.`,
    }
  }
  return null
}

/**
 * Aviso de cobrança recusada (topo das páginas, só para quem administra a loja): a AbacatePay tenta de novo sozinha;
 * se todas as tentativas falharem, ela cancela a assinatura. Some quando uma cobrança é aprovada.
 */
export type PaymentNotice = { title: string; description: string }

export function paymentNotice(subscription: { status: string; paymentFailedAt: string | null } | null): PaymentNotice | null {
  if (!subscription || subscription.status !== "active" || !subscription.paymentFailedAt) return null
  return {
    title: "Não conseguimos cobrar a sua assinatura",
    description:
      "O cartão recusou a última cobrança. Vamos tentar de novo nos próximos dias; se preferir, assine de novo com outro cartão em Assinatura. Se todas as tentativas falharem, a assinatura é cancelada.",
  }
}
