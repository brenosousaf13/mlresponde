# Recuperador — devoluções com 1 toque + Raio-X do dinheiro (Sessão 30, 2026-10-20)

Plano aprovado pelo Breno na sessão "Criar funcionalidade game changer". A etapa 1 está na branch
`codex/recuperador-devolucoes`; a etapa 2 (cobranças) fica para `codex/recuperador-cobrancas`.

## Por que
O vendedor perde dinheiro em silêncio nas devoluções: o prazo para revisar o produto que voltou é curto, a revisão no ML é
chata e, quando o armazém do ML marca o produto como "sem condição de venda", muitas vezes o dinheiro vai para o comprador e
ninguém contesta. O Recuperador avisa, leva o dono do pacote até o envio da revisão pelo celular e mostra quanto já voltou
("Recuperado pela maanu", só o que o ML confirmou).

## Escopo da etapa 1
- Menu **Recuperador** (`/recuperador`), todos os planos, sem cota (a IA do relato não conta nas respostas do plano).
- Abas: **Visão geral** (3 números + "Revise agora" + como funciona), **Devoluções** (Revise agora / Em andamento /
  Encerradas) e **Raio-X** (progresso da varredura de 90 dias, dinheiro sob suspeita com texto pronto, ressarcimentos).
- Página da devolução (`/recuperador/devolucoes/[id]`), feita para celular: "Chegou certinho" (1 confirmação) ou "Chegou
  com problema" (motivo do ML → o que viu → fotos com guia → observações → relato da IA editável → 1 confirmação).
- Alertas no app e por e-mail (o mesmo envio do Escudo): "chegou a devolução", "faltam menos de 24 h" (urgentes) e "o ML
  ressarciu" (informativo, 3 dias).
- Nada sai sozinho. Só dono/administrador envia a revisão. Fotos reduzidas no navegador (JPG ≤ 1.600 px).

Fora: cobranças (etapa 2), contestar cobrança pela API (não existe), IA olhando as fotos (fase futura), WhatsApp, seção na
página de vendas.

## Passo 0 (conferido em 2026-10-20, só leitura)
- Conta do Breno sem devoluções; com autorização dele, 3 `GET` em devoluções de clientes (só estrutura, sem dado pessoal).
- `GET /post-purchase/v2/claims/{claim_id}/returns` → 200, formato **diferente da documentação**: `shipments[]` (status,
  type, destination.name = warehouse | seller_address, com endereço — descartado na leitura), `orders[]`, `status_money`,
  `refund_at`, `date_closed`. **Não traz** `warehouse_review`/`seller_review`.
- `GET /post-purchase/v1/returns/{return_id}/reviews` → `reviews[].resource_reviews[]` com `stage`, `status`,
  `product_condition` (saleable | unsaleable | discard), `product_destination`, `reason_id`, `benefited` (buyer | seller),
  `seller_status`, `seller_reason`.
- Revisão liberada = `return_review_ok`/`return_review_fail` (às vezes `return_review_unified_*`) nas
  `available_actions` do vendedor, com `due_date` **nulo**; o prazo real vem do `detail.due_date` da reclamação quando
  `action_responsible = respondent`.
- Motivos: `GET /post-purchase/v1/returns/reasons?flow=seller_return_failed&claim_id=` (SRF2…SRF7, com `apply`
  order/package). Fotos: `POST /post-purchase/v1/claims/{claim_id}/returns/attachments` (campo `file`, devolve
  `file_name`). Envio: `POST /post-purchase/v1/returns/{return_id}/return-review` com `{}` (certinho) ou
  `[{ reason, message, attachments }]` (problema; foto obrigatória em SRF2 e SRF4; `order_id` só para revisar 1 pedido de
  carrinho — a maanu revisa o carrinho inteiro, só com motivos de pacote).
- **Limite do relato não documentado**: a maanu usa 1.000 caracteres (confirmar na 1ª revisão real).
- Faturamento: `/billing/integration/periods`, `.../summary` e `.../details` → 200 na conta do Breno (detalhe por venda com
  `charge_info`, `sales_info`, `shipping_info`). Etapa 2 viável; contas sem a permissão mostrarão "reconecte".

## Dados (migração `20261020140000_recuperador.sql`, aditiva, aplicada em 2026-10-20)
- `recovery_sync` (1 por conta; rodízio por `claim_recovery_sync`, só service role).
- `recovery_scans` (Raio-X por conta: waiting | running | done, total/lidas).
- `recovery_returns` (1 por reclamação do tipo returns; fase, prazo, dinheiro, envio, destino, carrinho, revisões
  normalizadas, venda, revisão enviada pela maanu, recuperado).
- `recovery_findings` (achados: `return_unsaleable_unreimbursed` aberto/medium, `return_reimbursed` resolvido/high).
- `recovery_actions` (histórico **imutável**, sem FK, mesmo gatilho do Escudo).
- CHECKs recriados com os valores antigos + novos: `reputation_alerts.kind` (`return_review_due`, `return_review_closing`,
  `return_recovered`) e `ai_usage_events.feature` (`recovery_return_message`).
- RLS só leitura por organização, `GRANT select` explícito, escrita só pelo service role. Teste:
  `supabase/tests/recuperador_rls.sql` (TESTES_RECUPERADOR_OK).

## Fluxo
1. Cron `/api/cron/recuperador` (1/min, `CRON_SECRET`): até 10 contas, 60 chamadas ao ML, ~40 s. Cliente do Escudo
   (`lib/mercadolivre/reputation.ts`, nunca marca token inválido). 429 → conta volta em 2 min.
2. Espera o Escudo terminar a busca inicial das reclamações (`reputation_sync.claims_backfilled_at`).
3. Candidatas: `reputation_claims` do tipo returns abertas ou criadas nos últimos 90 dias (só leitura). Fila: nunca lidas →
   alteradas no ML → abertas a atualizar (10 min se esperando revisão, 30 min as outras). Até 15 por rodada (2 chamadas cada).
4. Fase: closed (reclamação encerrada) · other (sem devolução) · reviewed (revisada pela maanu ou pelo vendedor no ML) ·
   needs_review (revisão liberada) · at_warehouse (destino armazém) · waiting.
5. Achado (só encerradas, só produto unsaleable/discard): benefited seller ou resolução a favor do vendedor → ressarcido;
   benefited buyer sem cobertura do ML → dinheiro sob suspeita. Sem a venda gravada pelo Escudo, busca `/orders/{id}` 1 vez.
6. Recuperado pela maanu: revisão "com problema" enviada pela maanu + final a favor do vendedor (seller_status failed,
   benefited seller ou resolução com respondent). Valor = valor da venda.
7. Alertas por `applyAlerts` do Escudo (escopo `RETURN_ALERT_KINDS`); os e-mails saem na rodada do cron da Reputação, com
   link para o Recuperador (`alertUrl`). A tela e o selo da Reputação ignoram esses tipos; o Recuperador tem selo próprio.
8. Revisão (`submitReturnReviewFor`): confere de novo no ML se a ação está liberada → motivos ao vivo (reserva fixa se
   falhar) → valida → sobe as fotos → envia → histórico → relê (Escudo + devolução).

## Testes
- `tests/unit/recovery.test.ts` (24): leitura real de /returns e /reviews, revisão e prazo, fases, fila, Raio-X, recuperado,
  alertas, motivos, validação, corpo do POST, relato sem IA, IA (contato externo, tamanho), fotos e e-mail.
- `tests/integration/recovery-db.test.ts` (`RUN_RECOVERY_DB=1`): banco real com ML simulado, loja temporária apagada; nunca
  grava em `recovery_actions`.
- QA visual com loja temporária (computador e celular 390 px), apagada depois.
