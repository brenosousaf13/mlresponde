# Pós-venda com IA (exclusivo do plano Essencial) — design

Data: 2026-10-11 · Branch: `v2` · Sessão 11 · Migração: `20261011235900_pos_venda.sql`

## Pedido do Breno

Uma feature exclusiva do plano **Essencial**: um agente que responde as mensagens de **pós-venda** (compras já feitas),
mantém a conversa com o comprador e lê o histórico da conversa para saber como responder. Um item novo no menu, só para
clientes Essencial, com toda a parte de pós-venda.

## Como o Mercado Livre funciona aqui (documentação conferida em 2026-10-11)

- Mensagens pós-venda: `GET/POST /messages/packs/{pack}/sellers/{vendedor}?tag=post_sale` (sem pack, o id da venda faz o
  papel de pack). `mark_as_read=false` para não marcar como lida. Paginação `limit/offset`.
- **Limite de 350 caracteres** por mensagem do vendedor (`seller_max_message_length`); só caracteres **ISO-8859-1** e
  alguns emojis. Anexos JPG/PNG/PDF/TXT até 25 MB (`POST /messages/attachments`).
- O vendedor **não inicia** conversa: só responde (o fluxo começa sempre pelo comprador).
- **Nova arquitetura (desde 02/02/2026, Brasil e Chile):** agentes de mensageria (IA do ML) intermediam conversas. Nelas o
  `from` do comprador vem com o id do agente e o POST do vendedor deve ir com `to` = id do agente (MLB `3037675074`).
  Envio de 1 mensagem por vez; conversas lidas e não resolvidas bloqueiam em 48 h úteis.
- Bloqueios (`conversation_status.status=blocked` + `substatus`): mediação, Full ainda não entregue, venda cancelada, 30
  dias sem mensagem, comprador bloqueou, reembolso, etc. 403 `blocked_conversation_send_message_forbidden` ao enviar.
- Moderação: mensagens podem ficar `pending_review` (HTTP 202) e depois `available` ou `rejected` (motivos: link de rede
  social, dados pessoais, **mensagem automática**, etc.).
- Notificações: tópico `messages` (subtópicos `created`/`read`); o `resource` é o id da mensagem → `GET /messages/{id}`
  traz o pack em `message_resources`. Redundância: `GET /messages/unread?role=seller&tag=post_sale`.
- Venda e envio: `GET /packs/{pack}`, `GET /orders/{id}`, `GET /shipments/{id}` (header `x-format-new: true`): status,
  rastreio, `lead_time` (previsão), `status_history`.
- Rate limit: 500 rpm leitura e 500 rpm escrita (compartilhados).

## Plano Essencial (base dos planos)

- `lib/plans/plans.ts`: `PLANS` (`essencial` → `pos_venda`; `admin` = organização de demonstração com tudo), `planIncludes`,
  `featureAccess` (admin da plataforma vê tudo), nomes para exibir. Espelho no banco: `plan_includes_after_sale(plan)`.
  **Mudar nos dois lugares** ao criar planos (sub-projeto 4).
- `organizations.plan` (já existia) = `'essencial'` libera. Durante o teste grátis o plano é nulo → **sem pós-venda**
  (decisão de produto pendente com o Breno).
- `decideSectionAccess` ganhou `features` e o motivo `plan` (redireciona para `/assinatura?recurso=pos_venda`, que mostra o
  aviso "exclusivo do plano Essencial" e a lista "Recursos do seu plano"). O item do menu **só aparece** para quem tem o
  plano (decisão: menu exclusivo, como pedido). O admin da plataforma vê tudo.
- O RLS também exige o plano: sem plano, nem as próprias conversas são lidas pelo navegador.

## Dados (migração aditiva)

- `ml_accounts`: `after_sale_enabled` (false), `after_sale_instructions` (≤ 4000), `after_sale_confidence_threshold`
  (0,85), `after_sale_sensitive_policy` (`review` | `guide`), `after_sale_signature` (≤ 80).
- `ml_conversations` (1 por venda/pack e conta; único `(ml_account_id, pack_id)`): comprador, produto, `order_summary` jsonb
  (itens, valores, pagamento, envio — **sem endereço nem dados pessoais**), colunas do envio para lista/filtros, situação no
  ML (`ml_status`, `ml_substatus`, `claim_open`, `max_message_length`), `status` (`pending | processing | failed |
  needs_review | answered | blocked | archived`), `review_reason`, última mensagem, `pending_count`, `awaiting_since`,
  rascunho/certeza/motivo/assunto/modelo/tokens da IA, fila (`attempts`, `next_attempt_at`, `locked_until`,
  `resync_requested`), `synced_at`. Realtime ligado.
- `ml_conversation_messages`: cópia das mensagens (único `(conversation_id, ml_message_id)`), `sender` (buyer/seller),
  `source` (buyer/ai/manual/external), texto, anexos, status/moderação do ML. Mensagens enviadas por nós sem id do ML ficam
  `local:<uuid>` até a sincronização ligar ao id definitivo (mesmo texto, até 30 min de diferença).
- `after_sale_examples`: respostas ensinadas do pós-venda (≤ 1000).
- Funções `claim_ml_conversation` / `due_ml_conversations` (só service role). RLS: SELECT para membros de organizações
  com o plano (`current_user_after_sale_organization_ids()`); escrita só pelo servidor. Teste: `supabase/tests/pos_venda_rls.sql`.

## Motor (`lib/after-sale/engine.ts`)

1. **Entrada:** webhook (tópico `messages`, só contas cujo plano inclui pós-venda) → `GET /messages/{id}` → pack →
   `registerConversation` (cria ou volta para a fila; se estiver processando, marca `resync_requested`) → `after()`
   processa. Também: botão "Sincronizar com o ML" e conexão da conta (não lidas), cron.
2. **`processConversation`:** reserva (lock 150 s) → `syncConversation`: todas as páginas da conversa (sem marcar como
   lida), pack/vendas, envio, apelido do comprador e miniatura do produto → grava mensagens e colunas.
3. Decide sem IA: ML bloqueou → `blocked`; nada esperando resposta → `answered`; conta inativa / assinatura bloqueada /
   plano sem pós-venda / **reclamação ou mediação aberta** / agente pausado → `needs_review` (sem gastar IA).
4. Senão: prompt (`lib/after-sale/prompt.ts`) com Regra 0 (nunca inventar; nunca prometer reembolso, troca, reenvio,
   desconto ou prazo), conhecimento da loja (o mesmo do Assistente), instruções do pós-venda, respostas ensinadas, pedido,
   envio, anúncio do produto (dúvidas de uso) e o **histórico completo** (últimas 30 mensagens; as que esperam resposta
   marcadas; recusadas pelo ML marcadas; anexos avisados). Saída JSON `{action, answer, confidence, reason, topic}`.
5. **Decisão (`decideAfterSale`):** assunto `change_order` (mudança no pedido) sempre fica com o vendedor; assuntos
   delicados (`problem`, `return`, `cancel`, `change_order`) ficam com ele na política `review` (padrão) ou o agente acolhe
   e orienta para "Minhas compras" na política `guide`; depois certeza ≥ nível (padrão 0,85), sem contato externo, texto +
   assinatura ≤ limite do ML. Sai → `deliver`; não sai → `needs_review` com rascunho.
6. **Envio:** texto convertido para latin1 (`toMlMessageText`), destinatário: no Brasil o agente de mensageria primeiro e o
   comprador como segunda tentativa (se o ML recusar o destinatário). 403 de bloqueio → relê a conversa (`blocked`) ou
   `send_rejected`; texto longo → `answer_too_long`; 5xx/429 → nova tentativa (1/2/4/8/16 min, depois `processing_error`).
7. Terminou e chegou mensagem nova no meio → volta para a fila (até 3 rodadas seguidas).
- **Sem resposta dupla:** antes de enviar, o motor relê a conversa no ML (fonte da verdade); mensagem nossa ainda sem id
  conta como resposta. O envio manual reserva a conversa (90 s) para o agente não responder junto.
- **Cron** `/api/cron/pos-venda` (Vercel, a cada minuto, só produção): fila; a cada 15 min, não lidas das contas com o
  agente ligado e conferência das conversas esperando o vendedor há mais de 30 min (respondidas direto no ML).

## Telas

- **Pós-venda** (`/pos-venda`): caixa de entrada igual a Perguntas (abas Para responder / Respondidas pelo agente /
  Respondidas por você / Todas, busca por comprador, produto, texto ou nº da venda, conta, 50 por página, ao vivo via
  Realtime). Linha: comprador, produto, prévia, motivo, chip do envio (atrasado em vermelho), reclamação. Conversa:
  cabeçalho (comprador, nº da venda, produto, assunto), avisos (motivo + explicação da IA, reclamação aberta, analisando,
  **fechada pelo ML com o motivo**, arquivada), "Detalhes da venda" recolhível (itens, total, pagamento, envio, forma,
  rastreio, previsão/entrega), histórico em bolhas (comprador / agente / você / você no ML; recusadas pelo ML riscadas com o
  motivo; anexos abrem por `/api/pos-venda/anexo`, que só serve arquivos de mensagens da própria conversa), compositor com
  limite do ML, "Sugestão do agente", anexos (até 5, 4 MB), "Ensinar o agente", Ctrl+Enter, "Enviar e ir para a próxima".
  Menu: atualizar do ML, deixar o agente tentar de novo, arquivar/desarquivar, abrir a venda e o anúncio no ML.
- **Agente** (`/pos-venda/agente`): ligar/pausar (começa pausado), "Como funciona", abas Configuração (instruções do
  pós-venda, assuntos delicados, nível de certeza, assinatura com prévia), Respostas ensinadas e **Testar** (mensagem +
  número de uma venda real opcional; mostra o que o agente faria e o que leu da venda; não envia nada).
- **Painel:** cartão "Pós-venda" (esperando você, conversas da semana, respondidas pelo agente, agente ligado/pausado).
- **Assinatura:** plano atual, "Recursos do seu plano" e o aviso de exclusividade.

## Testes

- Unitários (`tests/unit/after-sale.test.ts`, 46): planos e acesso, texto latin1, conversa (páginas, formatos antigo e
  novo, anexos, bloqueios, pendentes), notificação, destinatário e erros, venda/envio, decisão, prompt, caixa de entrada.
- IA real (`tests/integration/after-sale-live.test.ts`, 12 cenários, `gpt-6-luna`): **12/12 nas 2 rodadas depois do ajuste** (a 1ª rodada, 11/12, mostrou que o motivo
  "assunto delicado" precisava vir antes de "a IA escalou"; corrigido) (rastreio,
  várias mensagens, atraso sem nova data, nota fiscal com e sem informação, uso do produto, defeito nas duas políticas,
  mudança de endereço, pedido de contato, agradecimento, comprador insistindo/irritado).
- RLS: `supabase/tests/pos_venda_rls.sql` (+ os 4 anteriores conferidos).
- QA no navegador (1440 e 390 px) com loja temporária no Supabase de testes: menu e cartão do Painel, abas, conversa com
  anexo, conversa fechada por mediação, configuração (validação de contato, salvar, ligar), ensinar, bloqueio sem plano
  (redireciona + aviso) e rota de anexos (403 sem plano). Dados apagados.

## Limites conhecidos / pendências

- Não testado com conta ML real: depende de uma conta de teste com uma **venda** (ver CEREBRO §13). O app ML de teste precisa
  do tópico **`messages`** e das permissões **Comunicações pré e pós-vendas** e **Venda e envios**.
- Reclamações/mediações (API de claims) não são respondidas: o agente para e a tela manda resolver no ML.
- Vendas Full são atendidas pelo assistente de IA do próprio ML (`blocked_by_ai_assistant`): aparecem como fechadas.
- Resultados ainda não mostra números do pós-venda.
- Teste grátis não inclui o pós-venda (plano nulo) — confirmar com o Breno.
