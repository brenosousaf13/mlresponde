# 🧠 CÉREBRO DO PROJETO — Meli Fácil (Mercado Livre Responde)

> **Fonte única de verdade do projeto.** Qualquer IA (Claude, ChatGPT/Codex ou outra) deve ler este arquivo
> inteiro antes de trabalhar e atualizá-lo ao terminar. Se algo aqui divergir do código, o código vence —
> e este arquivo deve ser corrigido na mesma sessão.

Última atualização: **2026-10-11** (Sessão 4 — Respostas automáticas v2 implementadas na branch `v2`)

---

## 0. Protocolo para IAs (obrigatório)

1. **Antes de qualquer tarefa:** ler este arquivo inteiro + `AGENTS.md`.
2. **Ao terminar qualquer tarefa** que mude código, banco, infraestrutura, escopo ou decisões, atualizar:
   - §1 "Estado atual" (se mudou), §8 "Problemas conhecidos" (marcar resolvidos), §11 "Decisões",
   - §12 "Diário de sessões" (nova entrada no topo) e §13 "Próximos passos".
3. **Nunca** registrar segredos aqui (tokens, chaves, senhas, URLs com credenciais).
4. Datas no formato `AAAA-MM-DD`, fuso `America/Sao_Paulo`.
5. Comunicação com o Breno em **português (BR)**, direta e sem jargão desnecessário.
6. O Breno alterna entre Claude Opus e ChatGPT: escreva pensando que a **próxima IA não viu esta conversa**.

---

## 1. Visão e estado atual

**O que é:** dashboard web que responde automaticamente, com IA, às perguntas de compradores nos anúncios do
Mercado Livre. Recebe o webhook da pergunta, busca dados do anúncio (atributos, variações, estoque), consulta as
regras da loja (base de conhecimento) e o histórico de respostas do vendedor (few-shot), gera a resposta e posta
no ML. Tudo aparece em tempo real na dashboard.

**Nomes:** marca comercial **Meli Fácil** · repositório `brenosousaf13/mlresponde` · pacote npm `ml-automatizado` ·
pasta local `C:\Users\Breno\Desktop\Mercado Livre Responde`.

**História:** construído em abr–jun/2026 para **um cliente**, 100% via IA (o Breno descrevia, a IA codava).
Deu certo e outros clientes querem usar.

**Objetivo agora (v2):** transformar em um **SaaS comercializável e escalável** — autenticação correta,
novas funcionalidades, segurança multi-tenant de verdade — **desenvolvido em paralelo** à produção, com troca
(cutover) sem perda de dados para ninguém.

**Estado atual (2026-10-11):**
- v1 **em produção** na Vercel (deploy automático da branch `main`) usando Supabase de produção.
- Último commit da v1: `ad72bff` (2026-06-08).
- v2 (branch **`v2`**, staging `https://mlresponde-v2.vercel.app` → Supabase de testes + app ML de teste):
  **sub-projeto 1 (Fundação) implementado** em 2026-10-11 — cadastro/login/recuperação de senha, onboarding, teste de
  7 dias com bloqueios no servidor, multi-contas ML com OAuth state+PKCE e tokens criptografados, schema multi-tenant
  com RLS, UI shadcn/ui. Spec: `docs/superpowers/specs/2026-10-11-fundacao-design.md`.
  **Sub-projeto 2 (Respostas automáticas v2) implementado** em 2026-10-11: webhook validado, motor com IA que só responde
  com certeza (senão vai para o vendedor), fila com novas tentativas, telas Perguntas e Respostas da IA, painel com
  métricas. Spec: `docs/superpowers/specs/2026-10-11-respostas-v2-design.md`. Detalhes em §4, §6, §7 e §10.
  Falta testar com conta ML real (depende do Breno).
- **Marca da v2:** logo `MeliLogo.png` = **"MeLi Responde"** (assumido pela IA; confirmar com o Breno). Nome centralizado em
  `lib/config/site.ts`. A v1 em produção usa "Meli Fácil".
- P0 de segurança/toggle (§8) **adiados** por decisão do Breno — revisitar antes de abrir para novos clientes.

---

## 2. Regras de ouro (produção está no ar!)

1. **`main` = produção.** Qualquer push/merge na `main` faz deploy automático para os clientes.
   Não fazer push/merge na `main` sem aprovação explícita do Breno.
   **Na branch `v2` a IA tem autonomia (decisão do Breno, 2026-10-11):** não precisa apresentar plano de
   implementação; decide o melhor caminho, implementa, testa, faz commit e push na `v2` (deploy só na staging).
2. **Banco de produção é sagrado.** Nada de `DROP`, `RENAME`, troca de tipo, `NOT NULL` sem default, ou
   apagar dados direto em prod. Migrações versionadas e **aditivas/retrocompatíveis** (padrão expand → migrate → contract),
   para que a v1 continue funcionando até o cutover.
3. **Segredos nunca no repositório** (`.env*` já está no `.gitignore`). ⚠️ **O repositório GitHub é PÚBLICO**
   (verificado em 2026-10-11): nada de segredos, dados de clientes ou pesquisa sensível. Material privado vai em
   `docs/v2/privado/` (no `.gitignore`). **Recomendado ao Breno: tornar o repositório privado** (produto comercial; o
   `CEREBRO.md` descreve vulnerabilidades da produção). A Vercel continua funcionando com repo privado.
   Enquanto o repo for público, commits com detalhes de vulnerabilidade ficam **só locais** (sem push).
4. **Webhook do Mercado Livre:** cada app do ML tem **uma única** URL de notificações e de redirect.
   Staging precisa de um **app ML separado** (e conta de teste), senão a v2 rouba/duplica webhooks da produção.
5. Perguntas reais de clientes finais são respondidas automaticamente: qualquer bug no fluxo
   webhook → IA → resposta afeta vendas de verdade. Testar sempre em staging antes.
6. **Acesso das IAs ao Supabase:** a CLI fica logada na conta de **testes**. O Supabase de **produção** é acessado
   apenas para leitura/entendimento — nada de `db push`, `migration repair` ou SQL de escrita em prod fora do cutover
   aprovado pelo Breno.
7. **UI:** toda interface segue o **shadcn/ui** (https://ui.shadcn.com/docs/components) — componentes, blocks
   (login, sidebar etc.) e padrões visuais. Adicionar componentes com `npx shadcn@latest add <nome>`; não criar
   componentes "na mão" quando existir equivalente no shadcn.
8. **Vercel:** a CLI está logada na conta do Breno, que tem **vários outros projetos** (outros negócios). Só mexer no
   projeto `mlresponde`, e nele **nunca** alterar variáveis/configurações de Production sem aprovação explícita.
   Variáveis da v2 sempre com escopo **Preview + branch `v2`**.

---

## 3. Stack

| Camada | v2 (branch `v2`) | v1 (produção, `main`) |
|---|---|---|
| Framework | **Next.js 16.2.3** (App Router, Turbopack). `middleware` virou **`proxy.ts`**; `after()` nativo; `params`/`searchParams`/`cookies()` são assíncronos; tipos `PageProps<"/rota">` via `next typegen`. Docs locais em `node_modules/next/dist/docs/` (ler antes de codar). | igual |
| UI | React 19.2 + Tailwind v4 + **shadcn/ui** (preset `base-nova`, primitivos **Base UI** `@base-ui/react`, `cn` do pacote `cn`, ícones `lucide-react`, toasts `sonner`). Componentes em `components/ui/`. Componentes Base UI usam a prop **`render`** (não `asChild`); para links com cara de botão usar `buttonVariants`. | HTML + Tailwind puro |
| Formulários | Server Actions + `useActionState` + **zod 3** (validação no servidor) + componentes `Field` do shadcn | server actions simples |
| Auth | Supabase Auth: cadastro com confirmação de e-mail, login, recuperação de senha, onboarding | usuários criados à mão |
| Banco | Supabase Postgres, migrações em `supabase/migrations/`, tipos gerados em `lib/supabase/database.types.ts` | painel, sem migrações |
| Segurança | RLS só-leitura para o navegador; escritas via service role no servidor (DAL `server-only`); tokens ML AES-256-GCM | RLS fraca |
| Testes | **Vitest** (`tests/unit`), testes de RLS em SQL (`supabase/tests`) | nenhum |
| IA | OpenAI `gpt-4o-mini` (configurável por `OPENAI_MODEL`), saída estruturada JSON Schema `{action, answer, confidence, reason}`, temperature 0.2 | OpenAI `gpt-4o-mini`, texto livre |
| Hospedagem | Vercel (Preview da branch `v2`) | Vercel Production |

Ambiente local verificado: Node v24.18.0, npm 11.16.0, Windows + PowerShell 7. `@types/node` 24.
Removidos na v2: `@anthropic-ai/sdk`, `jimp`, `dotenv` e os scripts soltos da raiz.

---

## 4. Mapa do código (branch `v2`)

> A estrutura da v1 continua na branch `main` (produção). Na `v2` todo o código da v1 foi substituído (telas e motor);
> as tabelas antigas (`question_jobs`, `ml_credentials`, `knowledge_base`, `training_examples`) não são usadas pela v2.

```
proxy.ts                          # renova a sessão (getClaims) e redireciona: sem login → /login?next=; logado em
                                  # /login|/cadastro|... → /painel. NÃO é a camada de segurança (cada página/ação revalida)
app/
  layout.tsx                      # pt-BR, Geist, TooltipProvider, Toaster (sonner), metadata da marca
  page.tsx                        # / → /painel
  icon.png                        # favicon (balão da logo)
  (auth)/                         # telas públicas no estilo shadcn login-03 (fundo muted + card)
    actions.ts                    # signIn, signUp, resendConfirmation, requestPasswordReset, updatePassword, signOut
    login/ cadastro/ verificar-email/ recuperar-senha/ redefinir-senha/
  auth/confirm/route.ts           # links dos e-mails: ?code= (padrão Supabase) e ?token_hash=&type= (template próprio)
  onboarding/                     # nome da loja + WhatsApp (obrigatório) → /contas
  (app)/                          # área logada: sidebar shadcn (collapsible="icon"), header, barras de aviso, tour
    layout.tsx                    # requireOnboardedContext + menu com cadeados (decideSectionAccess)
    actions.ts                    # completeTour
    painel/ perguntas/ respostas/ contas/ assinatura/ configuracoes/   # cada page chama requireSection(...)
    perguntas/actions.ts          # answerQuestion (+ensinar), generateSuggestion, ignoreQuestion, retryWithAi, syncQuestions
    respostas/actions.ts          # setAutoReply, updateAnswerSettings, add/removeBlacklistItem, add/deleteExample
  (legal)/termos, (legal)/privacidade            # RASCUNHOS (revisar com advogado antes do lançamento)
  api/ml/oauth/start/route.ts     # inicia OAuth ML: state + PKCE S256, cookie httpOnly criptografado (10 min)
  api/auth/callback/mercadolivre/route.ts  # retorno do OAuth (URL cadastrada no app ML): valida state/usuário,
                                  # troca code+verifier, /users/me, connectMlAccount
  api/webhook/mercadolivre/route.ts        # webhook ML: valida topic/application_id/conta, registra, 200 na hora, after()
  api/cron/questions/route.ts   # reprocessa a fila (Vercel Cron 1/min, só em produção; Bearer CRON_SECRET)
components/
  ui/                             # shadcn (não editar à toa; regenerar com a CLI)
  app/                            # app-sidebar, nav-user, app-header, access-banners, welcome-tour, page-header...
  auth/ onboarding/ contas/ configuracoes/ legal/ forms/ brand/
lib/
  config/site.ts                  # nome da marca, dias de teste, versão dos termos
  env.ts                          # leitura de env obrigatória (server-only)
  access/access.ts                # computeAccess (trial/active/blocked) + decideSectionAccess (puro, testado)
  dal/app-context.ts              # getCurrentUser, getAppContext (cache por request), requireSection, canManageOrganization
  validation/forms.ts             # schemas zod, WhatsApp BR, safeRedirectPath, FormState
  security/crypto.ts, keys.ts     # AES-256-GCM com AAD + chave ML_TOKEN_ENCRYPTION_KEY
  mercadolivre/pkce.ts, oauth.ts, oauth-cookie.ts, api.ts, accounts.ts   # OAuth v2 + tokens (lease de refresh)
  mercadolivre/client.ts        # mlRequest(accountId, path): token válido + erros tipados (401 → token inválido)
  mercadolivre/questions.ts     # pergunta, item, descrição, perguntas respondidas do anúncio, POST /answers, sync
  mercadolivre/item.ts          # summarizeItem (resumo do anúncio para a IA; puro, testado)
  answers/notification.ts       # parseQuestionNotification (puro)
  answers/compose.ts            # composeAnswer, containsExternalContact, stripAffixes, parseItemId (puros)
  answers/decision.ts           # decideAnswer, retryDelayMs, rótulos, níveis de rigor e tons (puro)
  answers/prompt.ts             # buildMessages + JSON Schema da saída da IA (puro)
  answers/ai.ts                 # runAnswerModel (OpenAI)
  answers/engine.ts             # processQuestion, processDueQuestions, reconcileQuestion, suggestAnswer, sendManualAnswer
  answers/ingest.ts             # registerQuestion, syncUnansweredQuestions
  dal/dashboard.ts              # números do painel (question_stats)
  supabase/server.ts              # createClient (sessão) + createAdminClient (legado v1, sem tipos)
  supabase/admin.ts               # createServiceClient (service role, tipado) + createStatelessAuthClient
  supabase/database.types.ts      # gerado: npx supabase gen types typescript --linked --schema public
  http/site-url.ts                # NEXT_PUBLIC_SITE_URL → URLs de retorno dos e-mails
supabase/
  config.toml, migrations/        # baseline_v1 (espelho de prod) + fundacao_v2 + respostas_v2
  tests/fundacao_rls.sql, respostas_rls.sql   # testes de RLS (sucesso = erro "TESTES_RLS_OK"/"TESTES_RESPOSTAS_OK")
tests/unit/                       # vitest: crypto, pkce, access, forms, answers
tests/integration/ai-live.test.ts # 7 cenários com a IA real; só roda com RUN_LIVE_AI=1 + OPENAI_API_KEY
vercel.json                       # cron /api/cron/questions a cada minuto (efeito só em produção)
docs/                             # specs (superpowers/specs), db (inventário/snapshot de prod), v2 (referências)
public/brand/                     # logo-wordmark.png e logo-icon.png (recortados de MeliLogo.png)
```

---

## 5. Variáveis de ambiente

Usadas no código:

| Variável | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave anon (browser + server com cookies) |
| `SUPABASE_SERVICE_ROLE_KEY` | admin client (bypassa RLS) — só no servidor |
| `OPENAI_API_KEY` | geração de respostas e do manual |
| `ML_CLIENT_ID`, `ML_CLIENT_SECRET` | app do Mercado Livre |
| `ML_REDIRECT_URI` | `https://<dominio>/api/auth/callback/mercadolivre` |

Novas na v2:

| Variável | Uso |
|---|---|
| `ML_TOKEN_ENCRYPTION_KEY` | 32 bytes base64; criptografa tokens do ML e o cookie do OAuth. **Trocar a chave invalida os tokens já gravados** (contas precisam reconectar). Prod terá chave própria. |
| `NEXT_PUBLIC_SITE_URL` | URL base para os links dos e-mails de auth (staging: `https://mlresponde-v2.vercel.app`; local: `http://localhost:3000`) |
| `OPENAI_MODEL` | opcional; padrão `gpt-4o-mini` |
| `CRON_SECRET` | protege `/api/cron/questions`. **Precisa existir em Production no cutover** (o cron só roda em produção). |

Obsoletas (citadas no `instructions.md`, não usadas): `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_APP_URL`.

**Local:** `.env.local` (fora do git) aponta para o ambiente de **testes**, com a mesma `ML_TOKEN_ENCRYPTION_KEY` da
staging; `ML_CLIENT_SECRET` fica vazio (é variável *sensível* na Vercel, não dá para ler) → OAuth do ML só na staging.
Modelo: `.env.example` (versionado, exceção `!.env.example` no `.gitignore`).

**Situação na Vercel (verificada em 2026-10-11, só nomes):** as 7 variáveis acima existem no projeto `mlresponde` e
**todas** valem para Production **e** Preview **e** Development, com os valores de produção. ⚠️ Ou seja: **qualquer
preview (inclusive a branch `v2`) usaria o Supabase e o app ML de PRODUÇÃO**. Antes de subir código da v2, criar
variáveis específicas de **Preview + branch `v2`** (sobrepõem as gerais). Limpeza recomendada (pedir aprovação):
tirar Preview/Development das variáveis de produção. `OPENAI_API_KEY` pode ser reaproveitada na v2 por enquanto.

Projetos Supabase novos podem fornecer chaves no formato novo: `sb_publishable_...` (substitui a anon) e
`sb_secret_...` (substitui a service_role). Entram nas mesmas variáveis acima, sem mudança de código.

Variáveis da v2 na Vercel (Preview + branch `v2`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `ML_REDIRECT_URI`, `ML_TOKEN_ENCRYPTION_KEY`,
`NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`. `OPENAI_API_KEY` herdada da geral (não está no `.env.local`; para testar a IA
localmente, definir no terminal).

---

## 6. Modelo de dados

### 6.1 v2 — Fundação (Supabase de testes; migração `20261011160000_fundacao_v2.sql`)

- `organizations` (cliente do SaaS: nome, `trial_ends_at` = cadastro + 7 dias, `subscription_status`
  `trialing|active|past_due|canceled`, `plan`, `current_period_end`, `billing_exempt` = cortesia, `ml_accounts_limit` padrão 1).
- `organization_members` (org × usuário, papel `owner|admin|member`). Hoje 1 dono por organização.
- `profiles` (= `auth.users.id`: nome, WhatsApp 10–11 dígitos sem +55, aceite dos termos com data/versão,
  `onboarding_completed_at`, `tour_completed_at`, `is_platform_admin`).
- `ml_accounts` (conta ML: `ml_user_id` **único global** → uma conta ML pertence a uma só organização; `status`
  `active|inactive|disconnected`; `token_status` `valid|invalid`; erros de refresh).
- `ml_account_tokens` (tokens **criptografados** + `expires_at` + `refresh_lease_until`; **nenhum** acesso fora do service role).
- Trigger `on_auth_user_created` → cria perfil + organização (trial) + membro dono. Trigger de limite de contas ativas
  (erro `ML_ACCOUNTS_LIMIT_REACHED`). Função `is_org_member()` usada nas policies.
- Privilégios: `anon` nada; `authenticated` só **SELECT** (RLS: membro da organização / próprio perfil); escrita só
  via servidor. Testado em `supabase/tests/fundacao_rls.sql`.
- ⚠️ Usuários antigos (sem perfil/organização) são completados na hora por `ensureAccountSetup` (DAL) — útil no cutover.

### 6.1b v2 — Respostas (migração `20261011180000_respostas_v2.sql`)

- `ml_accounts` + `auto_reply_enabled` (**começa false**), `ai_confidence_threshold` (0,75; presets 0,85/0,75/0,6),
  `answer_tone` (`cordial|profissional|descontraido`), `answer_greeting`, `answer_signature`, `store_briefing` (≤ 5000).
- `ml_questions` (1 linha por pergunta do ML, `ml_question_id` único): dados do anúncio/comprador, `status`
  `pending|processing|answered|needs_review|answered_outside|ignored|failed`, `review_reason`, rascunho/certeza/motivo/
  modelo/tokens da IA, `answer_text` + `answer_source` (`ai|manual|external`) + quem/quando, fila (`attempts`,
  `next_attempt_at`, `locked_until`, `last_error`). Realtime ligado.
- `ai_examples` (respostas ensinadas; `item_id` nulo = vale para a conta toda) e `item_blacklist` (anúncios que a IA não responde).
- Funções: `claim_ml_question` e `due_ml_questions` (só service role), `question_stats` (security invoker, respeita RLS).

### 6.2 v1 — produção (✅ CONFIRMADO em 2026-10-11)

> Fonte: inventário só leitura de prod (`docs/db/inventario-schema.sql`, rodado pelo Breno no SQL Editor).
> Snapshot completo: `docs/db/prod-schema-2026-10-11.json` (estrutura + contagens; **sem dados de clientes**).
> Para atualizar: rodar o SQL de novo em prod e substituir o snapshot.

Em prod não há histórico de migrações: tudo foi criado no painel. A partir de 2026-10-11 o schema da v1 está versionado
em `supabase/migrations/20261011150000_baseline_v1.sql` (espelho exato de prod, aplicado só no Supabase de testes). Postgres 17.6. Sem enums, sem triggers, sem funções
próprias (só `rls_auto_enable`, event trigger padrão do Supabase), sem buckets de Storage, sem pg_cron.
Extensões: pgcrypto, uuid-ossp, pg_stat_statements, pg_graphql, supabase_vault (padrão).

**Volume (2026-10-11):** 7 usuários em `auth.users` (todos e-mail/senha, criados de 2026-04-14 a 2026-09-29;
último login 2026-09-30) · 7 contas ML em `ml_credentials` · 5 bases de conhecimento · 322 exemplos de treino ·
~2.682 perguntas em `question_jobs` (~2,8 MB). Volume pequeno → migração de dados no cutover é simples.

**Modelo de tenancy:** `auth.users` 1 → N `ml_credentials` (conta ML = `seller_id`, unique). `question_jobs` **não tem
`user_id`**: liga ao tenant só por `seller_id` (texto, sem FK). Nenhuma FK entre as tabelas de negócio.

| Tabela | Colunas (todas `id uuid pk default gen_random_uuid()`, `created_at`/`updated_at timestamptz default now()`) | Constraints / índices |
|---|---|---|
| `question_jobs` | question_id text NN, item_id text NN, seller_id text NN, question_text text NN, status text NN default `'pending'`, ai_response, error_message, item_title, item_url | unique(question_id); índices em created_at desc e status. **Sem índice em seller_id.** Realtime ativo. |
| `ml_credentials` | seller_id text NN, access_token text NN, refresh_token text NN, expires_at timestamptz NN, user_id uuid (nullable, FK auth.users), auto_reply_enabled bool default **false** | unique(seller_id). Tokens em texto puro. |
| `knowledge_base` | seller_id text NN, content text NN, user_id uuid (nullable, FK auth.users) | unique(seller_id) → 1 base por conta ML. |
| `training_examples` | user_id uuid NN (FK auth.users), seller_id text NN, question_id text NN, item_id text NN, question_text text NN, answer_text text NN | unique(question_id) global. |

- `status` é texto livre (valores usados: `pending`, `processing`, `done`, `error`, `manual` na rota legada).
- `updated_at` não tem trigger: só muda quando o código manda o valor.
- **`connection_logs` NÃO existe** em prod: o callback do OAuth tenta gravar nela e falha em silêncio (nenhum log é salvo).
- FKs para `auth.users` sem `on delete cascade`.

**RLS (todas as 4 tabelas com RLS ligado; anon e authenticated têm GRANT total, então só o RLS protege):**

| Tabela | Policy (FOR ALL, roles=public) | Efeito |
|---|---|---|
| `question_jobs` | "Autenticados podem ver tudo": `auth.role() = 'authenticated'` | 🔴 **Qualquer usuário logado lê, altera e apaga as perguntas de TODAS as lojas** (API e Realtime). |
| `ml_credentials` | "Usuário só vê as próprias credenciais": `auth.uid() = user_id` | Só as próprias linhas, mas o usuário consegue ler os próprios tokens do ML pelo browser e editar a própria linha (ex.: `seller_id`). |
| `knowledge_base` | "Usuário só acessa própria base": `auth.uid() = user_id` | OK para isolamento. |
| `training_examples` | "Usuário só acessa próprios exemplos": `auth.uid() = user_id` | OK para isolamento. |

(O servidor usa service role e ignora RLS; o browser só usa a chave anon no Realtime da dashboard.)

---

## 7. Fluxos principais

### 7.0 v2 — Fundação (branch `v2`)
- **Cadastro** `/cadastro` → `supabase.auth.signUp` (metadata `full_name`, `terms_version`; `emailRedirectTo` =
  `NEXT_PUBLIC_SITE_URL/auth/confirm?next=/onboarding`) → `/verificar-email` (reenviar). Trigger cria perfil/org/membro.
- **Confirmação** → `/auth/confirm`: `?code=` → `exchangeCodeForSession` (precisa ser o **mesmo navegador** do cadastro;
  se não for, o e-mail já fica confirmado e manda para `/login?erro=confirmado`) ou `?token_hash=&type=` → `verifyOtp`.
- **Login** `/login` (mensagens PT-BR; e-mail não confirmado → botão de reenviar). `next` só aceita caminho interno.
- **Senha:** `/recuperar-senha` → e-mail → `/auth/confirm?next=/redefinir-senha` → `updateUser`. Em
  `/configuracoes`, troca exige a senha atual (verificada com cliente sem cookies e sessão descartada).
- **Onboarding** `/onboarding`: nome da loja + WhatsApp → `onboarding_completed_at` → `/contas` com tour de 4 passos.
- **Acesso** (`lib/access/access.ts`, checado em toda página/ação/rota): bloqueado (teste vencido sem assinatura) → só
  `/assinatura` e `/configuracoes`; sem conta ML ativa → também `/contas`; senão tudo. Cortesia (`billing_exempt`) libera.
- **Conectar ML:** `/api/ml/oauth/start` (dono/admin, não bloqueado) → ML → `/api/auth/callback/mercadolivre` →
  valida cookie/state/usuário → troca code+verifier → `/users/me` (confere `user_id`) → `connectMlAccount`:
  conta de outra org → `conflito`; mesma org → reconecta; nova → ativa (ou desativada se passou do limite).
- **Contas:** verificar conexão (usa `getValidAccessToken` com lease de refresh), ativar/desativar (limite no banco),
  desconectar (apaga tokens, mantém histórico). O token do ML **não** sai do servidor.

### 7.0b v2 — Respostas automáticas
1. ML → `POST /api/webhook/mercadolivre` → só aceita `topic=questions`, `application_id = ML_CLIENT_ID` e conta conhecida
   (não desconectada) → `registerQuestion` (dedupe por `ml_question_id`) → 200 → `after()`: processa a nova (ou, se
   repetida e em revisão, `reconcileQuestion`) + até 5 atrasadas.
2. `processQuestion`: `claim_ml_question` (lock 2 min) → `GET /questions/{id}` (fonte da verdade). Já respondida/apagada
   no ML → `answered_outside`/`ignored` (se o texto bate com o nosso, `answered`). Conta inativa / assinatura bloqueada /
   anúncio bloqueado / respostas pausadas → `needs_review` **sem gastar IA**. Senão: anúncio + descrição + perguntas já
   respondidas do anúncio + informações da loja + respostas ensinadas → IA → `decideAnswer`: resposta com certeza ≥
   rigor, sem contato externo e ≤ 2000 caracteres → grava `answer_text` → `POST /answers` → `answered`; senão
   `needs_review` com rascunho.
3. Erros: `failed` + nova tentativa em 1/2/4/8/16 min; após 5 → `needs_review` (`processing_error`). Token inválido →
   `needs_review` (`account_inactive`).
4. Fila: webhook processa até 5 atrasadas; produção terá Vercel Cron a cada minuto. **Staging não tem cron.**
5. Ao conectar/reconectar conta: sincroniza as perguntas sem resposta do ML (até 200) e processa.
6. Painel do vendedor: Perguntas (abas, filtro por conta, ao vivo via Realtime, responder com rascunho, "Sugestão da IA",
   "Ensinar a IA", arquivar, "Deixar a IA tentar de novo", sincronizar) e Respostas da IA (ligar/pausar, rigor, tom,
   saudação, assinatura, informações da loja, respostas ensinadas, anúncios bloqueados).
- Realtime no navegador: chamar `supabase.realtime.setAuth(access_token)` antes de assinar (sem isso o RLS bloqueia os eventos).

### 7.1 v1 (produção) — Login
`/login` → server action `login` (`signInWithPassword`) → `/`. `proxy.ts` redireciona não-logados para `/login`
e logados que acessam `/login` para `/`.

### 7.2 Conectar conta do Mercado Livre (OAuth)
Configurações → `/api/auth/connect-ml` → ML → `/api/auth/callback/mercadolivre?code=...` → `exchangeCodeForToken` →
pega o usuário logado pelos cookies → `upsert` em `ml_credentials` (`onConflict: seller_id`) com `user_id` →
`/settings?success=ml_connected`. Falhas vão para `connection_logs`. Sem parâmetro `state`.

### 7.3 Pergunta → resposta automática (CORE)
1. ML faz `POST /api/webhook/mercadolivre` com `{ topic: 'questions', resource: '/questions/{id}', user_id }`.
2. Webhook faz `insert` em `question_jobs` com placeholders (`item_id='buscando_item'`,
   `question_text='Buscando do Mercado Livre...'`, `status='processing'`).
   **Se o insert falhar (question_id duplicado) → webhook repetido, ignora.**
3. Responde 200 imediatamente e agenda `processQuestionWorkflow` com `after()` (até 60 s).
4. `workflow.ts`: `fetchQuestion` + `fetchItem` → se a pergunta não está `UNANSWERED`, marca `done`
   ("Respondida manualmente pelo vendedor na plataforma.") → senão atualiza dados reais do item/pergunta →
   `generateAnswer` → `postAnswer` (`POST /answers`) → `status='done'` + `ai_response`. Erro → `status='error'` + `error_message`.
5. **Não verifica `auto_reply_enabled`** (bug, ver §8).

### 7.4 Dashboard ao vivo
Server busca os `seller_id` do usuário e os 20 jobs mais recentes (service role). O client assina Realtime em
`question_jobs` com filtro `seller_id=in.(...)` e aplica INSERT/UPDATE/DELETE na lista.

### 7.5 Treinamento (histórico)
Botão "Sincronizar Histórico do ML" → busca 4 páginas × 50 de `/my/received_questions/search?status=ANSWERED`
em paralelo → bulk `upsert` em `training_examples` (`onConflict: question_id`).

### 7.6 Base de conhecimento
Textarea salva em `knowledge_base` (upsert por `seller_id`). Botão "Extrair Regras da IA Magicamente" manda os 100
exemplos mais recentes para o `gpt-4o-mini` gerar um manual (o usuário revisa e salva).

### 7.7 Prompt de resposta (`lib/ai/responder.ts`)
- **System:** persona "assistente de vendas no ML" + `<INSTRUÇÕES_DA_LOJA_E_POLITICAS>` (knowledge_base) +
  `<EXEMPLOS_HISTORICOS_DO_VENDEDOR>` (até 3 do mesmo item + 20 gerais, dedup, máx. 25) + regras
  (saudação, CTA sutil, não mentir, texto puro sem markdown).
- **User:** título, preço, atributos, variações com estoque (ou aviso de esgotadas) e a pergunta.

---

## 8. Problemas conhecidos / dívida técnica (auditoria de 2026-10-11)

Legenda: 🔴 P0 crítico · 🟠 P1 importante · 🟡 P2 melhoria. Marcar ✅ quando resolvido (com data e sessão).

> **Status na v2 (Fundação, 2026-10-11):** resolvidos **no código novo** (não em produção): isolamento por organização com
> RLS só-leitura; OAuth com state+PKCE e "uma conta ML = uma organização" (sem sequestro); tokens criptografados e fora do
> navegador; refresh com lease; erros do OAuth sem detalhes técnicos na URL; multi-contas sem `.single()`.
> **Sub-projeto 2 (2026-10-11):** "pausar" funciona de verdade (e começa pausado), webhook validado (app, tópico, conta),
> fila com novas tentativas e locks (nada fica preso em "processing"), sem respostas inventadas (certeza + escalonamento),
> bloqueio de contato externo. Produção continua com os problemas até o cutover.

### 🔴 P0
> ⏸️ **Adiados por decisão do Breno (2026-10-11):** hoje são poucos usuários. **Lembrar o Breno** e resolver antes de
> abrir o app para novos clientes (no máximo junto com o cutover da v2).
>
> ⚠️ **Agravante descoberto em 2026-10-11:** o **cadastro público está ABERTO** no Supabase de prod
> (`disable_signup=false`, verificado via `/auth/v1/settings`). A v1 não tem tela de cadastro, mas a API de Auth
> aceita `signUp` com a chave anon (pública). Ou seja, **qualquer pessoa** (não só os 7 usuários) pode criar conta,
> confirmar o próprio e-mail e ler todas as perguntas de todas as lojas. **Mitigação sem código e sem risco:** o Breno
> desligar "Allow new users to sign up" em Authentication no painel do Supabase de prod (usuários existentes e
> criação manual pelo painel continuam funcionando). Recomendado fazer já.

- **Toggle "Automação de Respostas" não funciona em produção.** A checagem de `auto_reply_enabled` foi adicionada
  (commit `d50544e`) só em `app/api/process/route.ts`, rota legada que ninguém chama desde `4665c5c`. O webhook usa
  `lib/mercadolivre/workflow.ts`, que **sempre responde**. Cliente que "pausa o robô" continua tendo respostas automáticas.
- **Vazamento entre lojas em `question_jobs` (✅ CONFIRMADO em 2026-10-11).** A policy de prod é
  `auth.role() = 'authenticated'` para ALL: qualquer usuário logado pode ler, alterar e apagar perguntas/respostas
  de todas as lojas usando a chave anon (o filtro do Realtime é escolhido pelo browser). `knowledge_base`,
  `training_examples` e `ml_credentials` estão isoladas por `auth.uid() = user_id`.
- **OAuth sem `state` + upsert por `seller_id` sobrescreve `user_id`.** Um usuário pode "tomar" uma conta ML já
  vinculada a outro usuário ao conectá-la; também há risco de CSRF no fluxo de conexão.

### 🟠 P1
- Tabela `connection_logs` não existe em prod → logs de erro do OAuth nunca são gravados.
- Usuário consegue ler os próprios tokens do ML pelo browser (policy de `ml_credentials` permite SELECT/UPDATE) →
  na v2, tokens só no servidor (sem acesso pela chave anon) e criptografados.
- Webhook sem validação de origem (não confere `application_id` nem se o `seller_id` existe) → qualquer um pode
  criar linhas em `question_jobs`.
- Jobs podem ficar presos em `processing` se a função morrer (sem fila, retry nem reprocessamento; `scratch.ts`
  era o remendo manual).
- Tokens do ML guardados em texto puro.
- Settings e Treinamento usam `.single()` em `ml_credentials` → quebram com 2+ contas ML por usuário
  (a dashboard já suporta várias).
- Dashboard: só 20 últimos jobs, sem paginação, filtros, busca ou métricas; status `manual` sem badge.
- Callback do OAuth expõe mensagens de erro técnicas na URL.
- Sync de treinamento sem tratamento de rate limit (429) do ML; tokens refrescados sem lock (refresh concorrente).

### 🟡 P2
- ✅ (v2, 2026-10-11) Rota legada `app/api/process/route.ts` removida.
- ✅ (v2) Migrações versionadas, testes (Vitest + RLS) e `.env.example`. Ainda falta CI e README; `instructions.md` é histórico.
- ✅ (v2) `app/layout.tsx` com metadata da marca e `lang="pt-BR"`.
- ✅ (v2) Tipos gerados do banco (`lib/supabase/database.types.ts`) e aplicados aos clientes.
- Lint (v2): só 3 `any` no motor de respostas da v1 (`lib/ai/responder.ts`, `lib/mercadolivre/questions.ts`, `workflow.ts`) — some no sub-projeto 2.
- ✅ (v2) Scripts soltos removidos (resta `ML Automatizado.code-workspace`, inofensivo).
- ✅ (v2) Dependências sem uso removidas (`@anthropic-ai/sdk`, `jimp`, `dotenv`).

---

## 9. Estratégia de desenvolvimento paralelo (✅ APROVADA pelo Breno em 2026-10-11)

**Ambientes**
- **Produção (v1):** `main` + Vercel Production + Supabase prod + app ML atual. Intocados até o cutover.
- **Staging (v2):** branch longa (ex.: `v2`) → Vercel cria **Preview Deployments** automaticamente;
  Supabase **separado**; **app ML de teste separado** com conta de teste;
  variáveis de ambiente configuradas na Vercel só para "Preview".
- O Supabase de testes fica numa **segunda conta Supabase** do Breno (o plano free limita 2 projetos ativos por conta).

**URLs**
- Produção (v1): `https://mlresponde.vercel.app` (webhook respondendo em `/api/webhook/mercadolivre`, verificado em 2026-10-11).
- Staging (v2): **`https://mlresponde-v2.vercel.app`** (nome livre em 2026-10-11). A adicionar em Vercel → Settings →
  Domains e associar ao Git branch `v2` (ambiente Preview). Com isso a URL fica fixa para o app ML de teste.
- ⚠️ **Deployment Protection da Vercel** bloqueia previews para quem não está logado na Vercel. O webhook do ML
  (servidor→servidor) receberia 401. Ao configurar a Vercel: desligar a proteção dos previews (o app já tem login
  próprio) ou usar "Protection Bypass for Automation" com `?x-vercel-protection-bypass=...` na URL de notificação.

**Vercel**
- Projeto `mlresponde` (id `prj_6RCiRvJowZ3Oq3kmm0GdYuB9ge3u`), time `brenosousaf132-gmailcoms-projects`, repo
  `brenosousaf13/mlresponde`, production branch `main`, único domínio hoje: `mlresponde.vercel.app`.
- Git local: o `.gitconfig` global usa outra identidade (`clickcristao2026`); este repo tem `user.name`/`user.email`
  locais = `Apet-rota <39978008+brenosousaf13@users.noreply.github.com>` (mesma identidade dos commits antigos).
- Vercel CLI (`npx vercel`, v63) já logada como `brenosousaf132-3594`. A pasta local **não** está linkada (`.vercel/`
  ausente). Não usar `vercel link --yes` sem cuidado: pode puxar variáveis de **produção** para o `.env.local`.
- Deployment Protection: era Standard (`all_except_custom_domains`); **desligada em 2026-10-11** (aprovado pelo Breno)
  para o webhook do ML alcançar a staging. A produção já era pública e o app tem login próprio.
- **Staging configurada em 2026-10-11:** domínio `mlresponde-v2.vercel.app` → branch `v2`; variáveis **Preview +
  branch `v2`**: `NEXT_PUBLIC_SUPABASE_URL` (testes), `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`
  (chaves **legacy** JWT do projeto de testes, compatíveis com o código atual; o projeto também tem as novas
  `sb_publishable`/`sb_secret`), `ML_CLIENT_ID` (app de teste), `ML_REDIRECT_URI` (v2) e `ML_CLIENT_SECRET`
  (valor real colocado pelo Breno no painel em 2026-10-11). `OPENAI_API_KEY` é herdada da geral.
- A Vercel só aceita variáveis/domínio com `gitBranch` depois que a branch existe no GitHub. Variáveis entram no
  build: depois de mudar uma variável, é preciso um novo deploy (push ou "Redeploy").

**App ML de teste (DevCenter) — criado em 2026-10-11**
- **Client ID: `8693830632560554`** (não é segredo; aparece na URL de autorização). Client Secret: só no DevCenter/Vercel.
- Configuração recomendada (o Breno confirmou que criou; não deu para conferir pela API, que exige token):
- Redirect URI: `https://mlresponde-v2.vercel.app/api/auth/callback/mercadolivre` (tem que bater com `ML_REDIRECT_URI`).
- Fluxos OAuth: Authorization Code ✅ · **Refresh Token ✅ (obrigatório; sem ele a conexão morre em 6 h)** ·
  Client Credentials ❌ (o app sempre age em nome do vendedor).
- PKCE: ❌ **por enquanto** — o código atual não envia `code_challenge` e quebraria. Ligar quando a v2 implementar
  o OAuth novo com `state` + PKCE (correção do P0 de OAuth).
- Negócios: Mercado Livre ✅ · VIS ❌ (veículos/imóveis/serviços).
- Permissões (amplas de propósito, pensando nas funcionalidades de IA da v2):
  Usuários = L+E (padrão) · **Comunicações pré e pós-vendas = L+E (essencial: perguntas)** · Publicação e
  sincronização = L+E · Publicidade = L+E · Faturamento = só Leitura (ou Sem acesso se não houver "Leitura") ·
  Métricas do negócio = Leitura · Promoções/cupons = L+E · Venda e envios = L+E.
- Tópicos: **`questions` (essencial)**, `orders_v2`, `orders_feedback`, `messages` (created), `items`,
  `price_suggestion`/preços, competição de catálogo, `shipments`, `public_candidates`/`public_offers`, `claims`.
  Não marcar: VIS leads, flex-handshakes, catalog_suggestions (Brand Central), invoices.
  O webhook atual ignora (responde 200) tudo que não é `questions`.
- URL de notificação: `https://mlresponde-v2.vercel.app/api/webhook/mercadolivre`. Se o DevCenter recusar porque a
  URL ainda não existe, criar o app sem tópicos/URL e adicionar depois do primeiro deploy da `v2`.
- Tópicos podem ser alterados a qualquer momento. **Permissões novas provavelmente exigem que o vendedor
  reconecte a conta** → no cutover, ao ampliar as permissões do app de produção, a v2 precisa detectar a falta de
  permissão e pedir reconexão (planejar).
- Client Secret: nunca no chat; vai direto para as env vars da Vercel (Preview) e para o `.env.local`.

**Supabase de testes — Auth (configurado em 2026-10-11 via Management API)**
- Site URL `https://mlresponde-v2.vercel.app`; redirects permitidos: `https://mlresponde-v2.vercel.app/**`, `http://localhost:3000/**`;
  senha mínima 8; confirmação de e-mail ligada; cadastro aberto (é o fluxo do produto).
- ⚠️ Plano free + SMTP padrão: **não** dá para editar templates de e-mail, o envio é limitado (~2/hora) e **só entrega para
  e-mails de membros da organização Supabase**. Para testes com outros e-mails ou para lançar: SMTP próprio (ex.: Resend).
- Token da CLI fica no Gerenciador de Credenciais do Windows (`Supabase CLI:supabase`); a IA o usa para a Management API
  sem exibir o valor.

**Acesso das IAs ao Supabase (Supabase CLI)**
- CLI usada via `npx supabase` (v2.120.0 testada em 2026-10-11; sem instalação global).
- Login: o **Breno** roda `npx supabase login` no terminal dele, com o navegador logado na conta de **testes**.
  O token fica no Gerenciador de Credenciais do Windows: não passa pelo chat nem vai para o repositório.
  As IAs rodam os demais comandos (`link`, `migration`, `db push`) na mesma máquina/usuário.
- O token da CLI vale para **todos os projetos da conta logada** → por isso a CLI fica na conta de testes.
- SQL no projeto de testes sem Docker: `npx supabase db query --linked --project-ref ookosqyfazobiwmopiix -f <arquivo>`
  (via Management API; `--project-ref` só funciona junto com `--linked`; `-o json` para saída parseável).
- Pasta linkada ao projeto de **testes** (`supabase link --project-ref ookosqyfazobiwmopiix`, sem senha: a CLI usa
  "login role" temporário). `supabase/config.toml` criado por `supabase init`; `supabase/.temp/` fica fora do git.
- ⚠️ **Contas ML para testar a staging:** nunca conectar no app de teste uma conta ML que também está conectada ao app de
  produção (loja real de cliente): os dois apps receberiam as perguntas e a staging responderia compradores reais
  (o robô da v1 sempre responde). Usar usuários de teste do ML (`POST /users/test_user`) ou uma conta sem anúncios.
- Projeto de testes: **"Mercado Livre Responde v2"** · ref `ookosqyfazobiwmopiix` · região `us-east-2` · Postgres 17.
  Login da CLI feito e testado em 2026-10-11 (`npx supabase projects list` ok); pasta ainda **não linkada**.
- ⚠️ A conta logada na CLI também tem projetos de **outro negócio** do Breno (**"Noord Analytics"** e um projeto
  inativo). **Nunca** linkar, ler ou alterar esses projetos: sempre passar `--project-ref ookosqyfazobiwmopiix`
  ou conferir o projeto linkado antes de qualquer comando.
- Produção (outra conta): acesso **somente leitura**, forma a definir (role Postgres read-only ou MCP do Supabase
  com `read_only=true`).
- Sem Docker/`psql`/`pg_dump` na máquina: `supabase db push` funciona sem Docker; `supabase db dump`/`db pull`
  provavelmente exigem Docker → para a baseline, alternativa é instalar o cliente PostgreSQL (`pg_dump`) via `winget`.

**Banco**
- ⚠️ **Breno (2026-10-11): "muita coisa vamos refazer".** O schema da v2 será **desenhado do zero** (multi-tenant
  correto), e não copiado da v1. O inventário da produção serve para (1) entender o que existe e (2) planejar a
  **migração dos dados** de prod para o schema novo no cutover (usuários, contas ML, base de conhecimento,
  exemplos de treino, histórico de perguntas). A estratégia de cutover do banco (tabelas novas em paralelo +
  cópia de dados vs. evolução das atuais) será definida depois do inventário. A regra continua: nada em prod pode
  quebrar a v1 antes do cutover.
- O Supabase de testes (projeto novo) já vem com a função `public.rls_auto_enable` (padrão dos projetos novos).
- ✅ **Baseline aplicada no Supabase de testes (2026-10-11):** `supabase/migrations/20261011150000_baseline_v1.sql`
  (gerada do snapshot de prod). Comparação automática teste × prod: tabelas, colunas, constraints, índices, RLS,
  policies, privilégios e Realtime **idênticos**. Única diferença: extensão `pg_graphql` só em prod (não usada).
- **No cutover:** a baseline **não** roda em prod (as tabelas já existem). Linkar a CLI ao projeto de prod e rodar
  `supabase migration repair --status applied 20261011150000`; depois `db push` aplica só as migrações da v2.
- Toda mudança de banco da v2 = nova migração em `supabase/migrations/` (`npx supabase migration new <nome>`),
  testada no Supabase de testes com `db push --linked`.
- Primeiro passo: capturar o schema real de prod (`supabase db pull` ou dump de schema) como **migração baseline**
  em `supabase/migrations/`. A partir daí, toda mudança vira migração versionada.
- Migrações da v2 aditivas e compatíveis com a v1, para poderem ser aplicadas em prod **antes** do merge.
- Migração de dados (se houver) testada contra uma cópia do prod.

**Cutover (troca sem perda)**
1. Backup completo do Supabase de prod.
2. Aplicar migrações da v2 em prod (v1 continua funcionando).
3. Merge `v2` → `main` → deploy automático.
4. Smoke test (login, conexão ML, pergunta de teste ponta a ponta).
5. Rollback se necessário: "Instant Rollback"/Promote do deploy anterior na Vercel (banco segue compatível).

---

## 10. Roadmap v2

**Processo:** o Breno delegou as decisões técnicas (2026-10-11): para cada sub-projeto a IA escreve a spec em
`docs/superpowers/specs/` (registro para as próximas IAs) e implementa direto na `v2`, sem pedir aprovação de plano.
Decisões de **produto** (preços, planos, textos legais, marca, WhatsApp) continuam com o Breno.

**Status dos sub-projetos:**
- ✅ **1. Fundação** — implementada em 2026-10-11 (spec `2026-10-11-fundacao-design.md`). Pendências: teste real de conexão
  com conta ML, SMTP próprio, revisar termos/privacidade, PKCE obrigatório no app ML, plano de migração dos dados v1.
- ✅ **2. Respostas automáticas v2** — implementado em 2026-10-11 (spec `2026-10-11-respostas-v2-design.md`). Pendências:
  teste com conta ML real, WhatsApp (avisos/responder pelo WhatsApp — escolher provedor), importar histórico do ML para
  "ensinar" a IA, avaliação das respostas, cron só após o cutover.
- ⏭️ **Próximo (sugestão):** migração de dados v1 → v2 + plano de cutover, ou sub-projeto 4 (planos/cobrança) — decidir com o Breno.
- ⏳ 3. Módulos de IA/gestão · ⏳ 4. Comercial (planos, Stripe/gateway, admin).

**Referências:**
- `docs/v2/referencias-mercado.md` (versionado): visão de **produto** do AgilizaPRO (jornada, planos, módulos, regras,
  pontos fracos) + Zelure.
- `docs/v2/privado/AGILIZAPRO-ENGENHARIA-REVERSA.md` (**fora do git**, só na máquina do Breno): engenharia reversa
  técnica completa (rotas, endpoints, modelo de dados, fluxos). Consultar para detalhes de implementação.

**Divisão em sub-projetos** (cada um com sua spec; ordem sugerida):
1. **Fundação** — cadastro/login, onboarding, trial e bloqueios, multi-contas ML por cliente, OAuth seguro (state+PKCE),
   tokens criptografados, schema novo multi-tenant, migração dos dados de prod (resolve os P0).
2. **Respostas automáticas v2** — evolução do núcleo (ver "o que aproveitar").
3. **Módulos de IA/gestão** — um por vez (ver "o que aproveitar").
4. **Comercial** — planos, cobrança recorrente, painel admin do Breno, controle de custo de IA.

### Jornada do cliente — ✅ DEFINIDA pelo Breno (2026-10-11), adaptada do AgilizaPRO
1. Conhece o Meli Fácil pela **página de vendas** e pelo **Instagram**.
2. CTA da página leva ao **cadastro** (não ao pagamento).
3. Confirma o e-mail → aceita os termos → onboarding.
4. Entra em **teste grátis de 7 dias, sem cartão**.
5. **Tudo bloqueado até conectar uma conta do ML**; depois configura (o que responder, como responder, dados da loja).
6. **Venceu o teste sem assinar → funcionalidades bloqueadas** (só Assinatura/Configurações acessíveis).
7. **Assina por dentro da conta** (escolhe o plano; **cobrança mensal**).
- Proposta (confirmar no design): assinar durante o teste **mantém os dias restantes** (como o AgilizaPRO).
- Regras de bloqueio (teste/plano/limites) **sempre no servidor e na RLS**, nunca só no navegador.

### O que aproveitar do AgilizaPRO (proposta da IA, a validar no design de cada sub-projeto)
- **Fundação:** cadastro com confirmação de e-mail, aceite de termos registrado, onboarding em passos (tour), barra de
  dias de teste + "Ver planos", bloqueio até conectar ML, bloqueio pós-teste, multi-contas ML, ativar/desativar conta
  (libera vaga do plano, mantém histórico), desvincular × excluir, **uma conta ML pertence a um único cliente** (conflito
  → pedido de transferência), saúde do token com aviso só quando a integração parou, cupom de indicação (`?ref=`).
- **Respostas v2:** IA com **confiança** (só responde se tiver certeza; senão escala), **briefing da loja por conta**,
  **ensinar a IA** (resposta ideal por anúncio ou para a conta), **blacklist de anúncios**, histórico com a **origem da
  resposta** (IA / WhatsApp / painel / fora da plataforma), resposta manual com histórico do comprador, saudação +
  assinatura, respostas prontas, avaliação 1–5 estrelas, sino de perguntas novas, dashboard de atendimento (total,
  % IA, pendentes, tempo médio, top produtos), responder as pendentes ao conectar a conta.
- **Módulos seguintes (um por vez):** Pós-venda (mensagens + reclamações/mediações), Melhorias de anúncio por IA (com
  cota mensal), Vendas com lucro por pedido, Centro de Custo (margem de contribuição, custo por SKU, regime tributário),
  Equipe com permissões, Feedback/Ajuda com IA.
- **WhatsApp como canal** (avisos + responder pelo WhatsApp): muito forte no AgilizaPRO, mas exige provedor de WhatsApp
  (custo/complexidade) → decidir no sub-projeto 2.
- **Não copiar:** bloqueios só no navegador; enviar dados sensíveis/sessão ao navegador ou a webhooks; senha master
  padrão; orquestração em n8n (usar workers próprios com fila, versionados e testados).
- **Referência de preço:** Starter R$ 97,90 (250 perguntas, 1 conta), PRO R$ 159,80 (1.000, 3 contas),
  Enterprise R$ 299 (5.000, 10 contas); anual −17%.

### Pontos em aberto (decidir no design)
- Gateway de pagamento (Stripe, como o AgilizaPRO, ou Mercado Pago/Asaas) e nota fiscal → sub-projeto 4.
- Planos do Meli Fácil (limites por perguntas, contas ML, módulos de IA) → sub-projeto 4.
- WhatsApp: obrigatório no onboarding? provedor? → sub-projetos 1/2.
- Login com Google no cadastro? → sub-projeto 1.
- Clientes atuais da v1 (7 usuários): como entram nos planos no cutover (ex.: período de cortesia) → sub-projeto 1.

**Temas técnicos já levantados:** RLS correta, OAuth com `state`+PKCE, tokens criptografados e só no servidor,
webhook do ML validado, fila/reprocessamento de jobs, observabilidade, controle de custo de IA por cliente.

---

## 11. Registro de decisões

| Data | Decisão | Motivo / contexto |
|---|---|---|
| 2026-04-14 | IA migrada de Claude para OpenAI `gpt-4o-mini` | Pedido do cliente. |
| 2026-04-14 → 05-15 | Processamento roda no próprio webhook via `after()` em vez de `fetch` para `/api/process` | A Vercel matava o `fetch` não aguardado; `after()` mantém a função viva após o 200. |
| 2026-04-15 / 05-15 | Deduplicação de webhooks pela unique de `question_id` no insert | ML envia notificações repetidas; checagens de status geravam deadlock/falsos erros. |
| 2026-05-13 | Multi-tenant via `user_id` em `ml_credentials`/`knowledge_base`/`training_examples`, server com service role + filtros manuais | Preparar o app para mais clientes. |
| 2026-05-14 | Marca renomeada para **Meli Fácil** | — |
| 2026-10-11 | Criado `CEREBRO.md` como fonte única de contexto; `AGENTS.md` é a porta de entrada (Codex lê direto; Claude via `CLAUDE.md`) | Breno alterna entre Claude e ChatGPT; nenhuma IA pode perder o fio. |
| 2026-10-11 | Estratégia de ambientes (§9) aprovada | Desenvolver a v2 em paralelo sem afetar a produção. |
| 2026-10-11 | P0 (§8) adiados | Poucos usuários hoje; revisitar antes de abrir para novos clientes. |
| 2026-10-11 | Supabase de testes numa segunda conta Supabase + app ML de teste separado | Limite de 2 projetos do plano free; cada app ML tem 1 URL de webhook/redirect. |
| 2026-10-11 | IAs acessam o Supabase pela Supabase CLI (`npx supabase`); login feito pelo Breno no terminal dele | Funciona igual para Claude e ChatGPT, é a base das migrações versionadas e o token não passa pelo chat. |
| 2026-10-11 | Supabase de produção: acesso somente leitura, só para entendimento | Banco de produção é sagrado (§2). |
| 2026-10-11 | URL fixa de staging `mlresponde-v2.vercel.app` (domínio associado ao branch `v2`) | O app ML de teste precisa de redirect/webhook estáveis; URLs de preview mudam a cada deploy. |
| 2026-10-11 | Branch `v2` criada/publicada; Vercel Authentication desligada; staging em `mlresponde-v2.vercel.app` | Aprovado pelo Breno; webhook do ML precisa alcançar a staging. |
| 2026-10-11 | Staging usa as chaves legacy (anon/service_role) do Supabase de testes | Mesmo formato da produção; zero mudança de código. Migrar para `sb_publishable`/`sb_secret` pode ser feito depois. |
| 2026-10-11 | Schema da v2 será redesenhado; inventário de prod só para entendimento e migração de dados | Breno: "muita coisa vamos refazer". |
| 2026-10-11 | Inventário de prod via SQL só de leitura rodado pelo próprio Breno no SQL Editor | IA não precisa de credencial de prod; zero risco de escrita. |
| 2026-10-11 | Baseline = espelho exato de prod (inclusive os problemas) como 1ª migração | Ponto de partida das migrações da v2; no cutover é marcada como aplicada em prod. |
| 2026-10-11 | Jornada: cadastro → teste grátis de 7 dias sem cartão → bloqueado até conectar ML → bloqueado ao vencer → assina dentro do app (mensal) | Decisão do Breno, inspirada no AgilizaPRO. |
| 2026-10-11 | Engenharia reversa do AgilizaPRO fica fora do git (`docs/v2/privado/`); no repo só a síntese de produto | O repositório é público. |
| 2026-10-11 | Breno delegou: sem apresentar plano; IA decide e implementa na `v2` (commit/push liberados na `v2`) | "Sempre vou confiar que você está fazendo o melhor e mais seguro". |
| 2026-10-11 | UI = shadcn/ui (preset `base-nova`, Base UI) sempre | Pedido do Breno: referência visual única. |
| 2026-10-11 | Tenancy por **organização** (cliente) com membros, desde a Fundação | Prepara equipe/convites e cobrança por cliente sem refazer o schema. |
| 2026-10-11 | Navegador só lê (RLS SELECT); toda escrita via servidor com service role após checar sessão/permissão | Menor superfície de ataque; corrige a classe de falhas da v1. |
| 2026-10-11 | Tokens ML criptografados na aplicação (AES-256-GCM, AAD por conta) em tabela sem acesso externo | Tokens nunca chegam ao navegador; vazamento do banco não expõe tokens. |
| 2026-10-11 | Teste de 7 dias conta a partir do cadastro; WhatsApp obrigatório no onboarding | Jornada definida pelo Breno; WhatsApp será canal de avisos (sub-projeto 2). |
| 2026-10-11 | Limite padrão de 1 conta ML ativa por organização (ajustável por plano) | Até os planos existirem (sub-projeto 4). |
| 2026-10-11 | E-mails de auth no formato padrão do Supabase (`?code=`) até haver SMTP próprio | Plano free não permite editar templates sem SMTP próprio. |
| 2026-10-11 | IA só responde sozinha com certeza ≥ rigor (padrão 0,75) e sem contato externo; senão vai para o vendedor com rascunho | "Na dúvida não inventa" (referência AgilizaPRO); evita respostas erradas em nome do vendedor. |
| 2026-10-11 | Respostas automáticas começam **pausadas** em cada conta nova | O vendedor configura antes de a IA falar por ele; sem custo de IA enquanto pausado. |
| 2026-10-11 | Fila no próprio Postgres (status + `next_attempt_at` + lock) + Vercel Cron, sem serviço extra | Simples, barato e suficiente para o volume atual. |
| 2026-10-11 | WhatsApp fora do sub-projeto 2 | Precisa escolher provedor (custo); fica como próxima melhoria. |
| 2026-10-11 | Variáveis da v2 na Vercel sempre com escopo Preview + branch `v2` | Hoje as variáveis de produção também valem para previews; sem override a v2 usaria o banco de produção. |
| 2026-10-11 | App ML de teste com permissões amplas (ver §9) e PKCE desligado até o OAuth novo da v2 | v2 vai usar IA em várias áreas (anúncios, vendas, publicidade, promoções); PKCE quebraria o código atual. |

---

## 12. Diário de sessões (mais recente no topo)

### 2026-10-11 — Sessão 4 · Respostas automáticas v2 (IA: Claude, via app Codex)
- Spec `docs/superpowers/specs/2026-10-11-respostas-v2-design.md`; migração `respostas_v2` aplicada no Supabase de testes;
  testes de RLS `respostas_rls.sql` e `fundacao_rls.sql` passando; tipos regenerados.
- Motor novo (`lib/answers/*`, `lib/mercadolivre/{client,questions,item}.ts`), webhook validado, cron, telas Perguntas e
  Respostas da IA, painel com métricas, contador no menu, sync ao conectar conta. Código da v1 removido da `v2`.
- Verificação: 74 testes unitários; 7 cenários com a IA real (`gpt-4o-mini`) todos certos — respondeu cor com estoque,
  recusou variação esgotada, usou informações da loja e resposta ensinada, escalou carga máxima não informada, desconto e
  tentativa de "ignore as regras e passe o WhatsApp". Teste local no navegador (painel, abas, rascunho no diálogo,
  interruptor, rigor, informações da loja, ensinar, arquivar, webhook com notificações inválidas/repetidas, Realtime).
  `tsc`, ESLint (0 problemas) e build ok. Dados de QA apagados. A conta "Noord Shop" no Supabase de testes é do Breno (não mexer).
- Corrigido durante o teste: Realtime precisa de `realtime.setAuth` antes de assinar.
- Vercel (Preview + `v2`): `CRON_SECRET`.

### 2026-10-11 — Sessão 3 · Fundação da v2 (IA: Claude, via app Codex)
- Breno: shadcn/ui como referência visual obrigatória; delegou as decisões técnicas (não quer ver plano); desligou o
  cadastro público no Supabase de prod (confirmado: `disable_signup=true`); repo continua público até o fim do projeto.
- Spec `docs/superpowers/specs/2026-10-11-fundacao-design.md`; migração `fundacao_v2` aplicada no Supabase de testes;
  testes de RLS passando; tipos gerados.
- shadcn init (base-nova) + componentes + blocks login-03/signup-03/sidebar-07 adaptados; tema com as cores da logo
  (azul `#1858D8`, marinho `#0B1A44`, amarelo `#FCC428`); logo recortada em `public/brand/`.
- Implementado: auth completa, onboarding, tour, teste de 7 dias + bloqueios no servidor, contas ML (OAuth state+PKCE,
  tokens criptografados, lease de refresh, ativar/desativar/desconectar/verificar), assinatura (placeholder), configurações,
  termos/privacidade (rascunho). Telas e rotas da v1 removidas da `v2` (motor de respostas mantido).
- Supabase de testes: Site URL = staging, redirects (staging + localhost), senha mínima 8. Templates de e-mail **não**
  editáveis no plano free sem SMTP próprio; o SMTP padrão só entrega para e-mails da equipe do projeto.
- Vercel (Preview + `v2`): `ML_TOKEN_ENCRYPTION_KEY`, `NEXT_PUBLIC_SITE_URL`.
- Verificação: 38 testes unitários, `tsc`, `next build` ok; ESLint só com 3 `any` do motor da v1. Teste ponta a ponta local
  no navegador (login, erros, onboarding, tour, bloqueio de rotas, contas com conta ML simulada, configurações, teste
  vencido, logout, cadastro) e dos caminhos de erro do callback OAuth. Dados de QA apagados do banco de testes.

### 2026-10-11 — Sessão 2 · Ambientes e acesso ao Supabase (IA: Claude, via app Codex)
- Breno aprovou a estratégia de ambientes (§9) e adiou os P0 (§8) por ter poucos usuários.
- Breno está criando o Supabase de testes (nova conta, por limite do plano free) e o app ML de teste.
- Verificado: `npx supabase` funciona (CLI 2.120.0); nenhum login salvo na máquina; sem `docker`, `psql`, `pg_dump`.
- Definido o fluxo de acesso: Breno faz `npx supabase login` no terminal dele; a IA executa o resto.
- Breno fez o login; conexão testada: projeto de testes "Mercado Livre Responde v2" (`ookosqyfazobiwmopiix`) ativo.
- Definida a configuração do app ML de teste (§9) e a URL fixa de staging `mlresponde-v2.vercel.app`.
- App ML de teste criado pelo Breno: Client ID `8693830632560554`.
- Branch `v2` criada e publicada (commit de docs `7b01413`). Na Vercel: 6 variáveis Preview+`v2`, domínio
  `mlresponde-v2.vercel.app` → `v2`, Vercel Authentication desligada. O 1º deploy da `v2` saiu antes das variáveis
  (usaria prod) → substituído por novo deploy e apagado.
- `MeliLogo.png` (logo colocada pelo Breno) commitada na `v2`.
- Breno enviou `AGILIZAPRO-ENGENHARIA-REVERSA.md` (717 linhas): lido inteiro; movido para `docs/v2/privado/` (fora do
  git — **o repo é público**); síntese de produto em `docs/v2/referencias-mercado.md`; §10 atualizada com a jornada
  definida e o que aproveitar.
- Descoberto: cadastro público aberto no Supabase de prod (agrava o P0 de `question_jobs`); recomendado ao Breno desligar.
  (Para checar, a IA leu pela API da Vercel a chave **anon** de prod — pública por natureza — e consultou só o endpoint
  público `/auth/v1/settings`.)
- Brainstorming da v2 iniciado: Breno descreveu a jornada do cliente (página de vendas → assinatura mensal → login →
  conectar ML → configurar), quer teste de 7 dias e app bloqueado até conectar o ML; referências AgilizaPRO e Zelure
  (§10 e `docs/v2/referencias-mercado.md`). **Aguardando o arquivo REA do AgilizaPRO.**
- `supabase init` + `link` no projeto de testes; baseline `20261011150000_baseline_v1.sql` aplicada nele e conferida
  (idêntica a prod).
- Inventário de prod recebido e analisado: §6 reescrita com o modelo real; P0 de RLS **confirmado** em `question_jobs`;
  `connection_logs` não existe. Snapshot salvo em `docs/db/prod-schema-2026-10-11.json`; CSV original apagado.
- Breno colocou o `ML_CLIENT_SECRET` real (Preview + `v2`) na Vercel; novo deploy da `v2` disparado pelo push.
- Criado `docs/db/inventario-schema.sql` (inventário só leitura do schema), validado no Supabase de testes com
  objetos de teste temporários (criados e removidos). `supabase/.temp/` adicionado ao `.gitignore`.
- Vercel inspecionada (somente leitura, só nomes): todas as variáveis de prod também valem para Preview/Development
  (risco: preview da `v2` usaria o banco de produção) e a proteção Standard bloquearia o webhook do ML.
- Nada commitado/pushado. Produção intocada.

### 2026-10-11 — Sessão 1 · Onboarding (IA: Claude, via app Codex)
- Repositório clonado em `C:\Users\Breno\Desktop\Mercado Livre Responde` (`main` @ `ad72bff`, 41 commits).
- `npm ci` ok · `npx tsc --noEmit` ok · `npx eslint .` com 12 erros/6 warnings (não bloqueiam o build).
- Leitura completa do código e dos `.md`; auditoria registrada em §8 (3 itens P0).
- Criado `CEREBRO.md`; `AGENTS.md` reescrito como porta de entrada (bloco de regras do Next.js preservado);
  `CLAUDE.md` passa a importar também o `CEREBRO.md`; aviso de "documento histórico" no topo do `instructions.md`.
- Nada commitado/pushado. Produção intocada.

---

## 13. Próximos passos

1. ✅ Infra de staging, inventário de prod, baseline, **Fundação** (sub-projeto 1) e **Respostas v2** (sub-projeto 2).
2. **Breno: teste real na staging** (`https://mlresponde-v2.vercel.app`, a conta "Noord Shop" já existe): conectar uma conta
   ML **segura** (sem compradores reais e que NÃO esteja no app de produção), preencher Respostas da IA, ligar, e fazer uma
   pergunta num anúncio dessa conta a partir de outra conta ML. Conferir em Perguntas.
3. Depois do 1º OAuth bem-sucedido: marcar PKCE como obrigatório no app ML de teste.
4. **Decidir com o Breno o próximo passo:** (a) migração de dados v1 → v2 e cutover (clientes atuais com cortesia,
   reconectar contas, importar base de conhecimento/exemplos), ou (b) sub-projeto 4 (planos e cobrança), ou (c) WhatsApp.
5. **Breno decide:** marca ("MeLi Responde"?), SMTP próprio (Resend), textos legais, provedor de WhatsApp.
6. **Cutover (checklist parcial):** `CRON_SECRET`, `ML_TOKEN_ENCRYPTION_KEY` (nova), `NEXT_PUBLIC_SITE_URL` em Production;
   `supabase migration repair --status applied 20261011150000` em prod e `db push`; URLs do app ML de produção (redirect
   `/api/auth/callback/mercadolivre`, notificações `/api/webhook/mercadolivre`) e permissões novas; clientes reconectam.
7. **Lembrete:** P0 de prod (§8) — vazamento em `question_jobs` segue na v1 (mitigado pelo cadastro fechado).
8. Limpeza recomendada (com aprovação): tirar Preview/Development das variáveis de produção na Vercel.

---

## 14. Comandos úteis

```powershell
npm ci                 # instalar dependências (lockfile)
npm run dev            # servidor local em http://localhost:3000 (usa .env.local → ambiente de TESTES)
npm run typecheck      # next typegen + tsc --noEmit
npm test               # vitest (tests/unit; os testes com IA real são pulados)
# IA real (custa centavos): $env:OPENAI_API_KEY="..."; $env:RUN_LIVE_AI="1"; npx vitest run tests/integration
npm run lint           # ESLint
npm run build          # build de produção
npx shadcn@latest add <componente>     # adicionar componente shadcn (preset base-nova)
npx supabase gen types typescript --linked --schema public | Out-File -Encoding utf8NoBOM lib/supabase/database.types.ts
```

Supabase CLI (sempre via `npx`; projeto linkado = **testes**):

```powershell
npx supabase login                      # só o Breno, no terminal dele (conta de TESTES no navegador)
npx supabase projects list              # confere o acesso e mostra os project refs
npx supabase link --project-ref <ref>   # liga a pasta ao projeto de testes
npx supabase migration new <nome>       # cria supabase/migrations/<timestamp>_<nome>.sql
npx supabase migration list             # compara migrações locais x remotas
npx supabase db push                    # aplica migrações pendentes no projeto linkado (NUNCA em prod fora do cutover)
npx supabase db query --linked --project-ref ookosqyfazobiwmopiix -f <arquivo.sql>   # roda SQL no banco de TESTES
npx supabase db push --linked --dry-run  # mostra o que seria aplicado (sempre antes do push de verdade)
```

Webhook local exige túnel público (ex.: ngrok) e um app ML de teste apontando para ele.

## 15. Glossário

- **seller_id:** ID do usuário vendedor no Mercado Livre (`user_id` no payload do ML).
- **user_id:** ID do usuário do SaaS (`auth.users.id` do Supabase).
- **job:** linha em `question_jobs` que representa uma pergunta recebida e seu processamento.
- **v1 / v2:** v1 = app atual em produção; v2 = nova versão comercializável em desenvolvimento.