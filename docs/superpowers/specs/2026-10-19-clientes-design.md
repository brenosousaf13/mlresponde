# Aba Clientes — design

Data: 2026-10-19 · Sessão 28 · Branch: `codex/clientes` · Migração: `20261019120000_clientes.sql`

> **Atualização (mesmo dia, Sessão 28b): sem importação do histórico.** Depois de ver a importação dos 12 meses
> começando (milhares de vendas por loja, horas para terminar), o Breno pediu para parar e "contabilizar apenas a partir
> de agora". Cada conta conta as compras a partir de `ml_customer_sync.tracking_since` (o momento da mudança para as
> contas que já existiam; a conexão, para as novas) e `ingest_ml_orders` ignora vendas anteriores. As vendas e os
> clientes importados foram apagados (migração `20261019190000_clientes_a_partir_de_agora.sql`). As partes abaixo sobre
> importação ficam só como histórico.

## Pedido do Breno

"Existe alguma maneira de ter a aba de clientes, que são os que compraram na nossa loja do ML, e ter alguns dados como
e-mail e telefone deles vindos do Mercado Livre?"

## O que o Mercado Livre entrega (documentação + conferência na API real em 2026-10-19)

| Dado | Situação | Fonte |
|---|---|---|
| Id e apelido do comprador | sempre | `/orders/search` e `/orders/{id}` |
| Nome e sobrenome | **só em `/orders/{id}`** (a busca devolve `buyer` só com `id` e `nickname`); às vezes o ML repete o nome inteiro nos dois campos | `/orders/{id}` |
| Cidade e UF de entrega | depois do pagamento confirmado | `/shipments/{id}` (header `x-format-new`), `destination.shipping_address` |
| Telefone | **mascarado** (`receiver_phone` vem como "XXXXXXX" no Mercado Envios/Full); só vem de verdade em vendas ME1 | `/shipments/{id}` |
| E-mail | **não vem** em nenhum recurso de vendas no Brasil | — |
| CPF/CNPJ e endereço fiscal | existe, mas é para nota fiscal | `/orders/billing-info/{site}/{id}` |

Regras do ML: usar os dados só para a finalidade declarada, criptografar e mascarar dado sensível, nada de contato fora
da plataforma (risco de bloqueio do app e da conta do vendedor; LGPD). Conclusão levada ao Breno: dá para ter a aba,
**sem e-mail e sem telefone**.

## Decisões do Breno

- Objetivo: **conhecer os clientes** (quem compra, quanto, quando, quem volta), sem contato fora do ML.
- Dados guardados: **o mínimo** — apelido, nome, sobrenome, cidade/UF e as compras. Nada de e-mail, telefone,
  CPF/CNPJ ou endereço completo.
- Histórico: ~~últimos 12 meses importados ao ligar~~ → **só a partir de agora** (Sessão 28b).
- Planos: **todos** (Starter também).
- Extra da 1ª versão: **observações internas** por cliente (sem exportar CSV).

## Modelo de dados (aditivo)

- `ml_customers`: 1 por conta do ML + comprador (`unique (ml_account_id, buyer_id)`). Apelido, nome, sobrenome,
  `full_name` (coluna gerada, para busca), cidade, UF (`^[A-Z]{2}$`), primeira/última compra, compras, total, moeda,
  `location_pending` + `location_ml_order_id` (de qual venda ler a cidade/nome), observações (≤ 2.000) com autor e data.
- `ml_orders`: 1 por venda (`unique (ml_account_id, ml_order_id)`), com pack, situação, datas, `ml_last_updated`,
  valores, envio, reclamações e até 10 itens (id, título, variação, quantidade, preço).
- `ml_customer_sync`: 1 por conta — situação da importação (`pending|running|done|failed`), cursor (janela + offset),
  vendas importadas, última conferência, erro, tentativas, próxima tentativa, trava. Gatilho em `ml_accounts`: conta
  nova ganha a linha (reconectar não reimporta).
- Compra válida = `paid`, `partially_paid`, `partially_refunded` (espelho em `ml_order_is_purchase` e
  `PURCHASE_STATUSES`). Compras contam por pack. Na lista só entra quem tem ≥ 1 compra válida.
- Funções: `ingest_ml_orders(conta, jsonb)` (até 200 vendas por lote; idempotente; versão mais velha não sobrescreve;
  apelido/nome só mudam com venda tão ou mais nova) e `claim_customer_sync(tipo, limite)` (`import` ou `poll`; só contas
  ativas, token válido e organização com acesso) — só service role; `customers_overview(org, conta?)` (security invoker).
- RLS só leitura por organização (`current_user_organization_ids()`), `GRANT select` explícito, escrita só pelo servidor.

## Sincronização

- **Importação** (cron `/api/cron/clientes`, 1/min): janelas de 30 dias da mais nova para a mais velha até 365 dias.
  `/orders/search` ordena pela data de fechamento e recusa `offset + limit > 10.000`: janela com mais de 9.000 vendas é
  dividida ao meio antes de paginar. Até 10 páginas de 50 por rodada (divididas entre as contas, mínimo 2 por conta) =
  500 vendas/min para uma loja sozinha. Falha: espera 1, 2, 4, 8, 16, 30 min; depois de 6 tentativas vira "falhou"
  (botão "Tentar de novo" na tela continua de onde parou).
- **Conferência** a cada 10 min por conta já importada: `order.date_last_updated.from` = última conferência − 5 min, até 4
  páginas; se o ML recusar o filtro (400), lê as vendas criadas nos últimos 3 dias.
- **Notificação `orders_v2`**: o webhook responde 200 na hora; em `after()` lê `/orders/{id}` e grava (só se a conta for
  a vendedora e a organização tiver acesso). Precisa do tópico ligado no DevCenter (Breno).
- **Cidade/UF e nome**: até 60 chamadas por rodada (1 do envio + 1 da venda se ainda não houver nome), quem comprou por
  último primeiro. 403/404 numa leitura usa o que veio da outra e tira a pendência; falha passageira fica para a próxima.
- Organizações bloqueadas e contas desconectadas/sem token ficam de fora. Contas desconectadas mantêm os dados.

## Telas (shadcn/ui)

- Menu **Clientes** (`UsersIcon`), depois de Pós-venda, em todos os planos; exige conta do ML ativa.
- `/clientes`: seletor de conta, 4 cartões (clientes, voltaram a comprar com %, total em compras com média, novos em 30
  dias), busca `?q=` por nome ou apelido, filtros (Todos, Voltaram a comprar, Uma compra, Novos) com contagem, ordem
  (última compra, mais compras, maior total, primeira compra), tabela com 50 por página, avisos de importação em andamento
  (atualiza sozinho a cada 20 s) ou com falha, estado vazio e aviso fixo de atender pelo ML.
- `/clientes/[id]`: nome, @apelido, cidade/UF, conta, "Voltou a comprar"; Compras (agrupadas por pack, canceladas riscadas
  e fora do total, reclamação, link para a venda no ML); Perguntas que fez (20, link para a caixa de entrada); Conversas
  do pós-venda (cadeado com link para Assinatura sem o plano); Resumo; Observações (qualquer membro edita; "Atualizado por").

## Limites conhecidos

- Cliente cuja compra mais recente não tem envio não ganha cidade nem nome (fica com o apelido).
- Lojas grandes (dezenas de milhares de vendas): a importação leva horas e nomes/cidades completam ao longo de ~1 dia.
- Conferência com mais de 200 vendas alteradas em 10 minutos lê só as 200 mais recentes (a notificação cobre o resto).
- Sem exportar CSV, sem segmentação/campanhas e sem contato com o comprador (fora do ML é proibido).

## Testes

- `tests/unit/customers.test.ts` (conversão das vendas, nome, UF, importação, notificação, URL, compras, observações) e o
  caso `orders_v2` em `tests/unit/webhook.test.ts`.
- `supabase/tests/clientes_rls.sql` (`TESTES_CLIENTES_OK`).
- `tests/integration/customers-db.test.ts` (`RUN_CUSTOMERS_DB=1`): fluxo inteiro no banco real com o ML simulado e loja
  temporária apagada no fim (não chama `claim_customer_sync`, que pegaria as contas reais).
