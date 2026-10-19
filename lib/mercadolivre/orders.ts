import "server-only"

import type { MlOrderSearchPage, MlSearchOrder, MlShipmentLocation } from "@/lib/customers/orders"
import { mlRequest } from "@/lib/mercadolivre/client"

// Vendas e envios para a aba Clientes. Docs: developers.mercadolivre.com.br/pt_br/gerenciamento-de-vendas e
// /gerenciamento-de-envios. Só leitura.

/** Busca de vendas do vendedor (/orders/search) com filtros do ML (datas, ordem, limit, offset). */
export function searchSellerOrders(accountId: string, sellerId: number, params: Record<string, string>) {
  const query = new URLSearchParams({ seller: String(sellerId), ...params })
  return mlRequest<MlOrderSearchPage>(accountId, "/orders/search?" + query.toString())
}

/** Uma venda (notificação orders_v2). */
export function fetchOrder(accountId: string, orderId: number) {
  return mlRequest<MlSearchOrder>(accountId, "/orders/" + orderId)
}

/** Envio no formato novo (só cidade e UF são aproveitadas, em shipmentLocation). */
export function fetchShipmentDestination(accountId: string, shipmentId: number) {
  return mlRequest<MlShipmentLocation>(accountId, "/shipments/" + shipmentId, { headers: { "x-format-new": "true" } })
}
