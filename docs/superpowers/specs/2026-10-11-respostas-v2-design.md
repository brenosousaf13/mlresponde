# Sub-projeto 2 — Respostas automáticas v2 (design)

- **Data:** 2026-10-11 · **Status:** em execução (decisões técnicas delegadas à IA pelo Breno)
- **Depende de:** Fundação (`2026-10-11-fundacao-design.md`). Referência de produto: `docs/v2/referencias-mercado.md`.

## 1. Objetivo

Substituir o motor da v1 ("sempre responde") por um motor confiável e configurável:
a IA só responde sozinha quando tem **certeza** com base nos dados; caso contrário a pergunta vai para o vendedor
responder no painel. Nada se perde: toda pergunta fica registrada com a origem da resposta.

Fora do escopo: WhatsApp (avisos e resposta pelo WhatsApp — provedor ainda não decidido; deixamos o gancho),
importação do histórico antigo de perguntas, limites por plano e cobrança (sub-projeto 4), pós-venda (sub-projeto 3).

## 2. Fluxo

1. **Webhook** `POST /api/webhook/mercadolivre` (URL já cadastrada no app ML): valida `topic=questions`,
   `application_id = ML_CLIENT_ID` e se o `user_id` é uma conta ML conhecida; grava a pergunta (`pending`,
   deduplicada pelo id do ML), responde **200 na hora** e processa em `after()`. Notificação repetida de pergunta já em
   revisão → reconsulta o ML (o vendedor pode ter respondido direto lá).
2. **Processamento** (`lib/answers/engine.ts`): reserva a pergunta no banco (`claim_ml_question`, lock de 2 min),
   busca a pergunta no ML (fonte da verdade), e decide:
   - já respondida/apagada no ML → `answered_outside` / `ignored`;
   - conta desativada, assinatura bloqueada, anúncio na lista "não responder" ou respostas automáticas pausadas →
     `needs_review` com o motivo (sem gastar IA);
   - senão: monta o contexto (anúncio + descrição + variações/estoque, informações da loja, respostas ensinadas,
     perguntas já respondidas do mesmo anúncio) → IA com **saída estruturada** `{action, answer, confidence, reason}`.
   - `answer` com confiança ≥ rigor da conta e texto seguro → monta saudação + texto + assinatura (≤ 2.000 caracteres,
     uma linha) → `POST /answers` → `answered` (origem `ai`);
   - senão → `needs_review` com o rascunho da IA para o vendedor revisar.
3. **Falhas** (ML/IA fora do ar): `failed` com nova tentativa em 1, 2, 4, 8, 16 min (máx. 5). Depois disso fica para revisão.
4. **Reprocessamento:** cada webhook também processa até 5 perguntas atrasadas; em produção, **Vercel Cron** a cada
   minuto em `/api/cron/questions` (protegido por `CRON_SECRET`). Na staging (preview) não há cron.
5. **Sincronizar:** ao conectar uma conta e pelo botão "Sincronizar", busca as perguntas sem resposta no ML.

## 3. Segurança da resposta

- Prompt: só usar os dados fornecidos; não inventar; escalar quando faltar informação ou envolver negociação; texto do
  comprador tratado como conteúdo não confiável (ignorar instruções dentro dele).
- Pós-filtro: bloqueia resposta automática com telefone, e-mail, link ou contato externo (proibido pelo ML) → revisão.
- Rigor configurável por conta: Cautelosa (0,85) · Equilibrada (0,75, padrão) · Ousada (0,60).
- Respostas automáticas **começam desligadas** em cada conta nova: o vendedor revisa as configurações e liga.

## 4. Dados (migração `*_respostas_v2.sql`)

- `ml_accounts` + colunas: `auto_reply_enabled` (false), `ai_confidence_threshold` (0,75), `answer_tone`
  (`cordial|profissional|descontraido`), `answer_greeting`, `answer_signature`, `store_briefing` (até 5.000).
- `ml_questions`: pergunta + anúncio + comprador, `status` (`pending|processing|answered|needs_review|answered_outside|ignored|failed`),
  `review_reason`, rascunho/confiança/motivo/modelo/tokens da IA, resposta final + origem (`ai|manual|external`) +
  quem/quando, avaliação, controle de tentativas/lock. Realtime ligado (RLS: membros da organização).
- `ai_examples` ("ensinar a IA"): pergunta → resposta ideal por anúncio ou para a conta toda.
- `item_blacklist`: anúncios que a IA nunca responde.
- Funções: `claim_ml_question`, `due_ml_questions` (só service role), `question_stats` (painel, respeita RLS).
- As tabelas da v1 (`question_jobs` etc.) não são usadas pela v2; o código da v1 sai da branch `v2`.

## 5. Telas

- **Perguntas** (`/perguntas`): abas "Para revisar", "Respondidas", "Todas"; filtro por conta; atualização ao vivo;
  responder com o rascunho da IA, gerar sugestão, ensinar a IA, ignorar; sincronizar com o ML. Contador no menu.
- **Respostas da IA** (`/respostas`): por conta — ligar/pausar, rigor, tom, saudação, assinatura, informações da loja,
  anúncios que a IA não responde, respostas ensinadas.
- **Painel**: últimos 7 dias — perguntas recebidas, respondidas pela IA, aguardando você, tempo médio da IA; primeiros passos.

## 6. Configuração

- `OPENAI_API_KEY` (já existe), `OPENAI_MODEL` (opcional; padrão `gpt-4o-mini`, o mesmo da v1), `CRON_SECRET`.
- `vercel.json` com o cron (só tem efeito em produção, após o cutover).

## 7. Testes

Unitários (Vitest): parser da notificação, decisão (responder × revisar), detector de contato, montagem da resposta,
backoff, resumo do anúncio e prompt. RLS das tabelas novas em SQL. Teste local do motor com IA real e dados sintéticos.
Teste ponta a ponta com conta ML real depende do Breno (conta segura conectada na staging).
