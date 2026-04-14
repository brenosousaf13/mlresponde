# ML AI Responder — Guia de desenvolvimento para agente

## Como usar este documento

Você é um agente de desenvolvimento. Leia este documento inteiro antes de começar.

**Regra principal:** desenvolva uma fase por vez. Ao terminar cada fase, pare completamente, mostre o resumo do que foi feito e aguarde a confirmação do usuário antes de avançar para a próxima. Nunca pule fases. Nunca avance sem confirmação explícita.

Quando o documento pedir uma ação do usuário (marcada com 🙋), pare e informe o usuário o que ele precisa fazer manualmente. Só continue depois que ele confirmar que concluiu.

---

## Visão geral do projeto

Uma dashboard web que automatiza respostas a perguntas de produtos no Mercado Livre usando inteligência artificial.

Quando um comprador faz uma pergunta em um anúncio, o sistema recebe a notificação, busca os dados do produto, consulta uma base de conhecimento configurada pelo dono da loja, gera uma resposta personalizada com Claude AI e posta automaticamente no Mercado Livre. Tudo é registrado e exibido em tempo real na dashboard.

---

## Stack obrigatória

- Next.js 14 com App Router
- TypeScript
- Tailwind CSS
- Supabase (banco de dados, autenticação e realtime)
- Anthropic Claude API (modelo claude-sonnet-4-20250514)
- Vercel (deploy)

Não substitua nenhum item da stack. Se encontrar um problema com alguma dessas tecnologias, informe o usuário antes de propor qualquer alternativa.

---

## Fases de desenvolvimento

---

### FASE 1 — Setup do projeto

**Objetivo:** projeto Next.js funcionando localmente com Tailwind e TypeScript configurados.

**O que fazer:**
- Criar o projeto com `create-next-app` usando TypeScript e Tailwind
- Configurar o `tsconfig.json` com path alias `@/` apontando para a raiz
- Apagar o conteúdo padrão do `app/page.tsx` e substituir por uma página simples com o texto "ML AI Responder — em construção"
- Instalar as dependências: `@supabase/supabase-js`, `@supabase/ssr`, `@anthropic-ai/sdk`
- Criar o arquivo `.env.local` na raiz com as variáveis abaixo (vazias por enquanto):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
ML_CLIENT_ID=
ML_CLIENT_SECRET=
ML_REDIRECT_URI=
NEXT_PUBLIC_APP_URL=
```

**Checkpoint — aguarde confirmação antes de continuar:**

Informe o usuário:
1. Que o projeto foi criado
2. Que ele deve rodar `npm run dev` e abrir `http://localhost:3000`
3. Que ele deve confirmar que vê a página com o texto "ML AI Responder — em construção"

Só avance para a Fase 2 após confirmação.

---

### FASE 2 — Configuração do Supabase

**Objetivo:** banco de dados criado e cliente Supabase funcionando no projeto.

**Antes de começar, informe o usuário:**

🙋 **Ação necessária — criar projeto no Supabase:**
1. Acesse [supabase.com](https://supabase.com) e crie um novo projeto
2. Após a criação, vá em **Project Settings → API**
3. Copie os valores de:
   - `Project URL` → cole em `NEXT_PUBLIC_SUPABASE_URL` no `.env.local`
   - `anon public` → cole em `NEXT_PUBLIC_SUPABASE_ANON_KEY` no `.env.local`
   - `service_role` → cole em `SUPABASE_SERVICE_ROLE_KEY` no `.env.local`
4. Confirme quando terminar

**O que fazer após confirmação do usuário:**
- Criar o arquivo `lib/supabase/client.ts` com o cliente para uso no browser (usa a chave `anon`)
- Criar o arquivo `lib/supabase/server.ts` com dois clientes: um para Server Components (usa a chave `anon` com cookies) e um com a `service_role` para uso exclusivo em API Routes do backend
- Criar a pasta `lib/supabase/` com um arquivo `types.ts` contendo os tipos TypeScript das tabelas (descritos abaixo)

**Tabelas a criar no Supabase:**

Informe o usuário que ele deve executar o SQL abaixo no **SQL Editor** do Supabase:

```sql
-- Tabela de jobs de perguntas
create table question_jobs (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  question_id   text not null unique,
  item_id       text not null,
  seller_id     text not null,
  question_text text not null,
  status        text not null default 'pending',
  ai_response   text,
  error_message text,
  item_title    text,
  item_url      text
);

create index on question_jobs (status);
create index on question_jobs (created_at desc);

alter table question_jobs enable row level security;

create policy "Autenticados podem ver tudo"
  on question_jobs for all
  using (auth.role() = 'authenticated');

-- Tabela de base de conhecimento
create table knowledge_base (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  seller_id  text not null unique,
  content    text not null
);

alter table knowledge_base enable row level security;

create policy "Autenticados podem ver tudo"
  on knowledge_base for all
  using (auth.role() = 'authenticated');

-- Tabela de credenciais do ML (acesso apenas pelo backend)
create table ml_credentials (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  seller_id     text not null unique,
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz not null
);

alter table ml_credentials enable row level security;

create policy "Sem acesso pelo browser"
  on ml_credentials for all
  using (false);

-- Ativar Realtime na tabela de jobs
alter publication supabase_realtime add table question_jobs;
```

**Checkpoint — aguarde confirmação antes de continuar:**

Informe o usuário:
1. Que os clientes do Supabase foram criados
2. Que ele deve executar o SQL acima no Supabase
3. Que ele deve confirmar que as tabelas foram criadas com sucesso (pode verificar na aba **Table Editor**)

Só avance para a Fase 3 após confirmação.

---

### FASE 3 — Autenticação da dashboard

**Objetivo:** tela de login funcionando. Rotas protegidas redirecionam para login se não autenticado.

**O que fazer:**
- Criar a tela de login em `app/login/page.tsx` com formulário de e-mail e senha usando Supabase Auth
- Criar o middleware `middleware.ts` na raiz do projeto que protege todas as rotas exceto `/login` e `/api/webhook`
- Criar o layout autenticado em `app/(dashboard)/layout.tsx` com um header simples contendo o nome do sistema e um botão de logout
- Criar a página principal da dashboard em `app/(dashboard)/page.tsx` com apenas um título "Dashboard" por enquanto (será preenchida na Fase 6)

**Antes de testar, informe o usuário:**

🙋 **Ação necessária — criar usuário no Supabase:**
1. No painel do Supabase, vá em **Authentication → Users**
2. Clique em **Add user → Create new user**
3. Cadastre um e-mail e senha para usar no login
4. Confirme quando terminar

**Checkpoint — aguarde confirmação antes de continuar:**

Informe o usuário que ele deve:
1. Acessar `http://localhost:3000` — deve ser redirecionado para `/login`
2. Fazer login com o usuário criado — deve ser redirecionado para a dashboard
3. Clicar em logout — deve voltar para `/login`
4. Confirmar que o fluxo funcionou

Só avance para a Fase 4 após confirmação.

---

### FASE 4 — Integração com o Mercado Livre

**Objetivo:** fluxo OAuth do ML funcionando e tokens salvos no Supabase.

**Contexto para o agente:**

O Mercado Livre usa OAuth 2.0. O fluxo é:
1. Usuário clica em "Conectar conta ML" na dashboard
2. É redirecionado para a página de autorização do ML
3. Após autorizar, o ML redireciona de volta para `/api/auth/callback/mercadolivre` com um `code`
4. O backend troca o `code` pelo `access_token` e `refresh_token`
5. Os tokens são salvos na tabela `ml_credentials`
6. O `access_token` expira a cada 6 horas e deve ser renovado automaticamente com o `refresh_token`

**Antes de começar, informe o usuário:**

🙋 **Ação necessária — criar aplicação no Mercado Livre:**
1. Acesse [developers.mercadolivre.com.br](https://developers.mercadolivre.com.br)
2. Faça login e vá em **Minhas aplicações → Criar aplicação**
3. Preencha o nome da aplicação
4. Em **URI de redirecionamento**, coloque: `http://localhost:3000/api/auth/callback/mercadolivre`
5. Em **Tópicos de notificação**, marque: **Questions**
6. Salve e copie o `Client ID` e o `Client Secret`
7. Cole `Client ID` em `ML_CLIENT_ID` no `.env.local`
8. Cole `Client Secret` em `ML_CLIENT_SECRET` no `.env.local`
9. Cole `http://localhost:3000/api/auth/callback/mercadolivre` em `ML_REDIRECT_URI` no `.env.local`
10. Confirme quando terminar

**O que fazer após confirmação do usuário:**
- Criar `lib/mercadolivre/auth.ts` com as funções:
  - `getAuthorizationUrl()` — retorna a URL de autorização do ML
  - `exchangeCodeForToken(code)` — troca o code pelo token
  - `getValidToken(sellerId)` — busca o token no Supabase, renova se expirado, retorna o `access_token` válido
- Criar a API Route `app/api/auth/callback/mercadolivre/route.ts` que recebe o `code`, troca pelo token e salva no Supabase
- Criar a API Route `app/api/auth/connect-ml/route.ts` que redireciona para a URL de autorização do ML
- Adicionar na página de settings `app/(dashboard)/settings/page.tsx` um botão "Conectar conta do Mercado Livre" que chama `/api/auth/connect-ml`
- Após conectar com sucesso, a página de settings deve mostrar "Conta ML conectada ✓" com o `seller_id`

**Checkpoint — aguarde confirmação antes de continuar:**

Informe o usuário que ele deve:
1. Acessar as configurações na dashboard
2. Clicar em "Conectar conta do Mercado Livre"
3. Autorizar o acesso na página do ML
4. Confirmar que voltou para a dashboard com "Conta ML conectada ✓"
5. Verificar no Supabase (tabela `ml_credentials`) se o registro foi criado

Só avance para a Fase 5 após confirmação.

---

### FASE 5 — Webhook e processamento automático

**Objetivo:** sistema recebendo perguntas do ML, processando com IA e postando respostas automaticamente.

**Contexto para o agente:**

O fluxo tem duas API Routes separadas para evitar timeout:

**Route 1 — Webhook (`/api/webhook/mercadolivre`):**
- Recebe o POST do ML
- Valida que o tópico é `questions`
- Salva um job na tabela `question_jobs` com status `pending`
- Dispara o processamento de forma assíncrona (fetch sem await para `/api/process`)
- Retorna 200 imediatamente

**Route 2 — Processor (`/api/process`):**
- Recebe `questionId` e `sellerId`
- Atualiza o job para status `processing`
- Busca os detalhes da pergunta no ML: `GET /questions/{id}?api_version=4`
- Busca os detalhes do anúncio no ML: `GET /items/{item_id}`
- Busca a base de conhecimento do `seller_id` no Supabase
- Monta o prompt e chama Claude API
- Posta a resposta no ML: `POST /answers` com `{ question_id, text }`
- Atualiza o job para status `done` com a resposta gerada
- Em caso de qualquer erro, atualiza o job para status `error` com a mensagem de erro

**O que fazer:**
- Criar `lib/mercadolivre/questions.ts` com as funções `fetchQuestion`, `fetchItem` e `postAnswer`
- Criar `lib/ai/responder.ts` com a função `generateAnswer` que monta o prompt e chama a Claude API
- O system prompt do Claude deve instruí-lo a responder como atendente de loja no Mercado Livre, em português, de forma objetiva, usando apenas as informações fornecidas
- Criar `app/api/webhook/mercadolivre/route.ts`
- Criar `app/api/process/route.ts`
- Criar `lib/mercadolivre/client.ts` com uma função auxiliar `mlFetch` que já injeta o header `Authorization` automaticamente

**Antes de testar, informe o usuário:**

🙋 **Ações necessárias para testar localmente:**
1. Instale o [ngrok](https://ngrok.com) para expor o localhost publicamente
2. Rode `ngrok http 3000` e copie a URL gerada (ex: `https://abc123.ngrok.io`)
3. Cole a URL em `NEXT_PUBLIC_APP_URL` no `.env.local` (ex: `https://abc123.ngrok.io`)
4. No painel do Mercado Livre (sua aplicação), atualize a URL de notificações para `https://abc123.ngrok.io/api/webhook/mercadolivre`
5. Cole sua `ANTHROPIC_API_KEY` no `.env.local`
6. Reinicie o servidor de desenvolvimento
7. Confirme quando terminar

**Checkpoint — aguarde confirmação antes de continuar:**

Informe o usuário que ele deve:
1. Acessar um de seus anúncios no Mercado Livre
2. Fazer uma pergunta de teste (pode usar outra conta ou pedir para alguém)
3. Aguardar alguns segundos
4. Verificar na tabela `question_jobs` no Supabase se o job apareceu com status `done`
5. Verificar na página do anúncio no ML se a resposta foi postada
6. Confirmar que funcionou

Só avance para a Fase 6 após confirmação.

---

### FASE 6 — Dashboard completa

**Objetivo:** interface completa com lista de perguntas em tempo real e configurações.

**O que fazer:**

**Página principal (`app/(dashboard)/page.tsx`):**
- Listar todos os `question_jobs` ordenados por `created_at` decrescente
- Cada item deve mostrar: título do produto, texto da pergunta, resposta da IA (se houver), status com badge colorido e data/hora
- Usar Supabase Realtime para atualizar a lista automaticamente quando um novo job chegar ou um job existente mudar de status
- Status com cores: `pending` = amarelo, `processing` = azul, `done` = verde, `error` = vermelho

**Página de configurações (`app/(dashboard)/settings/page.tsx`):**
- Seção de conexão com o Mercado Livre (já feita na Fase 4)
- Seção de base de conhecimento: textarea onde o usuário escreve informações sobre seus produtos, políticas de entrega, perguntas frequentes, etc. Deve ter botão "Salvar" que persiste na tabela `knowledge_base` vinculando ao `seller_id`
- As informações salvas aqui serão usadas pelo Claude para personalizar as respostas

**Checkpoint — aguarde confirmação antes de continuar:**

Informe o usuário que ele deve:
1. Verificar se a lista de perguntas está aparecendo na dashboard
2. Fazer uma nova pergunta de teste no ML e verificar se ela aparece na dashboard em tempo real sem precisar recarregar a página
3. Acessar as configurações, escrever algo na base de conhecimento e salvar
4. Fazer outra pergunta de teste e verificar se a resposta gerada pelo Claude considera o conteúdo da base de conhecimento
5. Confirmar que tudo funcionou

Só avance para a Fase 7 após confirmação.

---

### FASE 7 — Deploy na Vercel

**Objetivo:** aplicação rodando em produção na Vercel com webhook apontando para o domínio definitivo.

**Antes de começar, informe o usuário:**

🙋 **Ação necessária — fazer deploy na Vercel:**
1. Suba o projeto para um repositório no GitHub
2. Acesse [vercel.com](https://vercel.com) e importe o repositório
3. Na etapa de configuração, adicione todas as variáveis de ambiente do `.env.local` (exceto `NEXT_PUBLIC_APP_URL` — será configurada no próximo passo)
4. Faça o deploy
5. Copie a URL gerada pela Vercel (ex: `https://ml-ai-responder.vercel.app`)
6. Adicione a variável `NEXT_PUBLIC_APP_URL` na Vercel com essa URL
7. Faça um redeploy para aplicar a variável
8. Confirme quando terminar

**O que fazer após confirmação:**
- Não há código novo nesta fase
- Apenas informar o usuário sobre as configurações finais abaixo

**Informe o usuário sobre as configurações finais:**

🙋 **Configurações finais no Mercado Livre:**
1. Acesse sua aplicação no painel de desenvolvedor do ML
2. Atualize a **URI de redirecionamento** para: `https://seu-dominio.vercel.app/api/auth/callback/mercadolivre`
3. Atualize a **URL de notificações** para: `https://seu-dominio.vercel.app/api/webhook/mercadolivre`
4. Salve
5. Na dashboard em produção, desconecte e reconecte a conta do ML para gerar novos tokens com o domínio correto
6. Confirme quando terminar

**Checkpoint final:**

Informe o usuário que ele deve:
1. Acessar a dashboard em produção e fazer login
2. Fazer uma pergunta de teste em um anúncio real
3. Confirmar que a resposta foi postada automaticamente no ML
4. Confirmar que o job apareceu na dashboard em produção

---

## Regras gerais para o agente

- Nunca avance de fase sem confirmação explícita do usuário
- Se encontrar um erro que não consegue resolver, descreva o problema claramente e peça orientação
- Nunca apague código de fases anteriores ao implementar uma nova fase
- Se uma fase depender de uma credencial que ainda não foi preenchida no `.env.local`, avise o usuário antes de tentar executar qualquer código que dependa dela
- Mantenha os arquivos organizados conforme a estrutura de pastas definida — não crie arquivos em locais diferentes dos especificados
- Prefira soluções simples. Se houver duas formas de implementar algo, escolha a mais direta e legível