# Planos Starter, Pro e Escala + Melhorias de anúncio (Sessão 20, 2026-10-13)

## Pedido
O Breno definiu os 3 planos (a partir da proposta da Sessão 19, em `docs/v2/referencias-mercado.md`) e pediu para implementar
as funcionalidades e restrições de cada um e publicar na v2:

| | Starter | Pro (destaque) | Escala |
|---|---|---|---|
| Mensal | R$ 97 | R$ 197 | R$ 397 |
| Anual (2 meses grátis) | R$ 81/mês (R$ 970/ano) | R$ 164/mês (R$ 1.970/ano) | R$ 331/mês (R$ 3.970/ano) |
| Respostas automáticas por mês | 500 | 1.500 | 5.000 |
| Contas do ML | 1 | 3 | 10 |
| Pós-venda com IA | — | ✓ | ✓ |
| Melhorias de anúncio | — | 20/mês | 100/mês |
| Suporte | e-mail | WhatsApp | prioritário + configuração com a gente |

Riscados pelo Breno na tabela: "usuários da equipe" (não existe limite/funcionalidade de equipe), o excedente pago do Escala
(R$ 0,05 por resposta) e "relatório mensal" como diferencial (relatórios = todos os planos). Gateway futuro: **AbacatePay**
(só registrado; a contratação pelo app fica para a próxima etapa).

## Onde mora cada regra
- **Código (fonte da verdade):** `lib/plans/plans.ts` — catálogo (`SELLABLE_PLANS`, `ADMIN_PLAN`, `TRIAL_PLAN`, `PLANS`),
  `resolvePlan` (plano em vigor), `featureAccess`, `answersLimit`, preços e textos. `lib/plans/usage.ts` — período, cota,
  níveis (ok / aviso a partir de 80% / esgotado / sem limite).
- **Banco (espelho para RLS e gatilhos), migração `20261013140000_planos.sql`:** `plan_includes_after_sale` (pro, escala,
  admin, trial), `plan_ml_accounts_limit` (1/3/10), `organization_plan_id` (plano cadastrado ou `trial`),
  `current_user_after_sale_organization_ids` usando o plano em vigor. Mudou um plano → mudar nos dois lugares.

## Plano em vigor
1. Plano cadastrado e conhecido → ele (vale mesmo se a organização ainda estiver em `trialing`).
2. Sem plano e teste no prazo → **teste grátis** = tudo do Pro, com 1 conta, 500 respostas e 3 análises de anúncio no
   período do teste. (Decisão da IA, seguindo a proposta da Sessão 19; mudar em `TRIAL_PLAN` + `plan_includes_after_sale`.)
3. Qualquer outro caso (plano desconhecido, cortesia sem plano, teste vencido) → Starter como base (sem extras). Quem não pode
   usar o app continua bloqueado à parte (`computeAccess`).
- O antigo plano `essencial` (Sessão 11, nunca usado em produção) deixou de existir.

## Respostas automáticas (limite mensal)
- Conta: pergunta respondida pela IA (inclusive a mensagem padrão do modo "Responder sempre") e mensagem de pós-venda enviada
  pelo agente. Não conta: sugestão, Testar, resposta manual, pergunta que ficou com o vendedor.
- Contagem no banco: `organization_ai_answers(org, de, até)` (security invoker; índices parciais novos).
- Período: mês do calendário em Brasília (renova dia 1º, 00:00); no teste grátis, do cadastro até o fim do teste.
- Limite: `organizations.monthly_answers_limit` (acordo definido pelo administrador) ou o do plano.
- Esgotou: os motores (`lib/answers/engine.ts` e `lib/after-sale/engine.ts`) conferem **antes de chamar a IA** e deixam a
  pergunta/conversa com o vendedor (`review_reason = 'answers_limit'`), sem gastar IA e sem perder nada. Limite "mole": duas
  respostas simultâneas no último número podem passar 1–2 do limite (aceito; evita reserva/estorno).
- Avisos: cartão no topo de todas as páginas a partir de 80% e quando acaba (`answersUsageNotice`), barra no Painel e em
  Assinatura, link "Ver planos" dentro da pergunta que ficou por causa do limite.

## Contas do Mercado Livre
- `organizations.ml_accounts_limit` continua sendo o limite aplicado (gatilho da Fundação). Gatilho novo: trocar o plano
  sem mexer no limite preenche o limite do plano; o administrador pode definir outro valor junto (acordo).
- Baixar o limite (ex.: Escala → Pro) **desativa as contas ativas mais novas** acima dele (nada é apagado; o cliente escolhe
  qual reativar dentro do limite). Antes o painel dizia que baixar o limite não desativava.

## Melhorias de anúncio (`/melhorias`, Pro e Escala)
Ideia do Breno: usar as perguntas mais feitas para sugerir melhorias no anúncio e diminuir essas perguntas.
1. Lista os anúncios com mais perguntas nos últimos 90 dias (`listing_question_ranking`, até 30), com a última análise.
2. "Analisar" (mínimo 3 perguntas; 1 da cota): o servidor confere plano e cota, lê até 120 perguntas do anúncio **com a
   resposta que o comprador recebeu** (é a melhor fonte do que falta no anúncio), lê o anúncio no ML (`fetchItemContext` +
   `summarizeItem`, o mesmo que a IA das perguntas lê) e chama a IA (`gpt-6-luna`, raciocínio `low`, JSON Schema estrito).
3. A IA agrupa as dúvidas repetidas, confere se a informação já está no anúncio e devolve até 6 sugestões: área (título,
   descrição, ficha técnica, fotos, variações, condições), prioridade, o problema com números, o que mudar e o **texto pronto
   para colar**. Regra 0: só usa dados do anúncio e das respostas; o que não existir vira `[colchetes]` para o vendedor
   completar. Respeita as regras do ML (título até 60 caracteres sem palavras promocionais, descrição em texto simples, sem
   contato externo, anúncio de catálogo). O resultado é validado em `lib/listing-improvements/parse.ts`.
4. Tela da análise: resumo, sugestões com "Copiar texto" e "Já fiz", e **efeito**: perguntas por semana nos 30 dias antes ×
   depois da análise (a partir de 7 dias).
- A maanu **não altera o anúncio** sozinha (o vendedor muda no ML). Possível evolução: aplicar a descrição pela API do ML.
- Tabela `listing_improvements` (RLS: membros leem; só o servidor grava). Reserva `processing` com índice único por anúncio
  (clique duplo não gasta 2), apagada se falhar (cota não é gasta); reservas abandonadas há mais de 10 min não contam.
- Uso de IA registrado como `listing_improvement` (`ai_usage_events`). Teste com a IA real em
  `tests/integration/listing-improvement-live.test.ts` (~7 s, centavos).

## Telas
- **Assinatura:** plano em vigor com uso (respostas, contas, melhorias), o que conta como resposta, suporte do plano e os 3
  planos com Mensal/Anual. Botão "Assinar" desativado ("Contratação pelo app em breve") até o gateway.
- **Menu:** "Melhorias de anúncio" (ícone lâmpada) depois de Resultados. Itens de plano continuam escondidos para quem não
  tem o plano (decisão da Sessão 11); a URL leva a Assinatura com o aviso "a partir do plano Pro".
- **Resultados:** rodapé do cartão "Anúncios com mais perguntas" leva às Melhorias (ou mostra que é do Pro).
- **Painel:** cartão do plano com a barra de respostas. **Contas:** "no plano X".
- **Painel do administrador:** escolher o plano preenche contas e mensalidade (anual = total ÷ 12); campos novos "Ciclo de
  cobrança" e "Respostas automáticas por mês" (acordo; vazio = do plano); ficha mostra plano em vigor, ciclo e uso.

## Fora desta etapa
Contratação e cobrança (AbacatePay: produtos com `externalId` por plano/ciclo, checkout de assinatura, webhooks
`subscription.*` atualizando `plan`, `billing_cycle`, `subscription_status`, `current_period_end` e `monthly_price`),
canais de suporte (e-mail/WhatsApp ainda não informados), pacote extra de respostas, aplicar sugestões direto no anúncio.
