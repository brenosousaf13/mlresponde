# 🧠 CÉREBRO DO PROJETO — Meli Fácil (Mercado Livre Responde)

> **Fonte única de verdade do projeto.** Qualquer IA (Claude, ChatGPT/Codex ou outra) deve ler este arquivo
> inteiro antes de trabalhar e atualizá-lo ao terminar. Se algo aqui divergir do código, o código vence —
> e este arquivo deve ser corrigido na mesma sessão.

Última atualização: **2026-10-11** (Sessão 2 — ambientes, Supabase de testes, app ML de teste e staging na Vercel)

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
- v2: branch **`v2`** criada e publicada (só documentação até agora; código do app idêntico à `main`).
  Staging no ar em `https://mlresponde-v2.vercel.app` apontando para o **Supabase de testes** e o **app ML de teste**
  (§9). Banco de testes ainda **vazio** (falta a baseline do schema de prod). Escopo da v2 a definir (§10).
- P0 de segurança/toggle (§8) **adiados** por decisão do Breno — revisitar antes de abrir para novos clientes.

---

## 2. Regras de ouro (produção está no ar!)

1. **`main` = produção.** Qualquer push/merge na `main` faz deploy automático para os clientes.
   Não fazer push/merge na `main` sem aprovação explícita do Breno. Commits e branches só quando o Breno pedir.
2. **Banco de produção é sagrado.** Nada de `DROP`, `RENAME`, troca de tipo, `NOT NULL` sem default, ou
   apagar dados direto em prod. Migrações versionadas e **aditivas/retrocompatíveis** (padrão expand → migrate → contract),
   para que a v1 continue funcionando até o cutover.
3. **Segredos nunca no repositório** (`.env*` já está no `.gitignore`).
4. **Webhook do Mercado Livre:** cada app do ML tem **uma única** URL de notificações e de redirect.
   Staging precisa de um **app ML separado** (e conta de teste), senão a v2 rouba/duplica webhooks da produção.
5. Perguntas reais de clientes finais são respondidas automaticamente: qualquer bug no fluxo
   webhook → IA → resposta afeta vendas de verdade. Testar sempre em staging antes.
6. **Acesso das IAs ao Supabase:** a CLI fica logada na conta de **testes**. O Supabase de **produção** é acessado
   apenas para leitura/entendimento — nada de `db push`, `migration repair` ou SQL de escrita em prod fora do cutover
   aprovado pelo Breno.
7. **Vercel:** a CLI está logada na conta do Breno, que tem **vários outros projetos** (outros negócios). Só mexer no
   projeto `mlresponde`, e nele **nunca** alterar variáveis/configurações de Production sem aprovação explícita.
   Variáveis da v2 sempre com escopo **Preview + branch `v2`**.

---

## 3. Stack (v1)

| Camada | Tecnologia | Observações |
|---|---|---|
| Framework | **Next.js 16.2.3** (App Router) | Breaking changes vs. versões antigas: `middleware.ts` virou **`proxy.ts`**; `after()` é nativo de `next/server`. Docs locais em `node_modules/next/dist/docs/`. |
| UI | React 19.2.4 + Tailwind CSS v4 | Sem biblioteca de componentes; HTML + Tailwind puro, SVGs inline. Suporta dark mode. |
| Linguagem | TypeScript 5 (`strict`) | Alias `@/*` → raiz. |
| Auth | Supabase Auth (e-mail/senha) | Usuários criados **manualmente** no painel do Supabase (não há cadastro/recuperação de senha). |
| Banco | Supabase Postgres + Realtime | Cliente `@supabase/ssr` 0.10 / `supabase-js` 2.103. Server usa **service role** + filtros manuais por `user_id`. |
| IA | OpenAI SDK v4, modelo **`gpt-4o-mini`** | Migrado de Claude a pedido do cliente (2026-04-14). `temperature 0.3`, `max_tokens 400`. |
| Hospedagem | Vercel | `maxDuration = 60` no webhook. Plano da Vercel: **desconhecido** (confirmar). |
| Integração | API do Mercado Livre (OAuth2 + webhooks `questions`) | Domínio de auth `auth.mercadolivre.com.br` (MLB). |

Ambiente local verificado: Node v24.18.0, npm 11.16.0, Windows + PowerShell 7.

Dependências sobrando: `@anthropic-ai/sdk` (não usada), `jimp` e `dotenv` (só scripts soltos).

---

## 4. Mapa do código

```
proxy.ts                         # "middleware" do Next 16: renova sessão Supabase e protege rotas
                                 # (públicas: /login e /api/webhook*)
app/
  layout.tsx                     # layout raiz (metadata ainda "Create Next App", lang="en")
  globals.css                    # Tailwind v4
  login/page.tsx, actions.ts     # login e-mail/senha + logout (server actions)
  (dashboard)/
    layout.tsx                   # header Meli Fácil + nav (Visão Geral / Treinamento / Configurações)
    page.tsx                     # carrega 20 últimos question_jobs dos seller_ids do usuário
    live-questions.tsx           # client: lista + Supabase Realtime (filtro seller_id=in.(...))
    settings/
      page.tsx                   # conexão ML, toggle automação, base de conhecimento
      actions.ts                 # saveKnowledgeBase, toggleAutoReply, generateKnowledgeFromHistory (IA)
      auto-reply-toggle.tsx      # switch otimista do auto_reply_enabled
      knowledge-form.tsx         # textarea + botão "Extrair Regras da IA Magicamente"
    training/
      page.tsx                   # lista paginada (10/pág) de training_examples
      actions.ts                 # syncHistoricalQuestions: puxa 200 perguntas respondidas do ML
      sync-button.tsx
  api/
    auth/connect-ml/route.ts     # redireciona para OAuth do ML
    auth/callback/mercadolivre/route.ts  # troca code→token, upsert ml_credentials, loga em connection_logs
    webhook/mercadolivre/route.ts        # recebe notificação, cria job, roda workflow via after()
    process/route.ts             # ⚠️ LEGADO, ninguém chama (ver §8)
lib/
  supabase/client.ts             # browser client (anon)
  supabase/server.ts             # createClient (cookies, anon) + createAdminClient (service role)
  supabase/types.ts              # tipos do schema ORIGINAL (desatualizados, não aplicados)
  mercadolivre/auth.ts           # getAuthorizationUrl, exchangeCodeForToken, getValidToken (refresh 5 min antes)
  mercadolivre/client.ts         # mlFetch: injeta Bearer token e padroniza erros
  mercadolivre/questions.ts      # fetchQuestion, fetchItem, postAnswer, fetch(Multiple)AnsweredQuestions
  mercadolivre/workflow.ts       # processQuestionWorkflow — o CORE do produto
  ai/responder.ts                # generateAnswer: monta prompt (regras + exemplos + produto) e chama OpenAI
public/logo.png                  # logo Meli Fácil
instructions.md                  # guia HISTÓRICO usado para construir a v1 (desatualizado)
scratch.ts, test_after.js,
extract_colors.js/.py            # scripts soltos de debug (não fazem parte do app)
.agents/skills/                  # skills de agentes (supabase-postgres-best-practices,
                                 # vercel-react-best-practices, frontend-design, vercel-react-native-skills)
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

Obsoletas (citadas no `instructions.md`, não usadas): `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_APP_URL`.

**Situação na Vercel (verificada em 2026-10-11, só nomes):** as 7 variáveis acima existem no projeto `mlresponde` e
**todas** valem para Production **e** Preview **e** Development, com os valores de produção. ⚠️ Ou seja: **qualquer
preview (inclusive a branch `v2`) usaria o Supabase e o app ML de PRODUÇÃO**. Antes de subir código da v2, criar
variáveis específicas de **Preview + branch `v2`** (sobrepõem as gerais). Limpeza recomendada (pedir aprovação):
tirar Preview/Development das variáveis de produção. `OPENAI_API_KEY` pode ser reaproveitada na v2 por enquanto.

Projetos Supabase novos podem fornecer chaves no formato novo: `sb_publishable_...` (substitui a anon) e
`sb_secret_...` (substitui a service_role). Entram nas mesmas variáveis acima, sem mudança de código.

Não existe `.env.example`. Atenção: o `.gitignore` ignora `.env*`, então ao criar um `.env.example` será preciso
adicionar a exceção `!.env.example`.

---

## 6. Modelo de dados (inferido do código — **CONFIRMAR no Supabase**)

Não há migrações no repositório. O SQL original está no `instructions.md` (Fase 2); colunas e tabelas posteriores
foram criadas direto no painel do Supabase e **não estão versionadas**.

**Modelo de tenancy:** `auth.users` (usuário do SaaS) 1 → N `ml_credentials` (conta ML, identificada por `seller_id`).
As demais tabelas se ligam ao tenant por `seller_id` (e algumas também por `user_id`).

| Tabela | Colunas (conhecidas) | Notas |
|---|---|---|
| `question_jobs` | id, created_at, updated_at, **question_id (unique)**, item_id, seller_id, question_text, status, ai_response, error_message, item_title, item_url | Sem `user_id`. Realtime ativado. `status`: `pending`, `processing`, `done`, `error` (+ `manual` na rota legada). A unique em `question_id` é o mecanismo de deduplicação de webhooks. |
| `knowledge_base` | id, created_at, updated_at, **seller_id (unique)**, content, + `user_id` | Regras da loja (texto livre). |
| `ml_credentials` | id, created_at, updated_at, **seller_id (unique)**, access_token, refresh_token, expires_at, + `user_id`, + `auto_reply_enabled` (bool) | Tokens em **texto puro**. |
| `training_examples` | id, created_at, updated_at, user_id, seller_id, **question_id (unique)**, item_id, question_text, answer_text | Criada fora do repo. Few-shot para a IA. |
| `connection_logs` | user_id, error_type, error_details (json), url_accessed (+ id/created_at?) | Criada fora do repo. Logs de falha do OAuth. |

**RLS original:** `question_jobs` e `knowledge_base` com policy "authenticated → tudo" (`using (auth.role() = 'authenticated')`);
`ml_credentials` com `using (false)`. **Estado real atual das policies: DESCONHECIDO** — verificar (ver §8, P0).

---

## 7. Fluxos principais

### 7.1 Login
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

### 🔴 P0
> ⏸️ **Adiados por decisão do Breno (2026-10-11):** hoje são poucos usuários. **Lembrar o Breno** e resolver antes de
> abrir o app para novos clientes (no máximo junto com o cutover da v2).

- **Toggle "Automação de Respostas" não funciona em produção.** A checagem de `auto_reply_enabled` foi adicionada
  (commit `d50544e`) só em `app/api/process/route.ts`, rota legada que ninguém chama desde `4665c5c`. O webhook usa
  `lib/mercadolivre/workflow.ts`, que **sempre responde**. Cliente que "pausa o robô" continua tendo respostas automáticas.
- **Isolamento multi-tenant depende de RLS desconhecido.** Se as policies ainda forem "authenticated → tudo",
  qualquer cliente logado consegue ler `question_jobs`/`knowledge_base` de outras lojas usando a chave anon
  (o filtro do Realtime é definido pelo browser). Verificar policies no Supabase.
- **OAuth sem `state` + upsert por `seller_id` sobrescreve `user_id`.** Um usuário pode "tomar" uma conta ML já
  vinculada a outro usuário ao conectá-la; também há risco de CSRF no fluxo de conexão.

### 🟠 P1
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
- Rota legada `app/api/process/route.ts` (usa coluna inexistente `response_generated`) — remover.
- Sem migrações versionadas, testes, CI, `.env.example`; README é o boilerplate do create-next-app;
  `instructions.md` desatualizado.
- `app/layout.tsx` com metadata "Create Next App" e `lang="en"`.
- `lib/supabase/types.ts` desatualizado e não aplicado aos clientes.
- Lint: `npx eslint .` → 12 erros / 6 warnings (`any`, `require` em scripts soltos). `npx tsc --noEmit` passa.
- Arquivos soltos na raiz: `scratch.ts`, `test_after.js`, `extract_colors.js/.py`, `ML Automatizado.code-workspace`.
- Dependências sem uso: `@anthropic-ai/sdk`, `jimp`.

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
  (**placeholder `PENDENTE_BRENO_PREENCHER`** até o Breno colocar o valor real). `OPENAI_API_KEY` é herdada da geral.
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

**Acesso das IAs ao Supabase (Supabase CLI)**
- CLI usada via `npx supabase` (v2.120.0 testada em 2026-10-11; sem instalação global).
- Login: o **Breno** roda `npx supabase login` no terminal dele, com o navegador logado na conta de **testes**.
  O token fica no Gerenciador de Credenciais do Windows: não passa pelo chat nem vai para o repositório.
  As IAs rodam os demais comandos (`link`, `migration`, `db push`) na mesma máquina/usuário.
- O token da CLI vale para **todos os projetos da conta logada** → por isso a CLI fica na conta de testes.
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

## 10. Roadmap v2 (a definir com o Breno)

Ainda não decidido. Temas levantados até agora:
- Autenticação "de verdade": cadastro, recuperação de senha, convites/time, possivelmente login social.
- Segurança multi-tenant (RLS correto, OAuth com `state`, tokens criptografados, webhook validado).
- Funcionalidades novas (a levantar com o Breno e os clientes).
- Comercialização: planos, cobrança, onboarding self-service, painel admin.
- Escalabilidade: fila/reprocessamento de jobs, observabilidade, métricas.

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
| 2026-10-11 | Variáveis da v2 na Vercel sempre com escopo Preview + branch `v2` | Hoje as variáveis de produção também valem para previews; sem override a v2 usaria o banco de produção. |
| 2026-10-11 | App ML de teste com permissões amplas (ver §9) e PKCE desligado até o OAuth novo da v2 | v2 vai usar IA em várias áreas (anúncios, vendas, publicidade, promoções); PKCE quebraria o código atual. |

---

## 12. Diário de sessões (mais recente no topo)

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
- `MeliLogo.png` apareceu na raiz sem ser criado pela IA → **não** commitado; perguntar ao Breno.
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

1. ✅ Supabase de testes criado e login da CLI feito/testado (2026-10-11).
2. ✅ App ML de teste criado (Client ID `8693830632560554`).
3. ✅ Branch `v2` + staging na Vercel (`mlresponde-v2.vercel.app`, variáveis Preview+`v2`, proteção desligada).
4. **Breno:** trocar o valor de `ML_CLIENT_SECRET` (Preview, branch `v2`, hoje `PENDENTE_BRENO_PREENCHER`) pelo
   Client Secret do app ML de teste no painel da Vercel e avisar → IA faz um redeploy da `v2`.
5. **Breno:** liberar acesso **somente leitura** ao Supabase de prod (sem acesso às colunas de tokens do ML) →
   IA captura o schema real como migração baseline em `supabase/migrations/`, confirma RLS/policies (atualizar §6)
   e aplica no Supabase de testes (`supabase init` + `supabase link --project-ref ookosqyfazobiwmopiix`).
   Sem isso o banco de testes fica vazio e a v2 não roda.
6. Depois da baseline: criar usuário de teste no Supabase de testes, conectar uma conta ML de teste e validar o fluxo
   pergunta → resposta na staging.
7. **Definir o escopo da v2** (§10) junto com o Breno.
8. **Lembrete:** revisitar os P0 (§8) antes de abrir o app para novos clientes.
9. Limpeza recomendada (com aprovação): tirar Preview/Development das variáveis de produção na Vercel.
10. Perguntar ao Breno sobre o `MeliLogo.png` não versionado na raiz.

---

## 14. Comandos úteis

```powershell
npm ci                 # instalar dependências (lockfile)
npm run dev            # servidor local em http://localhost:3000 (precisa de .env.local)
npx tsc --noEmit       # checagem de tipos
npm run lint           # ESLint
npm run build          # build de produção
```

Supabase CLI (sempre via `npx`; projeto linkado = **testes**):

```powershell
npx supabase login                      # só o Breno, no terminal dele (conta de TESTES no navegador)
npx supabase projects list              # confere o acesso e mostra os project refs
npx supabase link --project-ref <ref>   # liga a pasta ao projeto de testes
npx supabase migration new <nome>       # cria supabase/migrations/<timestamp>_<nome>.sql
npx supabase migration list             # compara migrações locais x remotas
npx supabase db push                    # aplica migrações pendentes no projeto linkado (NUNCA em prod fora do cutover)
```

Webhook local exige túnel público (ex.: ngrok) e um app ML de teste apontando para ele.

## 15. Glossário

- **seller_id:** ID do usuário vendedor no Mercado Livre (`user_id` no payload do ML).
- **user_id:** ID do usuário do SaaS (`auth.users.id` do Supabase).
- **job:** linha em `question_jobs` que representa uma pergunta recebida e seu processamento.
- **v1 / v2:** v1 = app atual em produção; v2 = nova versão comercializável em desenvolvimento.