# Escudo de Reputação (menu "Reputação") — design

> Sessão 29 (2026-10-19). Pedido do Breno: "uma feature nova com diferencial, que resolva dor de vendedor do Mercado
> Livre e faça o cliente querer pagar". Proposta da IA aprovada pelo Breno no modo plano, com as decisões dele:
> **feature nova, sem alterar nada que já existe**, **todos os planos**, **a IA prepara e o vendedor aprova** (nada sai
> sozinho), **ações de dinheiro executadas pela maanu depois do clique do vendedor**, alertas **no app e por e-mail
> (só os urgentes)**, nome no menu **"Reputação"**, publicação **em 2 etapas**.

## Por quê

Responder perguntas virou commodity (o próprio ML dá resposta sugerida por IA de graça e há ~30 concorrentes). A dor que
mais custa dinheiro ao vendedor é a **reputação**: cair de cor dobra o custo do frete (tabelas oficiais por cor), tira
Flex, Product Ads e campanhas de desconto, e 11 tipos de reclamação podem ser excluídos mas quase ninguém pede. O Escudo
mostra a folga até cair de cor, avisa antes de um despacho atrasar, cuida das reclamações com IA e mostra em R$ quanto a
cor vale. Também prepara a Shopee (desempenho da loja e pontos de penalidade têm API; o chat de terceiros não).

## Regras oficiais usadas (conferidas em 2026-10-19)

- Limites do Brasil (nota "Vamos mudar a forma como calculamos sua reputação", Central de Vendedores, vigente desde
  10/09/2026; e developers.mercadolivre.com.br › Reputação de vendedores):
  - Reclamações (60 ou 365 dias): verde até 2%, amarelo até 4,5%, laranja até 8%, vermelho acima.
  - Canceladas por você: 60 dias 1,5 / 3,5 / 4%; 365 dias 2,5 / 5,5 / 6,5%.
  - Envios com atraso: 60 dias 10 / 18 / 22%; 365 dias 13 / 23,5 / 28,5%.
  - MercadoLíder: reclamações 1%, cancelamentos 0,5%, atrasos 6% (e verde escuro).
  - Período: 60 dias com 101 vendas ou mais nos últimos 60 dias; senão 365. Sem 10 vendas em 365 dias = sem cor (cinza).
- 11 casos de exclusão (Central de Vendedores, "Conheça as regras de exclusão de reclamações"): por engano, não reconhece
  a compra, consta entregue mas não recebeu, arrependimento com produto perfeito, reclamação como meio de contato, demora
  do transporte dentro do prazo, problema global da plataforma, concorrência ou vingança, resposta ainda dentro das 24 h
  úteis, troca de tamanho/modelo (autopeças, vestuário, bolsas e calçados) e entrada não autorizada/fraude/suspensão
  incorreta. O pedido é feito no ML: Métricas › Atendimento aos seus compradores › Revisar todos › Vendas com problemas.
- Tabelas, números e textos ficam em `lib/reputation/thresholds.ts` e `lib/reputation/exclusions.ts` com fonte e data. Se o ML mudar, atualizar lá.

## O que a API do ML mostrou na prática (conta do Breno, só leitura, 2026-10-19)

- `GET /users/{id}` traz `seller_reputation` com `level_id` (`5_green`, `4_light_green`, `3_yellow`, `2_orange`, `1_red` ou null),
  `power_seller_status`, `metrics.{sales,claims,delayed_handling_time,cancellations}` com `period` ("60 days"/"365 days"),
  `value` e `rate` (fração 0–1); vendedor protegido traz `real_level`, `protection_end_date` e os números reais em
  `excluded.real_value/real_rate`. A resposta tem dados pessoais (e-mail, documento, endereço): **só `seller_reputation` é lido**.
- **Busca de reclamações:** o filtro que funciona é `player_role=respondent&player_user_id={id}` (os `players.role`/`players.user_id`
  da documentação são **ignorados** pela API, e `range` sozinho não conta como filtro). `range=date_created:after:` e
  `range=last_updated:after:` funcionam junto com esses filtros. Os `available_actions` do vendedor (com `mandatory` e
  `due_date`) já vêm na busca.
- **`GET /post-purchase/v1/claims/{id}/detail` responde 401 para reclamações "Claims 1.0"** ("This functionality is not available
  for Claims 1.0"). O `mlRequest` da v2 marca o token como inválido em qualquer 401 — por isso o Escudo usa um cliente
  próprio (`lib/mercadolivre/reputation.ts`) que **nunca** marca o token (quem detecta token inválido continuam sendo as
  rotinas existentes). Na conferência desta sessão, um 401 desses marcou a conta do Breno como inválida por ~1 min; foi
  desfeito na hora (§12 do CEREBRO).
- `/shipments/{id}/costs` traz `senders[].discounts[].promoted_amount` (desconto do frete do vendedor) e `senders[].cost`.
- `/shipments/{id}/sla` dá 404 para envio cancelado e não existe para Full (documentado).

## Etapa 1 — termômetro, despachos, valor da cor e alertas (só leitura no ML)

- **Termômetro** (a cada 30 min por conta): cor, MercadoLíder, proteção, período, vendas e as 3 métricas. Histórico em
  `reputation_snapshots`: 1 linha por dia e outra a cada mudança (assinatura dos números).
- **Folga** (`lib/reputation/metrics.ts`, puro): para cada métrica, `floor(limite da cor atual × base − problemas)`. Base = valor ÷
  taxa quando os dois existem; senão as vendas concluídas do período (marcado "aprox."). Atrasos sempre "aprox.". A pior
  métrica define a cor calculada; a cor exibida é a do ML. Estados especiais: cinza (faltam N vendas), protegido (usa os
  números reais e mostra até quando vai a proteção), MercadoLíder (folga também até perder a medalha). No vermelho mostra
  quanto falta para subir.
- **Previsão:** reclamações em que o vendedor é o reclamado, do período (+30 dias de margem), guardadas em
  `reputation_claims` (criada já na etapa 1, porque a previsão precisa dela; a etapa 2 só acrescenta colunas). Para
  `mediations`/`returns`: `affects-reputation` e a data da venda (`ml_orders`, senão `/orders/{id}`; sem venda = data da
  reclamação). Sai da conta em data da venda + período (estimativa). Conferência a cada 5 min (alteradas desde a última)
  e `affects-reputation` de novo 1 vez por dia para as que contam.
- **Despachos:** vendas pagas dos últimos 15 dias em `ml_orders` (só leitura) com envio → `reputation_shipments`. `/shipments/{id}`
  (só situação e logística) e `/sla`. Full e cancelado = ignorado; despachado = concluído. Situação calculada na hora pelo
  prazo: **atrasado** (passou), **em risco** (até 4 h ou vence hoje), **no prazo**, **sem prazo** (ML não informou). Nova
  conferência a cada 10 min para os em risco/atrasados e a cada 30 min para os no prazo (o risco muda com o relógio, sem
  chamar o ML).
- **Valor da cor:** cada envio despachado dos últimos 30 dias tem `/costs` lido 1 vez; soma dos descontos do vendedor.
  Cartão "O ML descontou R$ X do seu frete" + "no laranja/vermelho você pagaria até R$ X a mais por mês" (estimativa; a
  tabela laranja/vermelha não tem desconto). Sem desconto nenhum, o cartão vira "o que cada cor tranca".
- **Alertas** (`reputation_alerts`, chave única por conta + evento): despacho em risco, despacho atrasado, folga ≤ 1, cor
  caiu (urgentes) e cor voltou (informativo, some em 72 h). Resolvem sozinhos quando a situação acaba. Reabrir em menos de
  7 dias não manda e-mail de novo.
- **E-mail** (Resend, `RESEND_API_KEY`; sem ela, desligado): só alertas urgentes, para dono e administradores, no máximo 1
  por conta e tipo a cada 30 min (vários juntos), remetente `maanu <alertas@maanu.com.br>`, link para
  `/reputacao?conta=`. Alerta resolvido antes do envio, com mais de 6 h ou com os e-mails desligados pela loja não sai.
- **Tela `/reputacao`** (shadcn): conta (seletor existente), "Atualizar agora" (no máximo a cada 2 min), interruptor
  "Alertas por e-mail" (dono/administrador), termômetro com as 3 barras, "Precisa de você agora", despachos, previsão,
  valor da cor e "Como funciona".
- **Rotina** `/api/cron/reputacao` (1/min, `CRON_SECRET`): até 80 chamadas ao ML por rodada (~45 s), rodízio entre contas, 429
  pausa a conta por 2 min. Entram contas ativas, token válido e organização com acesso (qualquer plano).

## Etapa 2 — reclamações com IA e ações

- **Sincronização** (mesma rotina): para reclamações novas ou alteradas, abertas ou encerradas há até 7 dias: reclamação,
  `detail` (só Claims 2.0), mensagens (hash único), resoluções esperadas, motivo (`/claims/reasons/{id}`), venda e rastreio.
- **Telas:** aba "Reclamações" em `/reputacao` (filtros precisam de você / em mediação / abertas / encerradas, ordem por
  prazo) e `/reputacao/reclamacoes/[id]` (problema, prazo, selo afeta/não afeta, mensagens, o que o comprador espera, análise
  da IA, ações).
- **IA** (`gpt-6-luna`, raciocínio low, JSON validado, `trackedCompletion` com `reputation_claim_analysis`): 1 análise por
  mudança, no máximo 8 por reclamação, só abertas. Resumo, risco, melhor saída (responder, reembolso total/parcial,
  devolução, mediação, enviar comprovante, aguardar), rascunhos para comprador e mediador e caso de exclusão (um dos 11 ou
  nenhum) com certeza e texto pronto. Não conta na cota de respostas e nunca envia nada.
- **Ações** (só as que o ML lista em `available_actions`; confirmação com o que vai acontecer e o valor): mensagem ao comprador
  ou ao mediador (`/actions/send-message`, anexos JPG/PNG/PDF até 5 MB via `/attachments`), reembolso total
  (`/expected-resolutions/refund`), reembolso parcial (`/partial-refund/available-offers` + `/expected-resolutions/partial-refund`),
  permitir devolução (`/expected-resolutions/allow-return`) e mediação (`/actions/open-dispute`). Mensagem: qualquer membro.
  Dinheiro e mediação: só dono/administrador, com 2ª confirmação. Tudo em `reputation_claim_actions` (imutável) e a
  reclamação é sincronizada de novo logo depois. Comprovante de envio, rastreio e revisão de devolução: no ML (link).
- **Exclusão:** "Copiar texto", link para as regras do ML e "Pedi a exclusão"; quando `affects-reputation` mudar para "não afeta",
  aviso no app.
- **Alertas novos:** reclamação nova (e-mail; só as criadas nos últimos 3 dias, nada do histórico), ação obrigatória
  vencendo em menos de 24 h (e-mail), possível exclusão e "deixou de contar" (só no app).

## O que muda no que já existe (lista fechada)

Menu (`NAV_ITEMS`, `PAGE_TITLES`, `AppSection`, ícone no menu e o selo de alertas urgentes no layout), `vercel.json` (cron novo),
`PRIVATE_PATHS` (robots), `AiFeature` + rótulo do painel admin + CHECK de `ai_usage_events.feature` (etapa 2) e a variável
`RESEND_API_KEY`. Webhook do ML, Perguntas, Pós-venda, Clientes, planos, Assinatura, Painel e página de vendas não mudam.
O Escudo só **lê** `ml_accounts` e `ml_orders`.

## Banco

Migrações aditivas com RLS só de leitura por organização (`current_user_organization_ids()`), `GRANT select` explícito e
escrita só pelo servidor: `20261019230000_reputacao.sql` (etapa 1: settings, sync, snapshots, shipments, alerts, claims e a
função `claim_reputation_sync`) e `20261019233000_reputacao_reclamacoes.sql` (etapa 2: colunas da reclamação, mensagens,
ações imutáveis e o CHECK da IA). Testes em `supabase/tests/reputacao_rls.sql` (TESTES_REPUTACAO_OK).

## Fora deste projeto

Shopee, WhatsApp, resumo diário, cartão no Painel e página de vendas. Ações de comprovante/rastreio/revisão de devolução
pela maanu. Notificação `claims` do ML (exigiria mexer no webhook).

