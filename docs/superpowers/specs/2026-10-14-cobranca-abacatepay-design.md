# Cobrança pela AbacatePay (sub-projeto 4b) — Sessão 23, 2026-10-14

Pedido do Breno: analisar toda a documentação da AbacatePay (https://docs.abacatepay.com, API v2) e preparar a maanu
para receber a integração. Os produtos Starter, Pro e Escala já foram criados por ele no painel da AbacatePay.

## O que a AbacatePay oferece e o que usamos

- **API v2** (`https://api.abacatepay.com/v2`), `Authorization: Bearer <chave>`. O ambiente vem da chave:
  `abc_dev_...` = Dev mode (pagamentos simulados), `abc_prod_...` = produção (conta verificada, só CNPJ).
- **Produtos** com `cycle` (`MONTHLY`, `ANNUALLY`...) e preço em centavos. Checkout de assinatura aceita 1 produto.
- **Checkout de assinatura** (`POST /subscriptions/create`): devolve a `url` da página hospedada (cartão; PIX Automático
  só se liberado na conta). `externalId` repetido devolve o mesmo checkout (idempotente). A assinatura (`subs_...`) só
  existe depois do pagamento.
- **Gerenciar**: `POST /subscriptions/cancel` (cancela **na hora**, sem "fim do período"), `POST /subscriptions/change-plan`
  (mesmo ciclo; novo valor só na próxima renovação; 1 troca pendente por vez), `GET /subscriptions/get`.
- **Clientes** (`POST /customers/create`): únicos por CPF/CNPJ (devolve o existente).
- **Webhooks**: `subscription.completed`, `trial_started`, `renewed`, `payment_failed`, `plan_changed` (no pedido, com
  `changeSource`, e de novo quando aplicada), `cancelled` (com `cancelledDueTo`, ex.: `max_payment_retries_exceeded`).
  Entrega = qualquer 2xx em até 30 s; 5xx/408/429/timeout = até 7 tentativas em ~18 h; outros 4xx = não repete; 410 desliga
  o webhook. Todas as tentativas têm o mesmo id (idempotência).
- **Dois formatos de entrega** (descoberto nos tipos oficiais `@abacatepay/types` 4.0, de 12/10/2026, além da documentação):
  antigo (`?webhookSecret=` + `X-Webhook-Signature` HMAC com a chave pública da AbacatePay; corpo com `id` e `event`) e
  **Standard Webhooks** para endpoints criados depois da mudança (`webhook-id`, `webhook-timestamp`, `webhook-signature`
  = HMAC de `id.timestamp.corpo` com o nosso segredo; corpo com `type`). A maanu aceita os dois.
- Não usamos: checkout transparente, links de pagamento, cupons, saques, PIX enviado, registro de uso.

## Decisões

1. **Cliente paga na página hospedada da AbacatePay** (o cartão nunca passa pela maanu). Volta para
   `/assinatura?pagamento=concluido`, que atualiza sozinha até o webhook confirmar.
2. **Produtos reconhecidos sozinhos**: a maanu lê `GET /products/list` (5 min em memória) e liga cada plano × ciclo ao
   produto ATIVO com "Starter"/"Pro"/"Escala" no nome ou externalId, recorrência mensal/anual e **o mesmo preço** do
   `lib/plans/plans.ts`. Preço diferente = não vende (nunca cobrar outro valor do que o anunciado). Sem produto anual, o
   anual aparece como "indisponível".
3. **Quem manda é o webhook**, conferido duas vezes: segredo/assinatura da entrega e, para assinatura nova, a própria API
   (`GET /subscriptions/get` precisa dizer ACTIVE no mesmo ambiente). O app grava em `organizations` (plan,
   subscription_status, billing_cycle, current_period_end, monthly_price) — o resto do app não mudou.
4. **Fim do período pago** = data do pagamento + 1 mês (ou 1 ano). **Cancelar** (cliente ou equipe) cancela na AbacatePay
   na hora (sem novas cobranças) e o acesso continua até esse fim; disputa no cartão corta na hora.
   `computeAccess`: `canceled`/`past_due` com `current_period_end` no futuro = acesso ativo.
5. **Cobrança recusada**: só avisa (topo das páginas e Assinatura); a AbacatePay tenta 4 vezes, a cada 2 dias, e cancela
   se todas falharem. O cliente pode "Pagar com outro cartão" (assinatura nova).
6. **Trocar de plano** no mesmo ciclo: `change-plan`. Subir libera na hora (o novo valor vem na renovação); descer fica
   agendado e vale na renovação. **Trocar mensal ↔ anual** ou **outro cartão**: assinatura nova; quando ela é paga, a
   anterior é cancelada na AbacatePay (nunca duas cobranças).
7. **Plano pelo valor cobrado**: cada plano tem um preço por ciclo, então renovação/troca aplicada dizem o plano pelo valor.
8. **Modo de teste seguro**: com chave de teste em produção, só administradores da plataforma e os e-mails de
   `ABACATEPAY_TEST_EMAILS` assinam; checkout devolvido em modo de teste para outra pessoa é recusado; eventos de outro
   ambiente são ignorados. A organização interna (`plan = 'admin'`) não assina.
9. **Idempotência**: `billing_events.id` = id da entrega; entrega repetida → 200 sem reprocessar; entrega que falhou no
   meio é refeita (gravações de estado absoluto); evento mais velho que o último aplicado (`provider_updated_at`) é ignorado.
10. **Webhook cadastrado pelo painel do administrador** (Cobrança → "Cadastrar webhook na AbacatePay"), com o segredo que
    só existe na Vercel. Assim ninguém precisa copiar o segredo.

## Banco (migração `20261014120000_cobranca_abacatepay.sql`, aditiva)

`billing_subscriptions` (1 por organização), `billing_checkouts` (páginas criadas; id = externalId), `billing_events`
(webhooks). RLS: dono/administrador lê assinatura e pagamentos; eventos sem acesso pelo navegador. Painel:
`admin_billing_overview()`, `admin_organization_billing(org)` com `admin_assert()`. Teste: `supabase/tests/cobranca_abacatepay_rls.sql`.

## Código

- `lib/billing/abacatepay/`: `config` (variáveis, modo teste), `catalog` (produtos × planos), `webhook` (origem + leitura),
  `decide` (regras de cada evento), `client` (API), `catalog-store` (memória). Puros testados em `tests/unit/abacatepay.test.ts`.
- `lib/billing/engine.ts`: checkout, troca, cancelamento e aplicação dos webhooks. `lib/billing/subscription.ts`: o que
  acontece ao escolher um plano. Fluxo inteiro no banco real com a API simulada: `tests/integration/billing-db.test.ts`.
- Rota `app/api/webhook/abacatepay`; ações `app/(app)/assinatura/actions.ts`; telas Assinatura e Admin → Cobrança.

## Para ligar (Breno)

1. AbacatePay → Integração → API Keys → criar chave (Dev mode primeiro) com: PRODUCT:READ, CUSTOMER:CREATE,
   SUBSCRIPTION:CREATE, SUBSCRIPTION:READ, SUBSCRIPTION:DELETE, WEBHOOK:CREATE, WEBHOOK:READ, STORE:READ.
2. Produtos: conferir que cada um tem recorrência e o preço da maanu; criar os anuais (R$ 970, R$ 1.970, R$ 3.970) se
   quiser vender o anual.
3. Vercel → projeto `maanu` → Environment Variables (Production, Sensitive): `ABACATEPAY_API_KEY`. Redeploy.
   (`ABACATEPAY_WEBHOOK_SECRET` já foi criada pela IA.) Opcional: `ABACATEPAY_TEST_EMAILS`.
4. `maanu.com.br/admin/cobranca`: ver os 6 produtos e clicar em "Cadastrar webhook na AbacatePay".
5. Testar com uma conta comum (e-mail em `ABACATEPAY_TEST_EMAILS`) e o cartão 4242 4242 4242 4242.
6. Produção: verificar a conta na AbacatePay (CNPJ, site com contato/termos/privacidade e CNPJ no rodapé), criar a chave
   de produção, recriar os produtos e trocar a variável; cadastrar o webhook de novo (webhooks de teste não recebem eventos reais).