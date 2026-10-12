# Painel do administrador da plataforma (design)

- **Data:** 2026-10-12 · **Status:** implementado na branch `v2` (decisões técnicas delegadas à IA pelo Breno)
- **Pedido do Breno:** um painel onde ele monitora a plataforma inteira: tokens gastos, controle financeiro, quem está
  se cadastrando, usuários ativos, editar usuários "etc." Não sabia se usava subdomínio (`admin.maanu...`) ou `/admin`
  com usuário específico; pediu a opção melhor e mais segura e para completar com o que fizer sentido.

## 1. Decisão: `/admin` no mesmo app, com 2 fatores obrigatório (e pronto para subdomínio)

A segurança não vem do endereço (URL escondida ou subdomínio não impedem ninguém), vem dos controles:

1. **Quem é admin:** só `profiles.is_platform_admin = true`, que **só pode ser ligado direto no banco** (service role /
   SQL). O painel **não** cria nem remove administradores.
2. **Verificação em 2 etapas (TOTP) obrigatória** para entrar no painel (Supabase Auth MFA, app autenticador:
   Google Authenticator, 1Password, Authy...). Sem código, a sessão é `aal1` e o painel não abre. O código é pedido de
   novo a cada **12 horas** (idade da verificação TOTP no `amr` do JWT). Para o app de cliente nada muda.
3. **Checagem em 3 camadas:** (a) o `proxy.ts` exige login; (b) a DAL (`lib/dal/admin.ts`) confere admin + `aal2` +
   TOTP recente em **toda** página, ação e rota; (c) **o próprio banco confere de novo**: todas as funções `admin_*`
   começam com `admin_assert()`, que lê o JWT verificado pelo PostgREST (`auth.uid()`, `aal`, `amr`) e o perfil. Mesmo
   um bug no servidor não vaza dados: a chamada sem sessão de admin verificada falha no Postgres.
4. **Quem não é admin recebe 404** (a página "não existe"); a tela de código só aparece para administradores.
5. **Auditoria imutável:** toda alteração feita pelo painel (e entradas/falhas do código) vai para `admin_audit_log`
   com quem, quando, IP, navegador, antes/depois. A tabela é só de inclusão (trigger recusa UPDATE/DELETE/TRUNCATE) e as
   alterações de dados gravam o registro **na mesma transação** (função SQL).
6. **Limite de tentativas:** 5 códigos errados em 15 minutos bloqueiam novas tentativas por 15 minutos.
7. **Cabeçalhos:** `/admin` com `X-Robots-Tag: noindex`, `Cache-Control: no-store`, `X-Frame-Options: DENY`,
   `Referrer-Policy: no-referrer`; metadata `robots: noindex`.

**Por que não subdomínio agora:** a maanu ainda não tem domínio próprio (staging é `mlresponde-v2.vercel.app`), e o
ganho real do subdomínio (cookies de sessão separados do app do cliente) é pequeno perto dos controles acima. **Ficou
pronto:** com o domínio comprado, basta apontar `admin.<dominio>` para o projeto na Vercel e definir a variável
`ADMIN_HOST=admin.<dominio>`; o `proxy.ts` passa a servir o painel **só** nesse endereço (no domínio principal `/admin`
vira 404) e o subdomínio só abre o painel e o login (sessão separada da do app). Regra pura e testada em
`lib/admin/host.ts`.

## 2. O que o painel tem (menu lateral grafite, para nunca confundir com o app do cliente)

1. **Visão geral** (`/admin`): clientes por situação (teste, teste vencido, assinante, cortesia, inadimplente,
   cancelado), cadastros (hoje/7/30 dias e variação), **usuários ativos** (hoje/7/30 dias), MRR, custo de IA (hoje/7
   dias/mês, em R$ e US$), perguntas e % da IA, gráficos de cadastros e de custo de IA por dia (30 dias), **funil de
   ativação** dos cadastros dos últimos 30 dias (cadastrou → confirmou e-mail → concluiu cadastro → conectou ML →
   configurou a IA → ligou a IA → primeira resposta da IA → assinou), últimos cadastros com a etapa de cada um, testes
   que vencem em 3 dias e alertas da operação.
2. **Clientes** (`/admin/clientes`): busca (loja, nome, e-mail, CPF/CNPJ, WhatsApp, apelido da conta ML), filtros por
   situação e plano, ordem (recentes, último acesso, custo de IA, perguntas, nome, fim do teste), 25 por página e
   **exportar CSV**.
3. **Ficha do cliente** (`/admin/clientes/[id]`): dados da loja, cobrança (CPF/CNPJ e endereço), usuários (último
   acesso, e-mail confirmado, bloqueado, 2 etapas), contas ML (status, token, IA ligada, pós-venda, erros), uso e
   custo de IA (30 dias, por função e por dia), últimas perguntas, notas internas e histórico de alterações.
   **Ações** (todas auditadas): editar assinatura (plano, situação, fim do teste, fim do período, cortesia, limite de
   contas ML, mensalidade em R$), **estender teste** (+3/+7/+14/+30 dias), notas internas, editar usuário (nome,
   WhatsApp, e-mail), confirmar e-mail manualmente (útil enquanto o SMTP é o padrão), enviar e-mail de redefinição de
   senha, **bloquear/desbloquear o acesso** (ban no Supabase Auth) e **pausar a IA** de uma conta ML (perguntas e/ou
   pós-venda; religar continua sendo decisão do cliente).
4. **Uso de IA** (`/admin/uso-ia`, 7/30/90 dias): chamadas, tokens (entrada, cache, saída), custo em US$ e R$, falhas,
   latência média, custo por resposta da IA, gráfico diário, por função (respostas, sugestões, testes, pós-venda), por
   modelo (avisa modelo sem preço cadastrado) e clientes que mais gastam.
5. **Financeiro** (`/admin/financeiro`): MRR, ARR, clientes pagantes, ticket médio, custo de IA do mês (real e
   projetado), custos fixos, **margem estimada**, receita × custo de IA por cliente (quem dá prejuízo), inadimplentes,
   testes que vencem em 7 dias e configurações (cotação do dólar e custos fixos mensais).
6. **Operação** (`/admin/operacao`): **pausa geral da IA** (botão de emergência), filas de perguntas e pós-venda
   (pendentes, processando, presas, com falha, esperando o vendedor), erros recentes, contas ML com token inválido,
   perguntas por hora nas últimas 24 h e falhas da OpenAI.
7. **Auditoria** (`/admin/auditoria`): tudo o que foi feito no painel, com filtro por cliente e por ação.

## 3. Dados novos (migração aditiva `20261012120000_painel_admin.sql`)

- `ai_usage_events`: **1 linha por chamada à OpenAI** (organização, conta ML, função, modelo, tokens de entrada / cache /
  saída / raciocínio, custo em US$ calculado na hora com a tabela de preços do código, sucesso, latência, pergunta ou
  conversa). Antes só existia `ai_tokens` da última execução de cada pergunta (sem testes e sugestões repetidas). O
  histórico começa agora (sem backfill: os tokens antigos não separavam entrada e saída). Só service role grava; leitura
  só pelas funções de admin.
- `platform_settings` (linha única): pausa geral da IA (motivo, quando, quem), cotação US$→R$ (padrão 5,50) e custos
  fixos mensais em R$ (padrão 0).
- `admin_audit_log` (só inclusão) e `admin_organization_notes` (notas internas; o cliente não lê).
- `organizations.monthly_price` (mensalidade em R$, opcional): enquanto não houver gateway, o MRR vem daqui; o
  sub-projeto 4 (cobrança) passa a preencher automaticamente.
- `profiles.last_seen_at`: atualizado (no máximo a cada 15 min, depois da resposta, com `after()`) quando o usuário usa
  o app. **Usuário ativo** = último acesso (`greatest(last_seen_at, auth.users.last_sign_in_at)`) no período.
- Índice BRIN em `ml_questions(created_at)` (consultas da plataforma inteira por período).
- Funções `admin_*` (`security definer`, `execute` só para `authenticated`, todas com `admin_assert()`): visão geral,
  lista e ficha de clientes, uso de IA, financeiro, operação, auditoria e as alterações (organização, notas, perfil,
  pausar conta, configurações da plataforma, registro de eventos do servidor).

## 4. Preços e custo de IA

`lib/ai/pricing.ts` (puro, testado): US$ por 1M tokens — `gpt-6-luna` 0,10 entrada / 0,01 entrada em cache / 0,50
saída; `gpt-4o-mini` 0,15 / 0,075 / 0,60. Custo = (entrada − cache) × preço + cache × preço de cache + saída × preço
de saída. O custo é **gravado na hora** (mudança de preço não reescreve o passado). Modelo sem preço → custo 0 e aviso no
painel. Conversão para R$ pela cotação das configurações.

## 5. Pausa geral da IA (botão de emergência)

Para quando a IA começar a errar, a OpenAI cair ou o custo disparar. Com a pausa ligada, **nenhuma chamada à OpenAI
sai** (o wrapper `runAnswerModel`/`runAfterSaleModel` confere antes): perguntas e conversas novas vão para o vendedor
("Respostas automáticas pausadas" / "Agente de pós-venda pausado"), sugestões e testes mostram "a IA da maanu está
pausada temporariamente" e o app do cliente mostra uma faixa avisando. Ao despausar, o que ficou com o vendedor continua
com ele (pode usar "Deixar a IA tentar de novo").

## 6. Recuperação e operação

- **Primeiro acesso do Breno:** entrar normalmente, abrir `/admin`, escanear o QR code com o app autenticador e digitar
  o código. Guardar o código secreto mostrado (serve para cadastrar o mesmo autenticador em outro aparelho).
- **Perdeu o celular:** no SQL Editor do Supabase do ambiente,
  `delete from auth.mfa_factors where user_id = (select id from auth.users where email = '<email>');` e cadastrar de novo.
- **Tornar alguém admin:** só por SQL (`update public.profiles set is_platform_admin = true where id = '<user id>';`).

## 7. Fora do escopo (próximos passos)

Excluir conta/organização (LGPD, com período de carência), "entrar como cliente" (impersonação), pagamentos e notas
fiscais (sub-projeto 4), alertas por e-mail/WhatsApp (custo de IA acima do limite, fila parada), limites de tokens por
plano, backfill do histórico de tokens.
