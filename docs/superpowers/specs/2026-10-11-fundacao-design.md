# Sub-projeto 1 — Fundação da v2 (design)

- **Data:** 2026-10-11 · **Status:** aprovado para execução (o Breno delegou as decisões técnicas à IA em 2026-10-11)
- **Contexto:** `CEREBRO.md` §10 (jornada do cliente) e `docs/v2/referencias-mercado.md` (AgilizaPRO).

## 1. Objetivo

Dar à v2 a base de um SaaS multi-cliente: cadastro e login de verdade, onboarding, teste grátis de 7 dias com
bloqueios **aplicados no servidor**, várias contas do Mercado Livre por cliente com OAuth seguro e tokens
criptografados, e um schema multi-tenant com RLS correta. Isso resolve os P0 da v1 (§8 do CEREBRO) no código novo.

**Fora do escopo (outros sub-projetos):** responder perguntas com a IA nova (2), módulos de IA/gestão (3),
cobrança/planos/admin (4), login com Google, equipe/convites, pedido de transferência de conta ML, migração dos
dados de prod (feita no cutover, com spec própria).

## 2. Jornada implementada

1. `/cadastro`: nome, e-mail, senha e aceite dos Termos/Privacidade (obrigatório, gravado com data e versão).
2. E-mail de confirmação (template PT-BR) → `/auth/confirm` valida o token → `/onboarding`.
3. `/onboarding`: nome da loja/empresa + WhatsApp (obrigatório, formato BR; vira canal de avisos no sub-projeto 2).
4. Entra no app em **teste de 7 dias** (contado a partir do cadastro), com tour de boas-vindas em 4 passos.
5. Sem conta ML conectada: só **Contas do Mercado Livre**, **Assinatura** e **Configurações** ficam acessíveis;
   o resto aparece bloqueado no menu com o motivo.
6. Teste vencido sem assinatura (ou assinatura inativa): só **Assinatura** e **Configurações**.
7. `/assinatura` mostra o status; a contratação real chega no sub-projeto 4.

Login (`/login`), "esqueci minha senha" (`/recuperar-senha` → e-mail → `/redefinir-senha`) e reenvio do e-mail de
confirmação fazem parte da Fundação.

## 3. Modelo de dados (migração `*_fundacao_v2.sql`, depois da baseline; tabelas da v1 intactas)

| Tabela | Campos principais | Observações |
|---|---|---|
| `organizations` | id, name, trial_ends_at, subscription_status (`trialing`/`active`/`past_due`/`canceled`), plan, current_period_end, billing_exempt, ml_accounts_limit, created_at, updated_at | O "cliente" do SaaS (a loja/empresa). Cobrança e limites ficam aqui. `billing_exempt` = cortesia (clientes da v1, contas do Breno). |
| `organization_members` | organization_id, user_id, role (`owner`/`admin`/`member`), created_at | Hoje 1 dono por organização; pronto para equipe. |
| `profiles` | id (= auth.users.id), full_name, whatsapp, terms_accepted_at, terms_version, onboarding_completed_at, tour_completed_at, is_platform_admin | `is_platform_admin` = acesso ao futuro painel admin do Breno. |
| `ml_accounts` | id, organization_id, ml_user_id (**unique global**), nickname, site_id, status (`active`/`inactive`/`disconnected`), token_status (`valid`/`invalid`), connected_by, last_refresh_error(_at), created_at, updated_at | **Uma conta ML pertence a uma única organização.** |
| `ml_account_tokens` | ml_account_id, access_token_enc, refresh_token_enc, expires_at, refresh_lease_until, updated_at | Tokens **criptografados** (AES-256-GCM, chave `ML_TOKEN_ENCRYPTION_KEY`). Sem acesso algum pelo navegador. |

- Trigger em `auth.users` (insert) cria profile + organization (trial de 7 dias) + membership `owner`.
- Funções SQL: `is_org_member(org)`, `organization_access(org)` → `trial`/`active`/`blocked`; trigger que impede passar
  de `ml_accounts_limit` contas ativas (padrão 1 até os planos existirem).

## 4. Segurança

- **RLS em tudo.** O navegador (chave anon) só tem **SELECT** nas próprias linhas (membros da organização);
  `anon` não tem acesso; `ml_account_tokens` sem nenhum acesso fora do service role.
- **Toda escrita passa pelo servidor** (Server Actions/Route Handlers num Data Access Layer `server-only`), que
  revalida sessão, organização e permissão **dentro de cada ação** (regra do Next 16: o proxy não protege ações).
- Bloqueios (trial/plano/conta ML) calculados no servidor e checados por página e por ação.
- OAuth ML: `state` + PKCE S256; verificador e state num cookie httpOnly **criptografado** com validade de 10 min;
  confere usuário e organização no retorno; trata conta já vinculada (mesma org → reconecta; outra org → recusa).
- Refresh de token com "lease" no banco para não renovar duas vezes em paralelo (o refresh token do ML é de uso único).
- Nada sensível serializado para o cliente (só os campos que a tela usa).

## 5. Interface

- Referência visual obrigatória: **shadcn/ui** (https://ui.shadcn.com/docs/components) — componentes e blocks
  (login, sidebar recolhível em ícones, cards). Ícones Lucide, fonte Geist.
- Marca (logo `MeliLogo.png`, "MeLi Responde"): azul `#1858D8` (primária), azul-marinho `#0B1A44`, amarelo `#FCC428`
  (destaques/avisos). Nome centralizado em `lib/config/site.ts`.
- Layout do app: sidebar shadcn (recolhível), cabeçalho com trigger e título, barras de aviso (dias de teste +
  "Ver planos"; "conecte sua conta do ML"), toasts (Sonner).

## 6. Rotas

Públicas: `/login`, `/cadastro`, `/verificar-email`, `/recuperar-senha`, `/redefinir-senha`, `/auth/confirm`,
`/termos`, `/privacidade`, `/api/webhook/mercadolivre` (v1, até o sub-projeto 2).
Logado: `/onboarding`, `/painel`, `/contas`, `/assinatura`, `/configuracoes`, `/api/ml/oauth/start`,
`/api/auth/callback/mercadolivre` (redirect URI já cadastrada no app ML de teste).
As telas da v1 (`/`, `/settings`, `/training`) saem da branch `v2`; o motor de respostas da v1 (`lib/ai`,
`lib/mercadolivre/workflow.ts`, webhook) fica intacto até o sub-projeto 2.

## 7. Testes

- Vitest para lógica pura e crítica: criptografia, PKCE (vetor da RFC 7636), cálculo de acesso/dias de teste,
  validação de WhatsApp e de redirecionamento seguro.
- Testes de RLS em SQL (`supabase/tests/`) rodados no Supabase de testes com usuários simulados.
- `tsc`, ESLint e `next build` limpos; verificação manual na staging.

## 8. Configuração externa

- Supabase de testes (Auth): Site URL = staging, URLs de redirect (staging + localhost), confirmação de e-mail ligada.
  ⚠️ No plano free com o SMTP padrão **não é possível editar os templates** (a API recusa) e o envio só chega a e-mails
  da equipe do projeto, com limite baixo por hora. Por isso `/auth/confirm` aceita os dois formatos: o padrão
  (`?code=`, mesmo navegador) e o `token_hash` (para quando houver SMTP próprio + templates PT-BR).
  **Antes do lançamento: SMTP próprio** (ex.: Resend) e templates com `token_hash`.
- Vercel (Preview + branch `v2`): `ML_TOKEN_ENCRYPTION_KEY` e `NEXT_PUBLIC_SITE_URL`.
- App ML de teste: PKCE pode ser marcado como obrigatório depois do primeiro teste de conexão bem-sucedido.
