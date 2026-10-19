# 🧠 CÉREBRO DO PROJETO — maanu (antes Meli Fácil / Mercado Livre Responde)

> **Fonte única de verdade do projeto.** Qualquer IA (Claude, ChatGPT/Codex ou outra) deve ler este arquivo
> inteiro antes de trabalhar e atualizá-lo ao terminar. Se algo aqui divergir do código, o código vence —
> e este arquivo deve ser corrigido na mesma sessão.

Última atualização: **2026-10-19** (Sessão 28 — **aba Clientes** pronta na branch `codex/clientes` (quem comprou em cada conta do ML: compras, total, quem voltou, cidade/UF, perguntas, conversas e observações; sem e-mail/telefone, que o ML não entrega); migração `clientes` **já aplicada** no banco; falta o Breno liberar o merge na `v2` e ligar o tópico Orders no DevCenter (§13 item 0l); Sessão 27 — **troca de endereços concluída**: `maanu.com.br` = só a página de vendas (indexável; `/institucional` redireciona) e **o app em `app.maanu.com.br`** (`APP_HOST`, Site URL do Supabase), webhooks e retorno do OAuth do ML fixos no domínio principal; Sessão 23d — **só o plano mensal** (decisão do Breno): o anual saiu da Assinatura, da página de vendas, das Dúvidas, do `llms.txt`, dos Termos e do painel; Sessão 23c — **cobrança pela AbacatePay em produção** (chave de produção, produtos mensais e webhook prontos); o anual só aparece quando houver os produtos anuais; Sessão 25c — WhatsApp/telefone `(31) 99263-0934` no rodapé de `/institucional` para a aprovação da AbacatePay; falta o e-mail; Sessão 25b — página de vendas **publicada em `maanu.com.br/institucional`** para o Breno e o sócio revisarem, fora do Google por enquanto; `maanu.com.br/` continua levando ao app; Sessão 26 — quatro criativos 4:5 para carrossel do Instagram salvos em `CRIATIVOS/`; Sessão 25 — página de vendas em `maanu.com.br/` com SEO para Google, Bing e buscas por IA (dados estruturados, `llms.txt`, robots, imagem de compartilhamento, carregamento mais rápido) e app pronto para ir para `app.maanu.com.br` (variável `APP_HOST`), na branch `codex/pagina-de-vendas`, aguardando o Breno; Sessão 24 — cliente sem permissão de administrador vê uma mensagem de acesso restrito com retorno ao painel; Sessão 23b — tela "Levando você para o pagamento seguro" antes da AbacatePay, teste de compra aprovado e dados de teste apagados, falta a chave de produção; Sessão 23 — cobrança pela AbacatePay pronta no código e no banco: assinar, trocar, cancelar e webhooks; falta só a chave de API do Breno; Sessão 22 — perguntas chegando sozinhas: rotina que busca no ML a cada ~10 s + webhook respondendo na hora; foto do anúncio corrigida; Sessão 21 — v1: botão de pausar a IA funcionando, commit `bf56777` na `main`; Sessão 20b — Starter com 300 respostas e espaço nos cards dos planos; Sessão 20 — planos Starter/Pro/Escala com limites, teste grátis e Melhorias de anúncio; Sessão 19 — pesquisa de preços e proposta de 3 planos; Sessão 18 — tour de boas-vindas e avisos de teste/conta ML redesenhados; Sessão 17 — chaves de IA cadastradas e trocadas pelo painel do administrador; Sessão 16 — textos do cadastro sem falar em cobrança; Sessão 15b — Fase 1 da troca preparada)

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

**Nomes:** marca comercial **maanu** (desde 2026-10-11, Sessão 12; antes "Meli Fácil" na v1 e "MeLi Responde" na v2) ·
repositório `brenosousaf13/mlresponde` · pacote npm `maanu` (era `ml-automatizado`) · pasta local
`C:\Users\Breno\Desktop\Mercado Livre Responde`. A v1 em produção (`main`) continua com "Meli Fácil" até o cutover.

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
  **Sessão 5 (2026-10-11): "Respostas da IA" virou "Assistente de IA"** (`/assistente`) com configuração guiada de
  19 perguntas sobre o negócio (vira o conhecimento da loja no prompt, editável depois), ligar/pausar discreto, abas
  Sobre a loja / Jeito de responder / Respostas ensinadas / Anúncios bloqueados / Testar; prompt reescrito com as
  travas da v1; **Perguntas virou caixa de entrada** em duas colunas com filtros coloridos e resposta na própria tela.
  Spec: `docs/superpowers/specs/2026-10-11-assistente-ia-design.md`.
  **Sessão 6 (2026-10-11): ajustes visuais e escala** — recolher o menu pela própria barra lateral (sem barra de topo no
  computador), espaço entre os itens do menu, Perguntas preparada para milhares de perguntas (colunas com rolagem própria,
  50 por página, filtro por anúncio, ordem, grupos por dia, RLS e índices otimizados) e Painel com "Esperando você",
  "Últimas perguntas" e "Anúncios mais perguntados". Testado com 1.500 perguntas de QA (apagadas depois).
  **Sessão 7 (2026-10-11): menu Resultados** (`/resultados`) — analytics para o cliente ver o valor da IA: economia
  estimada em R$ e horas (premissas ajustáveis), projeção anual, tempo de resposta IA × você, espera evitada fora do
  horário comercial, perguntas por dia, mapa de horários, anúncios com mais perguntas, assuntos mais perguntados e onde a
  IA pode melhorar. Spec: `docs/superpowers/specs/2026-10-11-resultados-design.md`.
  **Sessão 8 (2026-10-11): IA da v2 trocada para `gpt-6-luna`** (antes `gpt-4o-mini`), sem raciocínio (`none`), mais
  barata; prompt reforçado para não citar variação esgotada. A v1 em produção segue com `gpt-4o-mini`.
  **Sessão 9 (2026-10-11): dados de cobrança no cadastro** — depois de confirmar o e-mail, o cadastro tem 2 etapas
  (loja + WhatsApp → **CPF/CNPJ, nome/razão social e endereço**); CEP preenche o endereço; CNPJ alfanumérico aceito;
  documento **único** na plataforma e **imutável** depois de salvo (trava no banco); editável em Configurações (menos o
  documento). Contas antigas são levadas a completar no próximo acesso. Spec: `docs/superpowers/specs/2026-10-11-dados-cobranca-design.md`.
  **Sessão 10 (2026-10-11): modo "Responder sempre" + leitura completa do anúncio** — chave em Jeito de responder (e passo
  novo na configuração guiada): a IA responde toda pergunta e, quando não tem a informação, envia a **mensagem padrão**
  da loja (personalizável); desconto, reclamação e pedido de contato recebem respostas neutras e seguras. Perguntas mostra
  essas respostas em violeta, com filtro "Só mensagem padrão" e "Ensinar a IA" na própria conversa. A IA agora lê do
  anúncio também todas as condições de venda (garantia, prazo de fabricação), atributos com vários valores, variações com
  nome, tabela de medidas, dados do catálogo e a descrição inteira (até 20 mil caracteres); falha passageira ao ler a
  descrição faz a fila tentar de novo. Testar mostra "O que a IA leu deste anúncio".
  Spec: `docs/superpowers/specs/2026-10-11-modo-sempre-e-leitura-do-anuncio-design.md`.
  **Sessão 11 (2026-10-11): Pós-venda com IA, exclusivo do plano Essencial** (desde a Sessão 20: planos Pro e Escala e o teste grátis) — menu **Pós-venda** (`/pos-venda`) que só
  aparece para organizações com `plan = 'essencial'` (ou `admin`); caixa de entrada das mensagens de quem já comprou e um
  **agente** que lê a conversa inteira, a venda, o envio (rastreio, previsão) e o anúncio e responde sozinho quando tem certeza
  (limite de 350 caracteres do ML); assuntos delicados ficam com o vendedor (ou o agente acolhe e orienta, se a loja escolher);
  configuração em `/pos-venda/agente` (instruções, assuntos delicados, certeza, assinatura, respostas ensinadas, Testar).
  Primeira regra de plano do produto (`lib/plans/plans.ts` + RLS). Spec: `docs/superpowers/specs/2026-10-11-pos-venda-design.md`.
  Falta testar com conta ML real (depende do Breno).
  **Sessão 12 (2026-10-11): nova identidade visual "maanu"** — logo "maanu." e símbolo "m." vetorizados a partir dos
  arquivos do Breno (SVG no próprio HTML), favicon/ícones/imagem de compartilhamento novos, tema teal + grafite (neutros
  slate) em todas as telas, nome e assinatura ("Respostas automáticas com IA para marketplaces") nos textos.
  **Sessão 13 (2026-10-12): painel do administrador** (`/admin`, só `is_platform_admin` + **verificação em 2 etapas
  (TOTP) obrigatória**, código pedido de novo a cada 12 h; quem não é admin vê a tela de acesso restrito desde a Sessão 24). Telas: Visão geral (clientes por
  situação, cadastros, usuários ativos, MRR, custo de IA, funil de ativação, testes acabando, alertas), Clientes (busca,
  filtros, CSV) e ficha do cliente (editar assinatura/plano/mensalidade/cortesia/limite, estender teste, notas internas,
  editar usuário e e-mail, confirmar e-mail, link de senha nova, bloquear acesso, pausar a IA de uma conta), Uso de IA
  (tokens e custo por chamada, função, modelo e cliente), Financeiro (MRR, custo de IA projetado, margem, quem dá
  prejuízo), Operação (filas, erros, contas com problema e **pausa geral da IA**) e Auditoria (histórico imutável).
  Toda chamada à OpenAI agora grava tokens e custo em `ai_usage_events`. Spec: `docs/superpowers/specs/2026-10-12-painel-admin-design.md`.
  **Sessão 14 (2026-10-12): primeiro cliente real da v1 na v2 (só no Supabase de TESTES)** — exportação só leitura do perfil
  inteiro de um cliente da produção (loja de moda feminina: 831 perguntas de mai–out/2026, base de conhecimento de ~25 mil
  caracteres, 113 exemplos) e importação na staging com login próprio, para o Breno ver os dados reais nas telas da v2.
  Scripts reutilizáveis em `scripts/v1-para-v2/` + regras do mapeamento em `lib/migration/v1.ts` (testadas) = base da
  migração do cutover (§6.3). Corrigido também um loop de redirecionamento no login (§8). Depois de o Breno testar, a
  importação e os arquivos com os dados do cliente foram **apagados** (staging e pasta privada voltaram ao estado anterior).
  **Sessão 15 (2026-10-12): decisão da troca + reforço de segurança.** O Breno decidiu: a **v1 será descontinuada** e os
  clientes atuais **não serão migrados** (vão se recadastrar na v2, sem importar nada do banco da v1); o projeto Supabase da
  v2 (`ookosqyfazobiwmopiix`, plano grátis) **vira o banco de produção**; domínio **`maanu.com.br`** (comprado, no Registro.br).
  Antes de desligar a v1, **1 semana de teste com 1 cliente real na v2** (o app ML **da v2** vira o definitivo; a `main`/v1
  só muda depois do teste). Feito: migração `reforco_seguranca` (tabelas herdadas da v1
  trancadas, função `rls_auto_enable` fora da API, padrão "nada novo fica acessível sem GRANT"), SSL obrigatório no banco,
  senha do banco trocada por uma aleatória que ninguém guarda, senhas de usuário com letras e números. Detalhes em §8 e §12.
  Plano da troca em §13 (item 0a).
  **Sessão 15b (2026-10-12): Fase 1 da troca preparada.** Banco limpo (só o login admin do Breno), chaves novas do
  Supabase (as antigas desligadas e o segredo JWT antigo revogado), **projeto Vercel `maanu`** criado (production branch
  `v2`, crons rodando, variáveis de produção, domínio `maanu.com.br` + `www` adicionados — falta o DNS no Cloudflare),
  login do Supabase apontando para `maanu.com.br` e e-mails do login em português prontos (entram quando o SMTP do Resend
  for ligado). **A partir daqui todo push na `v2` publica em produção.**
  **Sessão 17 (2026-10-12): Chaves de IA no painel do administrador** (`/admin/chaves-ia`). As chaves da OpenAI passam a
  ser cadastradas e trocadas pelo painel, sem novo deploy: ficam **criptografadas pelo servidor** (AES-256-GCM com a
  chave-mestra `AI_KEYS_ENCRYPTION_KEY`, que só existe na Vercel), o painel nunca mostra a chave de novo (só o final
  `sk-proj-…a1b2`), toda chave é **testada na OpenAI antes** de entrar em uso, há **reserva** que entra sozinha se a OpenAI
  recusar a chave em uso (HTTP 401; no máximo 1 troca automática a cada 10 min) e a `OPENAI_API_KEY` da Vercel continua
  como último recurso. Uso e custo por chave. Spec: `docs/superpowers/specs/2026-10-12-chaves-ia-design.md`.
  **Sessão 18 (2026-10-13): tour e avisos com visual próprio** (pedido do Breno: estavam idênticos ao AgilizaPRO). O tour de
  boas-vindas continua com 4 passos, agora com as **ilustrações do Breno** (`public/tour/`), em duas colunas (ilustração +
  texto), etapas com nome clicáveis, voltar/avançar, "Pular" e setas do teclado. As faixas coloridas de largura total no topo
  saíram: o **teste grátis** fica num cartão no rodapé do menu lateral com um anel dos dias que faltam (menu recolhido: só o
  anel; celular: selo no topo) até o teste acabar ou a assinatura ficar ativa; a **conta do ML** vira um cartão no topo do
  conteúdo de todas as páginas, com "Conectar agora", até existir uma conta ativa.
  **Sessão 20 (2026-10-13): planos Starter, Pro e Escala** (decididos pelo Breno): R$ 97 / 197 / 397 por mês (anual com 2
  meses grátis: R$ 81 / 164 / 331 por mês), **300 / 1.500 / 5.000 respostas automáticas por mês** (Starter baixado de 500 para 300 a pedido do Breno, mesmo dia), 1 / 3 / 10 contas do ML,
  **pós-venda a partir do Pro**, **Melhorias de anúncio** 20 (Pro) / 100 (Escala) por mês, suporte e-mail / WhatsApp /
  prioritário. Relatórios em todos os planos; sem limite de equipe; sem excedente pago no Escala. **Teste grátis = tudo do
  Pro** com 1 conta, 300 respostas e 3 análises. Limite de respostas conferido **antes de chamar a IA** (acabou → pergunta
  ou conversa fica com o vendedor, `answers_limit`), avisos a partir de 80%, tela Assinatura nova com os 3 planos
  (contratação pelo app ainda desligada: o gateway será a **AbacatePay**). Menu novo **Melhorias de anúncio** (`/melhorias`):
  a IA lê as perguntas de cada anúncio (com as respostas) e o anúncio e sugere o que mudar, com texto pronto para colar e o
  efeito (perguntas por semana antes × depois). Spec: `docs/superpowers/specs/2026-10-13-planos-design.md`.
  **Sessão 22 (2026-10-13): 1º cliente real na semana de teste** (Girassol Moda Jeans, conta ML `LOJAJEANSDAMODA`). As
  perguntas só apareciam clicando em "Sincronizar com o ML": o ML **não entregava nenhuma notificação** dessa conta ao app
  da v2 (só ao app da v1, que o cliente ainda tem autorizado). Agora o cron de perguntas **busca as perguntas novas no ML a
  cada ~10 s** em todas as contas (`lib/answers/poll.ts`), sem depender da notificação, e o webhook responde 200 na hora (o
  ML pede até 500 ms). Foto do anúncio quebrada (o ML devolve `http://` e o `next/image` só aceita https) → `mlImageUrl`.
  **Sessão 23 (2026-10-14): cobrança pela AbacatePay (sub-projeto 4b)** — a tela Assinatura assina pelo app (página de
  pagamento hospedada da AbacatePay, cartão), troca de plano (subir libera na hora; descer vale na próxima cobrança), troca
  mensal ↔ anual e "pagar com outro cartão" (assinatura nova; a antiga é cancelada sozinha) e cancela (acesso até o fim do
  período pago). Webhook `/api/webhook/abacatepay` (formato antigo e Standard Webhooks) atualiza `organizations` (plano,
  situação, ciclo, fim do período, mensalidade = MRR automático). Cobrança recusada vira aviso; a AbacatePay tenta 4 vezes.
  Produtos reconhecidos sozinhos pelo nome + preço. Painel admin → **Cobrança** (configuração, produtos, webhook com botão
  de cadastrar, assinaturas, notificações) e ficha do cliente com a assinatura e "Cancelar". Banco: §6.1i. **Desligado até o
  Breno colocar a `ABACATEPAY_API_KEY` na Vercel** (o segredo do webhook já foi criado pela IA): até lá aparece "em breve".
  **Sessão 23b:** o Breno colocou a chave de **teste**, cadastrou o webhook e assinou o Pro com o cartão 4242: funcionou de
  ponta a ponta. Os dados desse teste foram apagados e a variável de e-mails de teste removida, então hoje (chave de teste,
  sem e-mails liberados) os clientes veem "Contratação pelo app em breve" até a chave de **produção**. Antes de ir para a
  AbacatePay, o cliente vê a tela "Levando você para o pagamento seguro" (`components/plans/checkout-redirect-dialog.tsx`).
  **Sessão 23c (2026-10-16): no ar em produção.** Conta da AbacatePay aprovada (loja "maanu."); o Breno criou a chave de
  **produção**, os 3 produtos mensais e cadastrou o webhook pelo painel. Qualquer cliente já assina pela tela Assinatura.
  **Sessão 23d (mesmo dia): só o plano mensal** (decisão do Breno, "vamos trabalhar sem o anual por enquanto"): o anual
  saiu de tudo — Assinatura, página de vendas, Dúvidas, `llms.txt`/dados estruturados, Termos e painel admin. Produtos
  ANNUALLY na AbacatePay são **ignorados** (o painel Cobrança os lista como "pode arquivar"). O banco ainda aceita
  `billing_cycle = 'annual'` (sem uso, nada foi apagado). Voltar a vender o anual exige código (decisão 2026-10-16).
  Spec: `docs/superpowers/specs/2026-10-14-cobranca-abacatepay-design.md`. Passo a passo para ligar: §13 item 0g.
  **Sessão 24 (2026-10-14): acesso restrito ao admin** — cliente logado que abre uma página `/admin/*` (incluindo
  verificação e exportação CSV) vai para `/acesso-negado`: "Você não tem acesso a esta página", explicação e botão
  "Voltar ao meu painel", no padrão visual da marca. Permissões, segunda etapa e verificações do banco mantidas.
  **Sessão 25 (2026-10-14): página de vendas** — **publicada em 2026-10-15 em `maanu.com.br/institucional`** (merge da
  branch `codex/pagina-de-vendas` na `v2`) para o Breno e o sócio revisarem; `maanu.com.br/` continuou levando ao app até a
  **Sessão 27 (2026-10-16), quando a página foi para a raiz `maanu.com.br/`** (`/institucional` redireciona com 308).
  Conteúdo: topo escuro com demonstração ao vivo
  da IA respondendo, faixa de perguntas, "a mesma pergunta em três lojas", como funciona, leitura do anúncio, certeza, "no dia a
  dia", calculadora de economia, planos, dúvidas, convite final e rodapé), inspirada no layout da AbacatePay sem copiar.
  Sem espaços de imagem (tudo desenhado em código); rodapé com o **CNPJ 65.771.781/0001-63** (sem razão social, pedido do
  Breno), WhatsApp/telefone `(31) 99263-0934` (2026-10-16) e só os contatos já informados em `companyInfo`
  (`lib/config/site.ts`; e-mail e Instagram ainda vazios, então não aparecem). O app pode morar em `app.maanu.com.br` com a
  variável **`APP_HOST`** (`lib/site/host.ts` + `proxy.ts`): sem ela nada muda no app. Passo a passo da troca
  de endereço em §13 item 0k (Sessão 27). **SEO (2026-10-15):** título/descrição/canonical, dados estruturados (Organization com CNPJ,
  WebSite, WebPage, SoftwareApplication com os preços, FAQPage), `robots.txt` liberando buscadores e robôs de IA (GPTBot,
  ClaudeBot, PerplexityBot, Google-Extended...), `sitemap.xml`, `/llms.txt` (resumo em Markdown para IAs), imagem de
  compartilhamento própria e `noindex` fora de `maanu.com.br`. Lighthouse: celular 90–91 de desempenho, computador 100; SEO,
  acessibilidade e boas práticas 100. Ficou fora do Google enquanto esteve em `/institucional`; **indexável desde a Sessão 27** (`SALES_PAGE_INDEXABLE = true`
  em `lib/site/seo.ts`, página no sitemap); falta o Breno cadastrar o site no Google Search Console e no Bing (§13 item 0i (e)).
  **Sessão 27 (2026-10-16): troca de endereços** (pedido do Breno: "a plataforma vai passar a responder em
  `app.maanu.com.br` e o /institucional no domínio principal"). No ar: página de vendas em `maanu.com.br/`. Preparado:
  `app.maanu.com.br` no projeto Vercel `maanu` e nos redirects do Supabase Auth; webhook da AbacatePay fixo no domínio
  principal (`webhookBaseUrl`). **No ar desde 2026-10-16 ~19:30:** o Breno criou o CNAME `app` no Cloudflare e a IA ligou
  `APP_HOST=app.maanu.com.br` + `NEXT_PUBLIC_SITE_URL=https://app.maanu.com.br` (Vercel `maanu`, Production) e o Site URL do
  Supabase; todo o resto de `maanu.com.br` (login, cadastro, painel, links dos e-mails) vai com 307 para o mesmo caminho em
  `app.maanu.com.br` (§13 item 0k). Webhooks do ML e da
  AbacatePay e a URL de retorno do OAuth do ML ficam em `maanu.com.br` (nada a mudar no DevCenter nem na AbacatePay).
  **Sessão 28 (2026-10-19): aba Clientes** (`/clientes`, **todos os planos**; pedido do Breno: "aba de clientes com e-mail e
  telefone vindos do ML"). Pesquisa na documentação + conferência na API real: o ML **não entrega e-mail** e o **telefone vem
  mascarado** ("XXXXXXX"; só aparece de verdade em vendas ME1), e usar contato fora da plataforma é proibido. Decisão do
  Breno: conhecer os clientes com **dados mínimos** (apelido, nome, sobrenome, cidade/UF e as compras), **12 meses** de
  vendas importados ao ligar e **observações internas**. Lista com 4 números (clientes, voltaram a comprar, total, novos em
  30 dias), busca, filtros, ordem e 50 por página; ficha com compras (por carrinho), perguntas que fez, conversas do
  pós-venda (cadeado sem o plano) e observações. Sincronização: cron `/api/cron/clientes` (importação em janelas de 30 dias,
  conferência a cada 10 min, cidade/nome) + notificação `orders_v2`. **Estado:** código na branch `codex/clientes` (não
  publicada), migração `20261019120000_clientes.sql` já aplicada no banco (aditiva; as 3 contas existentes estão com a
  importação pendente, que começa quando o código entrar na `v2`). Spec: `docs/superpowers/specs/2026-10-19-clientes-design.md`.
- **Marca:** **maanu** (decisão do Breno, 2026-10-11). Guia de uso, paleta e arquivos em `docs/brand/README.md`; nome,
  assinatura e slogan em `lib/config/site.ts`; logo só pelos componentes de `components/brand/logo.tsx`.
- **Criativos sociais:** em 2026-10-15 foram criadas quatro peças 1080×1350 para um carrossel de apresentação da maanu;
  os PNGs finais ficam em `CRIATIVOS/` e aguardam avaliação do Breno antes de qualquer publicação.
- P0 de segurança/toggle (§8) **adiados** por decisão do Breno — revisitar antes de abrir para novos clientes.

---

## 2. Regras de ouro (produção está no ar!)

0. **Desde a Sessão 15 há duas produções:** `main` = v1 (projeto Vercel `mlresponde`, clientes antigos; **não pode parar
   até o Breno mandar desligar** — nada na `main`, nas variáveis de Production do `mlresponde`, no app ML da v1 ou no banco
   da v1; conferido no fim da Sessão 15b: v1 no ar com o deploy `ad72bff` de 2026-06-08 e app ML próprio, diferente do da v2) e **`v2` = produção
   da v2** (projeto Vercel `maanu`, `maanu.com.br`, cliente real em teste). Push na `v2` só com typecheck/test/lint/build
   passando; mudança grande ou arriscada vai antes para uma branch `codex/...` (nenhum projeto publica outras branches).
   O Supabase `ookosqyfazobiwmopiix` é **produção** (as regras abaixo sobre "banco de produção" valem para ele).
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
| UI | React 19.2 + Tailwind v4 + **shadcn/ui** (preset `base-nova`, primitivos **Base UI** `@base-ui/react`, `cn` do pacote `cn`, ícones `lucide-react`, toasts `sonner`). Componentes em `components/ui/`. Componentes Base UI usam a prop **`render`** (não `asChild`); para links com cara de botão usar `buttonVariants`. Tema da marca maanu em `app/globals.css` (`primary` teal, neutros slate, tokens `brand-*`; guia em `docs/brand/README.md`). | HTML + Tailwind puro |
| Formulários | Server Actions + `useActionState` + **zod 3** (validação no servidor) + componentes `Field` do shadcn | server actions simples |
| Auth | Supabase Auth: cadastro com confirmação de e-mail, login, recuperação de senha, onboarding | usuários criados à mão |
| Banco | Supabase Postgres, migrações em `supabase/migrations/`, tipos gerados em `lib/supabase/database.types.ts` | painel, sem migrações |
| Segurança | RLS só-leitura para o navegador; escritas via service role no servidor (DAL `server-only`); tokens ML AES-256-GCM | RLS fraca |
| Testes | **Vitest** (`tests/unit`), testes de RLS em SQL (`supabase/tests`) | nenhum |
| IA | OpenAI **`gpt-6-luna`** (desde a Sessão 8; configurável por `OPENAI_MODEL`), Chat Completions com `reasoning_effort: "none"`, saída estruturada JSON Schema `{action, answer, confidence, reason}`, temperature 0.2, `max_completion_tokens` 700. SDK `openai` 4.x (tipa só low/medium/high: `"none"` vai com cast em `lib/answers/ai.ts`). Chave: a "em uso" do painel (Chaves de IA, Sessão 17) → `OPENAI_API_KEY` | OpenAI `gpt-4o-mini`, texto livre |
| Hospedagem | Vercel (Preview da branch `v2`) | Vercel Production |

Ambiente local verificado: Node v24.18.0, npm 11.16.0, Windows + PowerShell 7. `@types/node` 24.
Removidos na v2: `@anthropic-ai/sdk`, `jimp`, `dotenv` e os scripts soltos da raiz.

---

## 4. Mapa do código (branch `v2`)

> A estrutura da v1 continua na branch `main` (produção). Na `v2` todo o código da v1 foi substituído (telas e motor);
> as tabelas antigas (`question_jobs`, `ml_credentials`, `knowledge_base`, `training_examples`) não são usadas pela v2.

```
proxy.ts                          # renova a sessão (getClaims) e redireciona: sem login → /login?next=; logado em
                                  # /login|/cadastro|... → /painel. NÃO é a camada de segurança (cada página/ação revalida).
                                  # Com ADMIN_HOST: /admin só abre no subdomínio do painel (lib/admin/host.ts)
app/
  layout.tsx                      # pt-BR, Geist, metadata da marca (TooltipProvider + Toaster saíram daqui na Sessão 25:
                                  # ficam em components/providers/app-providers.tsx, usado pelos layouts do app, admin,
                                  # (auth), onboarding e acesso-negado; a página de vendas não carrega esse código)
  (site)/                         # PÁGINA DE VENDAS (Sessão 25), em "/" desde a Sessão 27 (SALES_PAGE_PATH, lib/site/host.ts;
                                  # /institucional → / com 308 em next.config.ts; app/page.tsx foi apagado):
                                  # layout.tsx (fonte Funnel Display + site.css com as animações), page.tsx
                                  # (seções, metadata, dados estruturados de lib/site/seo.ts). Abre sem login (proxy nem
                                  # consulta a sessão). Com APP_HOST, "/" no endereço do app vai para /painel
  robots.ts, sitemap.ts           # buscadores e robôs de IA (lista em lib/site/seo.ts): página de vendas + termos/privacidade;
                                  # área logada fora (PRIVATE_PATHS)
  llms.txt/route.ts               # /llms.txt: resumo da maanu em Markdown para IAs (buildLlmsTxt, estático)
  (legal)/termos, privacidade     # canonical fixo em maanu.com.br (também abrem no endereço do app)
  icon.svg, favicon.ico           # favicon "m." (gerados por docs/brand/scripts/gerar.mjs)
  apple-icon.png, opengraph-image.png (+ .alt.txt)   # ícone do iPhone e imagem de links compartilhados
  (auth)/                         # telas públicas no estilo shadcn login-03 (fundo muted + card)
    actions.ts                    # signIn, signUp, resendConfirmation, requestPasswordReset, updatePassword, signOut
    login/ cadastro/ verificar-email/ recuperar-senha/ redefinir-senha/
  auth/confirm/route.ts           # links dos e-mails: ?code= (padrão Supabase) e ?token_hash=&type= (template próprio)
  onboarding/                     # cadastro pós-e-mail: etapa 1 loja + WhatsApp, etapa 2 CPF/CNPJ + endereço → /contas
                                  # (contas antigas sem dados de cobrança caem aqui só na etapa 2)
  (app)/                          # área logada: sidebar shadcn (collapsible="icon"), header, avisos, tour
    layout.tsx                    # requireOnboardedContext + menu com cadeados (decideSectionAccess)
    actions.ts                    # completeTour
    painel/ perguntas/ resultados/ assistente/ contas/ assinatura/ configuracoes/   # cada page chama requireSection(...)
    pos-venda/ (+ agente/)        # caixa de entrada do pós-venda e configuração do agente (Pro, Escala e teste grátis)
    melhorias/ (+ [id]/)          # Melhorias de anúncio (Pro/Escala/teste): anúncios com mais perguntas, analisar, análise
    melhorias/actions.ts          # analyzeListing (gasta 1 da cota), setSuggestionDone
    clientes/ (+ [id]/)           # CLIENTES (Sessão 28, todos os planos): lista (números, busca ?q=, filtro, ordem, 50/página,
                                  # avisos de importação) e ficha (compras por pack, perguntas, conversas, observações)
    clientes/actions.ts           # saveCustomerNote (qualquer membro), retryCustomerImport ("Tentar de novo")
    pos-venda/actions.ts          # sendReply (FormData com anexos), generateSuggestion, refreshFromMl, retryWithAgent,
                                  # archive/restoreConversation, syncConversations, setAgentEnabled, updateAgentSettings,
                                  # add/deleteAfterSaleExample, testAfterSaleAgent
    resultados/actions.ts         # updateAssumptions (premissas da economia; só dono/admin)
    perguntas/actions.ts          # answerQuestion (+ensinar), generateSuggestion, ignoreQuestion, restoreQuestion,
                                  # retryWithAi, syncQuestions
    assistente/actions.ts         # setAutoReply, saveSetupStep, saveProfileAnswer, copySetupFrom, updateStyle,
                                  # updateExtraInfo, add/removeBlacklistItem, add/update/deleteExample, testAssistant
  (legal)/termos, (legal)/privacidade            # RASCUNHOS (revisar com advogado antes do lançamento)
  api/ml/oauth/start/route.ts     # inicia OAuth ML: state + PKCE S256, cookie httpOnly criptografado (10 min)
  api/auth/callback/mercadolivre/route.ts  # retorno do OAuth (URL cadastrada no app ML): valida state/usuário,
                                  # troca code+verifier, /users/me, connectMlAccount
  api/webhook/mercadolivre/route.ts        # webhook ML: valida topic/application_id, 200 NA HORA (sem banco; o ML exige
                                  # até 500 ms) e depois, em after(): conta, registra, processa. Loga cada pergunta/mensagem
  api/webhook/abacatepay/route.ts # webhook da AbacatePay (assinaturas): confere segredo/assinatura, processa e responde
                                # (200 ok/repetido/ignorado, 401 origem errada, 500/503 = a AbacatePay tenta de novo)
  (app)/assinatura/actions.ts   # subscribeToPlan (devolve a URL da página de pagamento), changePlan, cancelMySubscription
  admin/billing-actions.ts      # registerAbacateWebhook, refreshAbacateCatalog, adminCancelSubscription; tela admin/(painel)/cobranca
  api/cron/questions/route.ts   # Vercel Cron 1/min (só em produção; Bearer CRON_SECRET): runQuestionRounds = busca as
                                # perguntas novas no ML a cada ~10 s por ~50 s + fila de novas tentativas (maxDuration 120)
  api/cron/pos-venda/route.ts   # fila do pós-venda (1/min) + a cada 15 min não lidas e conferência (Bearer CRON_SECRET)
  api/cron/clientes/route.ts    # aba Clientes (1/min, Bearer CRON_SECRET): runCustomerSync = importação + conferência + cidades
  api/pos-venda/anexo/route.ts  # abre anexos das conversas (token do ML só no servidor; confere plano e conversa)
components/
  ui/                             # shadcn (não editar à toa; regenerar com a CLI)
  app/                            # app-sidebar (botão de recolher no topo da própria barra), nav-user, app-header (só no
                                  # celular), account-notices (avisos no topo: conta ML e pausa geral),
                                  # trial-status + trial-ring (teste grátis no rodapé do menu e no topo do celular),
                                  # welcome-tour (tour de 4 passos com imagens de public/tour), page-header...
  perguntas/                      # inbox-tabs, inbox-list (toolbar + linhas agrupadas por dia + rodapé de página),
                                  # inbox-row-link, question-detail, answer-composer, question-menu,
                                  # question-search (next/form), live-refresh, sync-button
  painel/question-cards.tsx       # cards do Painel: Esperando você, Últimas perguntas, Anúncios mais perguntados
  pos-venda/                      # conversation-list (abas, toolbar, linhas), conversation-detail (venda, histórico, avisos),
                                  # reply-composer (anexos, sugestão, ensinar), conversation-menu, agent-status,
                                  # agent-settings-form, after-sale-examples, agent-test-panel, summary-card, sync-button
  resultados/                     # impact-hero (economia), kpi-cards, daily-chart / speed-chart (shadcn chart = Recharts),
                                  # hours-heatmap (grade dia × hora), top-items-card, topics-card, improve-card,
                                  # assumptions-dialog, period-toggle
  assistente/                     # setup-wizard, question-input, style-fields/style-form, knowledge-view,
                                  # edit-answer-dialog, extra-info-form, prompt-preview-dialog, examples-manager,
                                  # blacklist-manager, test-panel, assistant-status, how-it-works
  app/account-select.tsx          # seletor de conta (?conta=), com "Todas as contas" opcional
  billing/billing-profile-form.tsx # dados de cobrança (cadastro e Configurações): CPF/CNPJ com confirmação, CEP automático
  brand/logo.tsx (+ logo-paths.ts) # LogoWordmark ("maanu.") e LogoMark ("m.") em SVG; letras = cor do texto, ponto teal
  site/                           # PÁGINA DE VENDAS (Sessão 25): site-header (vidro grafite ao rolar; menu do celular em
                                  # mobile-menu.tsx, Sheet carregado só no toque; links em nav.ts),
                                  # hero + hero-demo (pergunta → leitura do anúncio → resposta, cronômetro e certeza; pausa
                                  # fora da tela), question-ticker, problem-section + buyer-race, how-it-works,
                                  # listing-reading, certainty-section, daily-routine + routine-previews ("no dia a dia":
                                  # lista com abas do shadcn que avança sozinha + telas da maanu desenhadas em código),
                                  # savings-calculator, pricing-section (SELLABLE_PLANS, só mensal), faq-section (FAQ também
                                  # vira dados estruturados), final-cta + time-on-page, site-footer, mobile-cta-bar,
                                  # reveal + use-in-view,
                                  # site-button (TODOS os botões da página: mesmas medidas, espaço igual dos 2 lados da seta)
  auth/ onboarding/ contas/ configuracoes/ legal/ forms/
lib/
  config/site.ts                  # nome da marca, dias de teste, versão dos termos, marketingUrl e companyInfo (CNPJ, contatos)
  site/host.ts                    # SALES_PAGE_PATH ("/institucional" por enquanto) + siteHostRouting: página de vendas ×
                                  # endereço do app (APP_HOST) + appHref + isIndexableHost (puro, testado)
  site/calculator.ts              # calculadora da página de vendas (mesma conta de Resultados) e R$/dia (puro; não indica plano)
  site/seo.ts                     # SEO da página de vendas: SALES_PAGE_INDEXABLE (false em /institucional), SALES_PAGE_URL,
                                  # título, descrição, imagem (public/og/), robôs liberados, caminhos
                                  # privados, dados estruturados (JSON-LD) e llms.txt (puro, testado). SITE_CONTENT_UPDATED =
                                  # data da última mudança de conteúdo (sitemap/llms.txt): atualizar ao mexer nos textos
  site/faq.ts                     # perguntas e respostas das Dúvidas (página, FAQPage e llms.txt usam a mesma lista)
  env.ts                          # leitura de env obrigatória (server-only)
  access/access.ts                # computeAccess (trial/active/blocked) + decideSectionAccess (puro, testado)
  access/notices.ts               # trialNotice + mlConnectionNotice: quando e o que os avisos mostram (puro, testado)
  dal/app-context.ts              # getCurrentUser, getAppContext (cache por request), requireSection, canManageOrganization
  validation/forms.ts             # schemas zod, WhatsApp BR, safeRedirectPath, FormState
  validation/billing.ts           # parseBillingProfile (com/sem documento) + mensagens de erro da gravação
  billing/documents.ts            # CPF/CNPJ (inclusive alfanumérico), máscaras, CEP, UFs (puro, testado)
  billing/cep.ts                  # busca de CEP no navegador (ViaCEP → BrasilAPI)
  billing/copy.ts                 # textos do formulário: cadastro ("titular da conta", sem cobrança) × Configurações
  dal/billing.ts                  # getBillingProfile (RLS) + saveBillingProfile (service role; documento nunca muda)
  security/crypto.ts, keys.ts     # AES-256-GCM com AAD + chaves ML_TOKEN_ENCRYPTION_KEY e AI_KEYS_ENCRYPTION_KEY (aiKeysEncryption)
  mercadolivre/pkce.ts, oauth.ts, oauth-cookie.ts, api.ts, accounts.ts   # OAuth v2 + tokens (lease de refresh)
  mercadolivre/client.ts        # mlRequest(accountId, path): token válido + erros tipados (401 → token inválido)
  mercadolivre/questions.ts     # pergunta, item, descrição, perguntas respondidas do anúncio, POST /answers, sync
  mercadolivre/images.ts        # mlImageUrl: foto do ML sempre https (o ML devolve http; o next/image só aceita https)
  mercadolivre/item.ts          # summarizeItem (tudo o que a IA lê do anúncio: condições de venda, ficha, variações,
                                #   medidas, catálogo, descrição) + htmlToText/truncateMiddle (puro, testado)
  answers/notification.ts       # parseQuestionNotification (puro)
  answers/compose.ts            # composeAnswer, containsExternalContact, stripAffixes, parseItemId (puros)
  answers/decision.ts           # decideAnswer (modos careful/always + mensagem padrão), retryDelayMs, rótulos, níveis e tons (puro)
  answers/prompt.ts             # buildSystemPrompt/buildMessages (travas da v1) + JSON Schema da saída da IA (puro)
  answers/examples.ts           # rankTaughtExamples: respostas ensinadas mais parecidas com a pergunta (puro)
  answers/context.ts            # assistantBase (nome/tom/conhecimento/regras da conta) + loadTaughtExamples
  assistant/questions.ts        # roteiro da configuração guiada (19 passos, 7 seções; ids estáveis)
  assistant/profile.ts          # validar/ler store_profile e compilar o "conhecimento da loja" (puro, testado)
  questions/presentation.ts     # status → cor/rótulo, abas, resumo da linha, estado da URL de /perguntas (inboxHref,
                                # filtros/ordem/página), ranking de anúncios (puro, testado)
  answers/ai.ts                 # runAnswerModel (OpenAI)
  answers/model.ts              # modelo padrão (gpt-6-luna) e parâmetros por modelo (puro, testado)
  answers/engine.ts             # processQuestion, processDueQuestions, reconcileQuestion, suggestAnswer, sendManualAnswer
  answers/ingest.ts             # registerQuestion, syncUnansweredQuestions
  answers/poll.ts               # runQuestionRounds: rotina de segurança do cron (não depende da notificação do ML)
  answers/polling.ts            # pollingOffsets (rodadas no minuto), accountsThisMinute (rodízio acima de 100 contas), teto de 100 consultas/min, unknownQuestions (puro, testado)
  dal/dashboard.ts              # números do painel (question_stats) + listas Esperando você / Últimas / Anúncios
  dal/results.ts                # Resultados: rpc analytics_overview + amostra de textos (assuntos) + premissas
  results/metrics.ts            # Resultados (puro, testado): período, economia, fator de velocidade, horário comercial e
                                # espera evitada, série diária, distribuição de velocidade, assuntos por palavra-chave
  results/format.ts             # R$, horas, dias de trabalho, variação
  (app/admin/(painel)/chaves-ia/: page.tsx + actions.ts (cadastrar, testar, usar, reserva, desativar, remover);
   components/admin/ai-key-add-dialog.tsx e ai-key-actions.tsx)
  admin/                          # PAINEL DO ADMINISTRADOR (puro, testado em tests/unit/admin.test.ts): session (regra da
                                  #   2ª etapa, espelho de admin_assert), host (subdomínio ADMIN_HOST e links), labels, format,
                                  #   finance (MRR, projeção, margem), schemas (formulários), csv (sem injeção), types (JSON do banco)
  ai/pricing.ts                   # preço por modelo (US$/1M tokens) + custo de cada chamada (puro, testado)
  ai/usage.ts                     # trackedCompletion: pausa geral + chave em uso + troca para a reserva no 401 (repete 1 vez)
                                  #   + registro em ai_usage_events com a chave usada (toda chamada à OpenAI)
  ai/keys.ts                      # CHAVES DE IA (puro, testado em tests/unit/ai-keys.test.ts): limpar a chave colada, final
                                  #   (sk-proj-…a1b2), contexto da criptografia, mascarar chaves em erros, erros da OpenAI
  ai/key-crypto.ts                # criptografa/abre a chave (id da linha no AAD) + impressão digital (HMAC, subchave HKDF)
  ai/key-store.ts                 # qual chave usar (painel → OPENAI_API_KEY), 1 min de memória, cliente OpenAI por chave,
                                  #   aviso de chave recusada (rpc ai_key_report_invalid), leitura para o painel testar
  ai/key-check.ts                 # teste real da chave (resposta mínima no mesmo modelo; registrado como key_check)
  dal/admin.ts                    # requireAdmin (admin + 2 etapas recente), leituras via rpc admin_* com a sessão do admin
  plans/plans.ts                  # PLANOS (puro, testado em tests/unit/plans.test.ts): Starter/Pro/Escala (preços, limites,
                                  #   suporte), ADMIN_PLAN, TRIAL_PLAN, resolvePlan (plano em vigor), featureAccess,
                                  #   organizationIncludes, answersLimit, nextPlan, formatPrice. Espelho no banco: §6.1h
  plans/usage.ts                  # período (mês de Brasília ou teste grátis), quotaStatus (ok/aviso 80%/esgotado), periodText
  dal/plan.ts                     # countAiAnswers (rpc organization_ai_answers), answersQuotaFor (motores), getPlanUsage
                                  #   (telas, 1 vez por requisição), countListingImprovements
  listing-improvements/           # MELHORIAS DE ANÚNCIO: prompt (regras + JSON Schema), parse (valida a saída da IA, feitas),
                                  #   presentation (rótulos, efeito antes × depois) — puros e testados; ai (runImprovementModel,
                                  #   raciocínio low) e engine (cota, perguntas, anúncio, reserva, grava)
  dal/listing-improvements.ts     # ranking de anúncios + histórico; uma análise com as perguntas antes/depois
  billing/abacatepay/             # COBRANÇA (Sessão 23; puros testados em tests/unit/abacatepay.test.ts): config (variáveis,
                                  #   modo de teste, canUseTestPayments), catalog (produtos × planos pelo nome + preço, plano
                                  #   pelo valor), webhook (origem: formato antigo e Standard Webhooks; leitura tolerante),
                                  #   decide (o que cada evento faz); client (API v2, só servidor) e catalog-store (5 min)
  billing/engine.ts               # startCheckout, requestPlanChange, cancelOrganizationSubscription, processWebhookEvent
  billing/subscription.ts         # planIntent (assinar/trocar/assinar de novo/atual), isUpgrade, textos (puro, testado)
  dal/subscription.ts             # estado da tela Assinatura (assinatura, último pagamento, produtos disponíveis)
  dal/admin-billing.ts            # painel → Cobrança (rpc admin_billing_overview/admin_organization_billing + AbacatePay)
  after-sale/                     # PÓS-VENDA (puro e testado, salvo engine/ai): text (latin1, 350 caracteres, assinatura),
                                  #   conversation (páginas do ML, pendentes, pack, não lidas, destinatário/agente do ML, erros,
                                  #   motivos de bloqueio), order (venda/envio → resumo da tela e texto da IA), decision
                                  #   (assuntos, política de delicados, certeza, decideAfterSale), prompt, notification
                                  #   (tópico messages), presentation (abas, tons, URL, busca, atraso), ai (runAfterSaleModel),
                                  #   engine (fila, sync com o ML, envio, manual, sugestão, teste, não lidas, conferência)
  mercadolivre/messages.ts        # mensagens pós-venda (páginas, detalhe, não lidas, enviar, anexos), packs/vendas, envio
  dal/after-sale.ts               # números do cartão Pós-venda do Painel
  customers/                      # CLIENTES (puros e testados em tests/unit/customers.test.ts, salvo engine): orders (venda do ML →
                                  #   ingest, buyerName, PURCHASE_STATUSES, cidade/UF do envio), import (janelas de 30 dias, divisão
                                  #   acima de 9 mil vendas, offset ≤ 10 mil, conferência), notification (orders_v2), presentation
                                  #   (URL, filtros, ordens, compras por pack, observações, R$); engine (importAccount, pollAccount,
                                  #   resolveLocations, runCustomerSync, handleOrderNotification, retryFailedImport)
  mercadolivre/orders.ts          # /orders/search, /orders/{id}, /shipments/{id} (só leitura)
  dal/customers.ts                # lista, números (rpc customers_overview), sincronização e ficha do cliente
  migration/v1.ts                 # MIGRAÇÃO v1 → v2 (puro, testado em tests/unit/migration-v1.test.ts): question_jobs →
                                  #   ml_questions, training_examples → ai_examples, CNPJ fictício para testes (§6.3)
  supabase/server.ts              # createClient (sessão) + createAdminClient (legado v1, sem tipos)
  supabase/admin.ts               # createServiceClient (service role, tipado) + createStatelessAuthClient
  supabase/database.types.ts      # gerado: npx supabase gen types typescript --linked --schema public
  http/site-url.ts                # NEXT_PUBLIC_SITE_URL → URLs de retorno dos e-mails
supabase/
  config.toml, migrations/        # baseline_v1 (espelho de prod) + fundacao_v2 + respostas_v2 + assistente_ia +
                                  # perguntas_escala + resultados + dados_cobranca + modo_responder_sempre + pos_venda +
                                  # painel_admin
  tests/fundacao_rls.sql, respostas_rls.sql, resultados_rls.sql, cobranca_rls.sql, pos_venda_rls.sql, admin_rls.sql,
       ai_keys_rls.sql, clientes_rls.sql
                                  # sucesso = erro "TESTES_..._OK"
scripts/v1-para-v2/                # exportar.mjs (v1 → JSON, só GET, sem tokens) e importar.mjs (JSON → Supabase de TESTES; trava
                                  #   pelo project ref do .env.local). Saídas com dados de clientes só em docs/v2/privado/ (§6.3)
tests/unit/                       # vitest: crypto, pkce, access, forms, answers, assistant, inbox, results, billing, after-sale...
tests/integration/ai-live.test.ts # 22 cenários com a IA real; só roda com RUN_LIVE_AI=1 + OPENAI_API_KEY
tests/integration/after-sale-live.test.ts # 12 cenários do agente de pós-venda com a IA real (mesmas variáveis)
tests/integration/customers-db.test.ts # aba Clientes no banco real com o ML simulado (RUN_CUSTOMERS_DB=1; loja temporária apagada)
vercel.json                       # crons /api/cron/questions, /api/cron/pos-venda e /api/cron/clientes a cada minuto (só produção)
docs/                             # specs (superpowers/specs), db (inventário/snapshot de prod), v2 (referências),
                                  # brand (apresentação e originais da marca, guia README.md, scripts/ para regerar)
public/brand/                     # maanu-logo(.svg/.png, -branco), maanu-m(.svg, -branco), maanu-icone(.svg, -512.png)
```

---

## 5. Variáveis de ambiente

Usadas no código:

| Variável | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave anon (browser + server com cookies) |
| `SUPABASE_SERVICE_ROLE_KEY` | admin client (bypassa RLS) — só no servidor |
| `OPENAI_API_KEY` | IA: **último recurso** desde a Sessão 17 (vale quando não há chave em uso no painel Chaves de IA ou ela não abre). Nos testes com IA real (`tests/integration`) é a única usada. |
| `ML_CLIENT_ID`, `ML_CLIENT_SECRET` | app do Mercado Livre |
| `ML_REDIRECT_URI` | `https://<dominio>/api/auth/callback/mercadolivre` |

Novas na v2:

| Variável | Uso |
|---|---|
| `ML_TOKEN_ENCRYPTION_KEY` | 32 bytes base64; criptografa tokens do ML e o cookie do OAuth. **Trocar a chave invalida os tokens já gravados** (contas precisam reconectar). Prod terá chave própria. |
| `NEXT_PUBLIC_SITE_URL` | URL base para os links dos e-mails de auth (staging: `https://mlresponde-v2.vercel.app`; local: `http://localhost:3000`) |
| `OPENAI_MODEL` | opcional; padrão `gpt-6-luna`. Não existe na Vercel (verificado na Sessão 8). Para voltar ao modelo antigo sem mexer no código: `OPENAI_MODEL=gpt-4o-mini` (modelos `gpt-4*`/`gpt-3.5*` não recebem `reasoning_effort`). |
| `CRON_SECRET` | protege `/api/cron/questions`. **Precisa existir em Production no cutover** (o cron só roda em produção). |
| `AI_KEYS_ENCRYPTION_KEY` | Sessão 17. 32 bytes base64; chave-mestra que tranca as chaves de IA do painel (separada da `ML_TOKEN_ENCRYPTION_KEY` de propósito). **Sensível** na Vercel: projeto `maanu` (Production) e `mlresponde` (Preview + branch `v2`), mesma nos dois e no `.env.local` (mesmo banco). Sem ela, o painel não cadastra e a IA usa a `OPENAI_API_KEY`. Perdeu ou trocou: gere outra e **cadastre as chaves de novo** (as antigas não abrem mais; nenhum outro dado é afetado). |
| `ABACATEPAY_API_KEY` | Sessão 23. Chave de API da AbacatePay (`abc_dev_...` = teste; `abc_prod_...` = produção). **Sensível**, só no projeto `maanu` (Production). Permissões: PRODUCT:READ, CUSTOMER:CREATE, SUBSCRIPTION:CREATE, SUBSCRIPTION:READ, SUBSCRIPTION:DELETE, WEBHOOK:CREATE, WEBHOOK:READ, STORE:READ. Sem ela a contratação pelo app fica "em breve". **Falta o Breno criar** (§13 item 0g). |
| `ABACATEPAY_WEBHOOK_SECRET` | Sessão 23. Segredo do webhook (≥ 32 caracteres; aleatório, criado pela IA na Vercel, `maanu` Production, sensível; ninguém sabe o valor). O painel admin → Cobrança cadastra o webhook na AbacatePay com ele. Trocar = cadastrar o webhook de novo. Sem ele o webhook responde 503 (a AbacatePay tenta de novo por ~18 h). |
| `ABACATEPAY_TEST_EMAILS` | opcional. E-mails (separados por vírgula) que podem assinar com a chave de **teste** em produção (além dos administradores da plataforma). |
| `ABACATEPAY_SUBSCRIPTION_METHODS` | opcional. `CARD` (padrão) ou `CARD,PIX` (só se a AbacatePay liberar o PIX Automático na conta). |
| `APP_HOST` | opcional (Sessão 25). Endereço próprio do app, ex.: `app.maanu.com.br`. Sem ela, `maanu.com.br/` é a página de vendas e o app continua no mesmo endereço. Com ela, o domínio principal só serve a página de vendas, `/termos`, `/privacidade`, robots/sitemap e `/api/webhook/*` e `/api/cron/*`; o resto vai (307) para o mesmo caminho e busca em `APP_HOST`, e no endereço do app `/` leva a `/painel`. Junto com ela, `NEXT_PUBLIC_SITE_URL` vira o endereço do app; `ML_REDIRECT_URI` pode ficar no domínio principal (o retorno do OAuth é redirecionado). Webhooks cadastrados fora (AbacatePay) usam `webhookBaseUrl` = domínio principal quando ela existe. **Existe desde a Sessão 27** no projeto `maanu` (Production): `app.maanu.com.br`. |
| `GOOGLE_SITE_VERIFICATION` | opcional (Sessão 25). Código da meta tag do Google Search Console (só o valor do `content`). Desnecessária se a propriedade for verificada pelo DNS (recomendado). Hoje **não** existe na Vercel. |
| `BING_SITE_VERIFICATION` | opcional (Sessão 25). Código da meta tag `msvalidate.01` do Bing Webmaster Tools. Desnecessária se o site for importado do Search Console. Hoje **não** existe na Vercel. |
| `ADMIN_HOST` | opcional (Sessão 13). Endereço próprio do painel do administrador, ex.: `admin.maanu.com.br`. Com ele, `/admin` só abre nesse endereço (no domínio do app vira 404) e o endereço só serve o painel e o login. Sem ele, o painel fica em `/admin` do próprio app. Hoje **não** existe na Vercel (sem domínio próprio). |

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

**Projeto Vercel `maanu` (Sessão 15, id `prj_soCke40253xAKpkOu3tNWT1hkmAa`)** = produção da v2: production branch
**`v2`** (definida pela API `PATCH /v9/projects/{id}/branch`), ignored build step que **só publica a `v2`**, Node 24,
região `iad1`, Standard Protection (só os domínios próprios são públicos), crons `/api/cron/clientes` (desde a Sessão 28, quando entrar na `v2`), `/api/cron/questions` e
`/api/cron/pos-venda` a cada minuto. Variáveis de **Production**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
(= chave **publishable**), `SUPABASE_SERVICE_ROLE_KEY` (= chave **secret** `maanu_servidor`), `ML_CLIENT_ID`
(`8693830632560554`), `ML_REDIRECT_URI` (`https://maanu.com.br/api/auth/callback/mercadolivre`, continua no domínio principal), `NEXT_PUBLIC_SITE_URL` (`https://app.maanu.com.br` desde a Sessão 27; antes `https://maanu.com.br`), `APP_HOST` (`app.maanu.com.br`, Sessão 27), `ML_TOKEN_ENCRYPTION_KEY` (a
mesma da staging/`.env.local`, para as duas lerem os tokens do mesmo banco), `CRON_SECRET` (novo, só na Vercel),
`OPENAI_API_KEY` (sensível) e, desde a Sessão 17, `AI_KEYS_ENCRYPTION_KEY` (sensível). **Falta `ML_CLIENT_SECRET`** (sensível: o Breno cola no painel). Domínios: `maanu.com.br`,
`www.maanu.com.br` (redireciona 308 para o sem www) e, desde a Sessão 27, `app.maanu.com.br` (CNAME no Cloudflare, DNS only; é onde o app mora). No projeto antigo `mlresponde` foi colocado um ignored build step que
só publica `main` e `v2` (outras branches pegariam as variáveis da v1).

**Chaves do Supabase da v2 (Sessão 15):** só as novas funcionam — publishable `default` e secret `maanu_servidor`; as
legadas (JWT anon/service_role) estão **desligadas** e o segredo JWT HS256 antigo **revogado** (logins assinados com ES256).
Os nomes das variáveis continuaram os mesmos (`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`), sem mudança de
código (supabase-js 2.103). Para criar/girar: Management API `/v1/projects/{ref}/api-keys`.

Variáveis da v2 na Vercel (Preview + branch `v2`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `ML_REDIRECT_URI`, `ML_TOKEN_ENCRYPTION_KEY`,
`NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`, `AI_KEYS_ENCRYPTION_KEY` (Sessão 17, sensível). `OPENAI_API_KEY` herdada da geral (não está no `.env.local`; para testar a IA
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
- **Administrador da plataforma:** `profiles.is_platform_admin = true` → passa por todos os bloqueios de seção
  (`decideSectionAccess`), aparece o selo "Admin" e o item "Painel do administrador" no menu do usuário e abre o
  **painel do administrador** (`/admin`, ver §6.1e). Só pode ser ligado direto no banco (service role); o painel não
  cria nem remove administradores (de propósito).

### 6.1b v2 — Respostas (migração `20261011180000_respostas_v2.sql`)

- `ml_accounts` + `auto_reply_enabled` (**começa false**), `ai_confidence_threshold` (0,75; presets 0,85/0,75/0,6),
  `answer_tone` (`cordial|profissional|descontraido`), `answer_greeting`, `answer_signature`, `store_briefing` (≤ 5000).
- `ml_questions` (1 linha por pergunta do ML, `ml_question_id` único): dados do anúncio/comprador, `status`
  `pending|processing|answered|needs_review|answered_outside|ignored|failed`, `review_reason`, rascunho/certeza/motivo/
  modelo/tokens da IA, `answer_text` + `answer_source` (`ai|manual|external`) + quem/quando, fila (`attempts`,
  `next_attempt_at`, `locked_until`, `last_error`). Realtime ligado.
- `ai_examples` (respostas ensinadas; `item_id` nulo = vale para a conta toda) e `item_blacklist` (anúncios que a IA não responde).
- **Migração `20261011210000_assistente_ia.sql` (aditiva):** `ml_accounts.store_profile` jsonb (respostas da configuração
  guiada `{ [perguntaId]: { options, text } }`, ≤ 60 KB), `store_setup_step`, `store_profile_completed_at` (nulo = mostra a
  configuração; a IA só liga depois); `ai_examples.item_title` e `updated_at`. `store_briefing` continua = "Outras informações".
- Funções: `claim_ml_question` e `due_ml_questions` (só service role), `question_stats` (security invoker, respeita RLS).
- **Migração `20261011220000_perguntas_escala.sql` (aditiva):** função `current_user_organization_ids()` (security definer,
  organizações do usuário logado) e a policy de leitura de `ml_questions` reescrita para
  `organization_id in (select current_user_organization_ids())` — **mesma regra**, mas o conjunto é calculado uma vez por
  consulta (antes `is_org_member` rodava uma subconsulta por linha; contagem de 1.500 perguntas caiu de ~20 ms para ~2 ms).
  Índices `(organization_id, question_created_at desc nulls first, created_at desc)` (ordem da caixa de entrada) e
  `(organization_id, item_id)` (filtro por anúncio). Realtime e testes de RLS conferidos depois da mudança.
  (Os tipos em `database.types.ts` não mudaram: a função nova não é chamada pelo TypeScript.)
- **Migração `20261011230000_resultados.sql` (aditiva):** `organizations.analytics_minutes_per_answer` (padrão 3, 0,5–60) e
  `analytics_hourly_cost` (padrão 20, 1–10.000) = premissas da economia (só o servidor grava). Função
  `analytics_overview(org, from, to, conta?)` → JSON com totais do período e do período anterior, série diária, faixas de
  tempo de resposta, mapa dia × hora, top 8 anúncios, causas (IA sem rascunho / com rascunho / sem análise) e total
  histórico da IA. `security invoker` (RLS), `execute` só para `authenticated`. Testada em `supabase/tests/resultados_rls.sql`.
- **Migração `20261011235500_modo_responder_sempre.sql` (aditiva):** `ml_accounts.answer_mode` (`careful` padrão | `always`)
  e `fallback_answer` (≤ 1000; vazio = mensagem padrão do sistema); `ml_questions.fallback_reason`
  (`ai_escalated|low_confidence|unsafe_answer|answer_too_long`, nulo) — preenchido = a resposta enviada foi a mensagem padrão.

### 6.1c v2 — Dados de cobrança (migração `20261011235000_dados_cobranca.sql`, aditiva)

- `billing_profiles` (1 por organização; `organization_id` PK/FK `on delete cascade`): `document_type` (`cpf|cnpj`),
  `document` (sem pontuação, maiúsculas; **único** + CHECK `is_valid_tax_document`, que valida CPF e CNPJ numérico ou
  alfanumérico), `legal_name` (nome completo / razão social), `postal_code` (8 dígitos), `street`, `address_number`,
  `complement`, `district`, `city`, `state` (27 UFs), `registered_by`, `created_at` (= data do vínculo), `updated_at`.
- **Documento imutável:** trigger `protect_billing_document` recusa trocar `document`/`document_type`/organização até
  para o service role (`BILLING_DOCUMENT_LOCKED`). Correção pelo suporte só em SQL:
  `begin; set local app.allow_billing_document_change = 'on'; update public.billing_profiles set document = '...' where organization_id = '...'; commit;`
- RLS: navegador só lê, e só dono/administrador (`current_user_managed_organization_ids()`, security definer); membro
  comum não vê o CPF do dono. Escrita só pelo servidor. Testado em `supabase/tests/cobranca_rls.sql`.
- `getAppContext` traz `billing: { required, completed }` (embed `billing_profiles(organization_id)` na consulta da
  organização); `needsOnboarding` manda para `/onboarding` quem administra a loja e ainda não tem os dados (admin da
  plataforma dispensado).

### 6.1d v2 — Pós-venda (migração `20261011235900_pos_venda.sql`, aditiva)

- Função `plan_includes_after_sale(plan)` (desde a Sessão 20: `pro`/`escala`/`admin`/`trial`; espelho de `lib/plans/plans.ts`) e
  `current_user_after_sale_organization_ids()` (security definer): o RLS das 3 tabelas novas exige ser membro **e** o plano.
- `ml_accounts` + `after_sale_enabled` (**começa false**), `after_sale_instructions` (≤ 4000), `after_sale_confidence_threshold`
  (0,85), `after_sale_sensitive_policy` (`review` padrão | `guide`), `after_sale_signature` (≤ 80).
- `ml_conversations` (1 por venda/pack e conta, `unique (ml_account_id, pack_id)`, `pack_id` só dígitos): comprador, produto,
  `order_summary` jsonb (itens, valores, pagamento, envio — sem endereço), colunas do envio (`shipping_status`, rastreio,
  `estimated_delivery_at`…), `ml_status`/`ml_substatus`/`claim_open`/`max_message_length`, `status`
  (`pending|processing|failed|needs_review|answered|blocked|archived`), `review_reason`, última mensagem, `pending_count`,
  `awaiting_since`, campos `ai_*` (inclui `ai_topic`), fila (`attempts`, `next_attempt_at`, `locked_until`,
  `resync_requested`), `synced_at`. Realtime ligado.
- `ml_conversation_messages` (`unique (conversation_id, ml_message_id)`; `local:<uuid>` = enviada por nós, ainda sem id do ML),
  `sender` buyer/seller, `source` buyer/ai/manual/external, anexos jsonb, status/moderação do ML.
- `after_sale_examples` (respostas ensinadas do pós-venda). Funções `claim_ml_conversation`/`due_ml_conversations` só service role.
- Testado em `supabase/tests/pos_venda_rls.sql` (organização sem o plano não lê nem as próprias conversas).

### 6.1e v2 — Painel do administrador (migração `20261012120000_painel_admin.sql`, aditiva)

- `ai_usage_events` (1 linha por chamada à OpenAI: organização, conta ML, função `question_answer|question_suggestion|
  assistant_test|after_sale_answer|after_sale_suggestion|after_sale_test`, modelo, tokens de entrada/cache/saída/raciocínio,
  `cost_usd` calculado na hora por `lib/ai/pricing.ts`, sucesso/erro, latência, pergunta/conversa). Histórico começa na
  Sessão 13 (sem backfill). Só o servidor grava (`trackedCompletion` em `lib/ai/usage.ts`, usado por `runAnswerModel` e
  `runAfterSaleModel`, que agora recebem o contexto de uso; `null` só nos testes com a IA real).
- `platform_settings` (linha única): `ai_paused` (+ motivo/quando/quem) = **pausa geral da IA** (nenhuma chamada à
  OpenAI sai; perguntas/conversas vão para o vendedor com `auto_reply_off`; aviso âmbar no app do cliente),
  `usd_brl_rate` (padrão 5,50) e `monthly_fixed_costs_brl`.
- `admin_audit_log` (só inclusão: trigger recusa UPDATE/DELETE/TRUNCATE até para o service role) e
  `admin_organization_notes` (notas internas; cliente não lê). `organizations.monthly_price` (mensalidade em R$, base do
  MRR até existir gateway) e `profiles.last_seen_at` (último uso do app, gravado no máximo a cada 15 min com `after()` em
  `getAppContext`; **usuário ativo** = `greatest(last_seen_at, last_sign_in_at)` no período). Índice BRIN em
  `ml_questions(created_at)`.
- Tabelas novas: RLS ligado e **nenhuma** policy/privilégio para anon/authenticated. O painel lê e altera **só** pelas
  funções `admin_*` (security definer, `execute` para authenticated), e **toda** começa com `admin_assert()`: confere no
  banco, pelo JWT verificado, `auth.uid()` + `is_platform_admin` + `aal = 'aal2'` + método `totp` há até 12 h (43.200 s).
  Leitura: `admin_overview`, `admin_list_organizations` (busca/filtros/ordem/página, até 5.000 para o CSV),
  `admin_organization_detail`, `admin_ai_usage(from, to)`, `admin_finance`, `admin_operations`, `admin_list_audit`.
  Escrita (gravam o histórico na mesma transação, com antes/depois só do que mudou, IP e navegador):
  `admin_update_organization` (só name, plan, subscription_status, trial_ends_at, current_period_end, billing_exempt,
  ml_accounts_limit, monthly_price), `admin_set_organization_notes`, `admin_update_profile` (full_name, whatsapp),
  `admin_pause_ml_account` (só **desliga**; religar é do cliente), `admin_update_platform_settings`, `admin_log_event`
  (ações feitas na API do Supabase Auth: e-mail, confirmação, link de senha, bloqueio, exportação). Internas sem execute
  externo: `admin_org_rows`, `admin_write_audit`, `admin_org_status`, `admin_org_stage`.
- Testado em `supabase/tests/admin_rls.sql` (anon, cliente com 2 etapas, admin sem 2 etapas e com código de 13 h atrás são
  barrados; funções internas e tabelas fechadas; alterações auditadas; histórico imutável).

### 6.1f v2 — Reforço de segurança (migração `20261012231651_reforco_seguranca.sql`, Sessão 15)

- Tabelas herdadas da v1 pela baseline (`question_jobs`, `ml_credentials`, `knowledge_base`, `training_examples`): vazias e
  sem uso na v2; agora **sem nenhum acesso** para `anon`/`authenticated`, sem a policy "Autenticados podem ver tudo" e
  `question_jobs` fora do Realtime. (Não foram apagadas; dá para remover depois numa migração própria.)
- `rls_auto_enable()` sem EXECUTE para `public/anon/authenticated` (só o gatilho de evento a usa).
- **Privilégios padrão:** tabela, sequência ou função criada por migração (`postgres`) no `public` **não** recebe mais acesso
  automático de `anon`/`authenticated` (e função nova não fica executável por `public`). **Toda migração nova precisa de
  `grant` explícito** (ex.: `grant select on table ... to authenticated;` / `grant execute on function ... to authenticated;`);
  sem isso a função falha fechada com erro de permissão. `service_role` continua com acesso total.

### 6.1g v2 — Chaves de IA (migrações `20261013012212_chaves_ia.sql` e `20261013015035_chaves_ia_trava.sql`, Sessão 17)

- `ai_provider_keys`: `id` (gerado pelo servidor; entra no AAD da criptografia), `provider` (`openai`), `label`,
  `key_ciphertext` (AES-256-GCM `v1.iv.ct.tag`), `key_hint` (`sk-proj-…a1b2`), `key_fingerprint` (HMAC-SHA256 hex, único
  por provedor = sem cadastro repetido), `status` `active|standby|disabled` (**no máximo 1 `active`**: índice único
  parcial), motivo/data de desativação, último teste (`last_checked_at/ok/error`), quem cadastrou.
- RLS ligado, **nenhuma** policy e nenhum privilégio para anon/authenticated (de propósito: nem o admin lê a tabela direto);
  `service_role` só **SELECT** (o servidor lê a chave em uso). Escrita só pelas funções: `admin_add_ai_key`,
  `admin_set_ai_key_status` (tirar a em uso promove a reserva mais nova), `admin_record_ai_key_check`, `admin_delete_ai_key`
  (recusa a em uso) — todas com `admin_assert()` e histórico `ai_key.*` —, leitura `admin_list_ai_keys` (sem o conteúdo
  criptografado; uso de 30 dias por chave e da variável, últimos eventos) e `ai_key_report_invalid` (**só service role**:
  401 da OpenAI → desativa a em uso e promove a reserva; no máximo 1 troca automática a cada 10 min, contada no histórico;
  a trava pode ser encurtada só dentro de uma transação de teste com `app.ai_key_switch_cooldown_seconds`).
  `ai_keys_promote_standby` é interna. Grants explícitos de `execute` para `authenticated` nas `admin_*`.
- `ai_usage_events` + `ai_key_id` (FK, `on delete set null`) e `key_source` (`panel|env`, nulo = antes da Sessão 17);
  `feature` ganhou `key_check` (teste de chave pelo painel; CHECK recriado com os mesmos valores + 1).
- Testado em `supabase/tests/ai_keys_rls.sql` (TESTES_CHAVES_IA_OK).

### 6.1h v2 — Planos e Melhorias de anúncio (migração `20261013140000_planos.sql`, Sessão 20)

- `organizations` + `monthly_answers_limit` (nulo = limite do plano; acordo do administrador) e `billing_cycle`
  (`monthly|annual`, nulo = sem assinatura).
- Espelhos de `lib/plans/plans.ts`: `plan_includes_after_sale` (pro, escala, admin, trial), `plan_ml_accounts_limit`
  (starter 1, pro 3, escala 10, admin 10, trial 1), `organization_plan_id(plan, status, fim do teste)` (plano cadastrado ou
  `trial`). `current_user_after_sale_organization_ids()` usa o plano em vigor (o teste grátis vê o pós-venda).
- Gatilhos em `organizations`: trocar o plano sem mexer no limite de contas → limite do plano novo
  (`organizations_apply_plan_limits`); limite menor → contas ativas mais novas acima dele ficam `inactive`
  (`organizations_enforce_active_accounts`, nada é apagado).
- `organization_ai_answers(org, de, até)` (security invoker): perguntas `answered` com `answer_source = 'ai'` +
  `ml_conversation_messages.source = 'ai'` no período. Índices parciais `ml_questions_org_ai_answered_idx` e
  `ml_conversation_messages_org_ai_sent_idx`. `review_reason` (perguntas e pós-venda) ganhou `answers_limit`;
  `ai_usage_events.feature` ganhou `listing_improvement` (CHECKs recriados com os mesmos valores + 1).
- `listing_improvements` (1 linha por análise): conta/anúncio, título/foto/link, `status` `processing|ready`,
  `questions_analyzed`, período das perguntas, `result` jsonb validado ({summary, suggestions}), `done_suggestions int[]`,
  modelo, quem pediu. Índice único de `processing` por anúncio. RLS: membros leem (`current_user_organization_ids`); escrita
  só service role. `listing_question_ranking(org, desde, conta?, limite)` (security invoker): anúncios com mais perguntas.
- Painel admin: `admin_organization_usage(org, de, até)` (limite/ciclo + respostas e análises no período) e
  `admin_update_organization` aceita `monthly_answers_limit` e `billing_cycle`. Grants explícitos em tudo.
- Testado em `supabase/tests/planos_rls.sql` (TESTES_PLANOS_OK); `pos_venda_rls.sql` atualizado (B = Starter).

### 6.1i v2 — Cobrança pela AbacatePay (migração `20261014120000_cobranca_abacatepay.sql`, Sessão 23)

- `billing_subscriptions` (1 por organização, PK `organization_id`): `subscription_id` (`subs_...`, único), `customer_id`,
  `checkout_id`, `status` `active|cancelled`, `plan`, `cycle` `monthly|annual`, `amount_cents`, `method` `CARD|PIX`,
  `card_brand`/`card_last4`, `scheduled_plan`/`scheduled_at` (descer de plano na próxima cobrança), `last_payment_at`,
  `last_receipt_url`, `payment_failed_at`/`payment_failures` (cobrança recusada; some quando uma é aprovada),
  `cancelled_at`/`cancel_reason`, `provider_updated_at` (updatedAt da AbacatePay no último evento aplicado: evento mais
  velho é ignorado), `dev_mode`. É sempre a assinatura **atual**: assinatura nova substitui a linha.
- `billing_checkouts`: cada página de pagamento criada pelo app; `id` vai como `externalId` (liga o pagamento à
  organização); `status` `creating|pending|paid|failed|cancelled`, `checkout_id` (`bill_...`, único), `url`, `product_id`,
  `amount_cents`, `subscription_id` (preenchido quando pago), `dev_mode`, `error`.
- `billing_events`: 1 linha por entrega de webhook (`id` = `log_...` ou cabeçalho `webhook-id`; idempotência), `event`,
  `status` `received|processed|ignored|failed`, `note` (o que foi feito ou por que foi ignorado), `attempts`, `payload`.
- RLS: dono/administrador **lê** `billing_subscriptions` e `billing_checkouts` (`current_user_managed_organization_ids`);
  `billing_events` sem acesso pelo navegador; escrita só service role. Painel: `admin_billing_overview()` e
  `admin_organization_billing(org)` (ambas com `admin_assert()`). `getAppContext` embute
  `billing_subscriptions(status, payment_failed_at)` (aviso de cobrança recusada).
- O que vale para o app continua em `organizations` (`plan`, `subscription_status`, `billing_cycle`, `current_period_end`,
  `monthly_price`), atualizado pelo servidor a cada evento. Testado em `supabase/tests/cobranca_abacatepay_rls.sql`
  (TESTES_COBRANCA_ABACATEPAY_OK).

### 6.1j v2 — Clientes (migração `20261019120000_clientes.sql`, Sessão 28, aditiva; **já aplicada em 2026-10-19**)

- `ml_customers` (1 por conta do ML + comprador, `unique (ml_account_id, buyer_id)`): `nickname`, `first_name`, `last_name`,
  `full_name` (coluna **gerada**, para busca), `city`, `state` (UF, `^[A-Z]{2}$`), `first_order_at`, `last_order_at`,
  `purchases_count`, `total_spent`, `currency_id`, `location_pending` + `location_ml_order_id` (de qual venda ler cidade/UF e
  nome), `notes` (≤ 2.000) + `notes_updated_by`/`notes_updated_at`. **Sem e-mail, telefone, CPF/CNPJ ou endereço.**
- `ml_orders` (1 por venda, `unique (ml_account_id, ml_order_id)`): `customer_id`, `pack_id`, `buyer_id`, `status`,
  `ordered_at`, `closed_at`, `ml_last_updated` (versão mais velha não sobrescreve), `total_amount`, `paid_amount`,
  `currency_id`, `shipment_id`, `mediations_count`, `items` jsonb (≤ 10: id, título, variação, quantidade, preço).
- `ml_customer_sync` (1 por conta, PK `ml_account_id`): `status` `pending|running|done|failed`, cursor da importação
  (`import_since`, `window_from`, `window_to`, `window_offset`), `orders_imported`, início/fim, `last_polled_at`,
  `last_error`, `attempts`, `next_attempt_at`, `locked_until`. Gatilho `ml_accounts_create_customer_sync`: conta nova ganha
  a linha `pending` (reconectar não reimporta). A migração criou a linha de todas as contas que já existiam.
- Compra válida = `paid`, `partially_paid`, `partially_refunded` (`ml_order_is_purchase`, espelho de `PURCHASE_STATUSES` em
  `lib/customers/orders.ts`); compras contam **por pack**; a lista mostra só quem tem ≥ 1 compra válida.
- Funções só do service role: `ingest_ml_orders(conta, jsonb)` (lote de até 200 vendas no formato de `toIngestOrder`;
  idempotente; apelido/nome só mudam com venda tão ou mais nova; recalcula os números e a pendência de cidade) e
  `claim_customer_sync(tipo 'import'|'poll', limite, trava)` (só contas ativas, token válido e organização com acesso,
  espelho de `computeAccess`; conferência só a cada 10 min). Leitura: `customers_overview(org, conta?)` (security invoker).
- RLS só leitura por organização (`current_user_organization_ids()`) nas 3 tabelas, `GRANT select` explícito. Índices novos
  também em `ml_questions (ml_account_id, buyer_id)` e `ml_conversations (ml_account_id, buyer_id)` (ficha do cliente).
  Testado em `supabase/tests/clientes_rls.sql` (TESTES_CLIENTES_OK).

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

### 6.3 Migração de dados v1 → v2 (Sessão 14; regras em `lib/migration/v1.ts`)

Usada na importação de teste (`scripts/v1-para-v2/`) e base da migração do cutover. Nada é escrito na produção: a
exportação só faz GET e a importação recusa qualquer destino que não seja o project ref informado (testes).

| v1 | v2 |
|---|---|
| `auth.users` (e-mail/senha) | **login novo** (a senha da v1 não é copiada; no teste o e-mail é `brenosousaf13+<loja>@gmail.com`) + organização com cortesia (`billing_exempt`), `created_at` = cadastro na v1, onboarding/tour concluídos |
| `ml_credentials` | `ml_accounts` **sem tokens** (`token_status = invalid`, "Reconexão necessária", IA pausada). Tokens nunca são copiados: outro app ML, outra chave de criptografia, e usar o refresh token derrubaria a conexão da v1 (o ML troca o refresh a cada uso). No cutover o cliente reconecta. |
| `knowledge_base` (texto livre, até ~25 mil caracteres) | configuração guiada (`store_profile`) + "Outras informações" (`store_briefing`, limite 5.000) + tom/saudação/assinatura/modo. **Conversão feita por IA, à mão, por cliente** (o texto da v1 é um prompt inteiro; as travas genéricas já estão no prompt da v2 e não são repetidas). Sem o arquivo convertido, o script só leva o texto se couber em 5.000. |
| `training_examples` | `ai_examples` do **anúncio** de origem (título vindo das perguntas), sem repetidos e sem textos > 2.000 |
| `question_jobs` `done` + resposta | `answered`, fonte `ai`, modelo `gpt-4o-mini`, respondida em = `updated_at` da v1. Se a resposta tem um trecho do texto padrão de "não tenho a informação" da loja (`v1_fallback_markers` no arquivo do assistente) → `fallback_reason = ai_escalated` (violeta, "Só mensagem padrão") |
| `done` com "Respondida manualmente…" ou erro "is not unanswered" | `answered_outside`, fonte `external`, **sem texto e sem data** (a v1 não sabe; data falsa entraria no tempo de resposta de Resultados) |
| `error` / `processing` / `pending` | `needs_review` (`processing_error`, `attempts = 5`) com o motivo da v1 em `last_error` — fica em "Para responder", fora da fila |
| `manual` (rota antiga, robô pausado) | `needs_review` (`auto_reply_off`) |
| placeholder ("Buscando do Mercado Livre…", `item_id = buscando_item`) | `ignored` (arquivada), sem texto nem anúncio |

- `question_created_at` = `created_at` da v1 (chegada do webhook ≈ hora da pergunta). A v1 não guarda foto do anúncio
  (`item_thumbnail` vazio → ícone padrão) nem `buyer_id`.
- Nenhuma pergunta importada entra na fila (`due_ml_questions` só pega `pending|processing|failed`).
- Dados de clientes (exportação, assistente convertido, anotações) **só** em `docs/v2/privado/v1-para-v2/` (fora do git) e
  apagados quando o teste acaba. Formato do arquivo do assistente: ver as validações em `scripts/v1-para-v2/importar.mjs`
  (`store_profile`, `store_briefing`, `answer_tone/greeting/signature/mode`, `fallback_answer`, `ai_confidence_threshold`,
  `v1_fallback_markers`). Hoje **não há** nenhum cliente da v1 importado na staging.

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
- **Onboarding** `/onboarding` (2 etapas): (1) nome da loja + WhatsApp; (2) "Dados da conta" (titular) — pessoa física/jurídica,
  CPF/CNPJ (confirmação em `AlertDialog`; depois não muda), nome/razão social, CEP (preenche rua/bairro/cidade/UF),
  número, complemento → `onboarding_completed_at` → `/contas` com tour de 4 passos. Sem dados de cobrança (contas
  antigas), dono/admin volta para a etapa 2 em qualquer página. Membro comum e admin da plataforma pulam a etapa 2.
  Configurações tem o card "Dados de cobrança" (documento travado, endereço editável). No cadastro os textos **não falam**
  em cobrança/assinatura/nota fiscal (quem está no teste grátis estranharia); só Configurações usa essa linguagem
  (`lib/billing/copy.ts`, `variant` do formulário; teste em `tests/unit/billing.test.ts` barra essas palavras no cadastro).
- **Acesso** (`lib/access/access.ts`, checado em toda página/ação/rota): bloqueado (teste vencido sem assinatura) → só
  `/assinatura` e `/configuracoes`; sem conta ML ativa → também `/contas`; senão tudo. Cortesia (`billing_exempt`) libera.
  **Avisos** (`lib/access/notices.ts`, Sessão 18): teste grátis no rodapé do menu (+ selo no topo do celular) enquanto
  `access.state` for `trial` ou `blocked` (some com assinatura ativa ou cortesia; bloqueado vira "Seu teste grátis
  terminou"/"Pagamento pendente"/"Assinatura inativa"); conta do ML no topo do conteúdo enquanto não houver conta ativa e a
  conta não estiver bloqueada (sem nenhuma conta: "Conectar agora" abre o diálogo de conexão para dono/admin; membro comum
  vai para Contas; contas existentes mas inativas: "Ver contas"). Pausa geral da IA também aparece no topo do conteúdo.
- **Conectar ML:** `/api/ml/oauth/start` (dono/admin, não bloqueado) → ML → `/api/auth/callback/mercadolivre` →
  valida cookie/state/usuário → troca code+verifier → `/users/me` (confere `user_id`) → `connectMlAccount`:
  conta de outra org → `conflito`; mesma org → reconecta; nova → ativa (ou desativada se passou do limite).
- **Contas:** verificar conexão (usa `getValidAccessToken` com lease de refresh), ativar/desativar (limite no banco),
  desconectar (apaga tokens, mantém histórico). O token do ML **não** sai do servidor.

### 7.0b v2 — Respostas automáticas
1. ML → `POST /api/webhook/mercadolivre` → só aceita `topic=questions` e `application_id = ML_CLIENT_ID` → **200 na hora**
   (Sessão 22: nada de banco antes da resposta) → `after()`: conta conhecida (não desconectada) → `registerQuestion`
   (dedupe por `ml_question_id`) → processa a nova (ou, se repetida e em revisão, `reconcileQuestion`) + até 5 atrasadas.
   **Caminho 2 (Sessão 22), não depende do ML notificar:** o cron `/api/cron/questions` (1/min) roda `runQuestionRounds`:
   a cada ~10 s durante ~50 s, `GET /my/received_questions/search?status=UNANSWERED` (50 mais recentes) de cada conta ativa,
   com token válido e organização com acesso → registra só as que o banco não tem → `processQuestion` (até 3 juntas) →
   fila. Teto de 100 consultas ao ML por minuto (1/3 do limite do app, 18.000/h): acima de 16 contas as rodadas se espaçam e acima de 100 contas vira rodízio. Pergunta nova aparece em
   segundos pela notificação ou em ~10–20 s pela rotina.
2. `processQuestion`: `claim_ml_question` (lock 2 min) → `GET /questions/{id}` (fonte da verdade). Já respondida/apagada
   no ML → `answered_outside`/`ignored` (se o texto bate com o nosso, `answered`). Conta inativa / assinatura bloqueada /
   anúncio bloqueado / respostas pausadas → `needs_review` **sem gastar IA**. Senão: anúncio + descrição + perguntas já
   respondidas do anúncio + informações da loja + respostas ensinadas → IA → `decideAnswer`: resposta com certeza ≥
   rigor, sem contato externo e ≤ 2000 caracteres → grava `answer_text` → `POST /answers` → `answered`; senão
   `needs_review` com rascunho. **Modo "Responder sempre" (Sessão 10):** nesse "senão" a conta envia saudação + mensagem
   padrão + assinatura e grava `fallback_reason` (bloqueio, pausa, conta inativa, assinatura e erro continuam indo para o
   vendedor). Anúncio lido por `fetchItemContext`: `/items/{id}?include_attributes=all` + descrição (5xx/429/rede =
   nova tentativa; 404/4xx = sem descrição) + `/products/{catalog_product_id}` + `/catalog/charts/{SIZE_GRID_ID}` (opcionais).
3. Erros: `failed` + nova tentativa em 1/2/4/8/16 min; após 5 → `needs_review` (`processing_error`). Token inválido →
   `needs_review` (`account_inactive`).
4. Fila: webhook processa até 5 atrasadas e cada rodada do cron (a cada ~10 s) roda até 10. **Staging não tem cron.**
5. Ao conectar/reconectar conta: sincroniza as perguntas sem resposta do ML (até 200) e processa.
6. Painel do vendedor: **Perguntas** = caixa de entrada (filtros em cartões, nesta ordem desde a Sessão 22: Respondidas pela
   IA / Respondidas por você / Para responder / Todas — a tela abre no 1º, Respondidas pela IA (`DEFAULT_INBOX_TAB`); os links de "aguardando você" do Painel, Resultados e avisos usam `?aba=responder`; busca por pergunta/anúncio/código MLB, conta, lista + conversa, responder na tela com rascunho, "Sugestão
   da IA", "Ensinar a IA", "Enviar e ir para a próxima", arquivar/desarquivar, "Deixar a IA tentar de novo", ao vivo via
   Realtime, sincronizar). **Escala (Sessão 6):** no computador (≥1024 px) a página ocupa a altura da tela (mínimo 44rem)
   e lista e conversa rolam cada uma por conta própria — o layout da área logada usa `has-[[data-fill-viewport]]` no
   `SidebarInset`; o composer fica preso embaixo da conversa. 50 por página (rodapé "1–50 de 1.234"), linhas agrupadas por
   dia (cabeçalho preso), ordem pela data da pergunta (`?ordem=antigas` inverte), filtro por anúncio
   (`?anuncio=MLB…`, também muda os contadores; atalho "Todas as perguntas deste anúncio" na conversa e no Painel),
   página que deixou de existir volta para a 1. Estado na URL montado por `inboxHref` (`lib/questions/presentation.ts`).
   **Painel:** números da semana + Esperando você (5, com atalho para responder) + Últimas perguntas (6) + Anúncios mais
   perguntados (7 dias, amostra das 1.000 mais recentes) + Assinatura; "Primeiros passos" some quando tudo estiver feito. E
   **Assistente de IA** (configuração guiada na 1ª vez; depois abas Sobre a loja, Jeito de responder, Respostas ensinadas,
   Anúncios bloqueados, Testar; ligar/pausar discreto no cabeçalho). **Resultados** (Sessão 7): `?periodo=7|30|90`
   (padrão 30, a partir da meia-noite de Brasília) e `?conta=`; economia = respostas da IA × minutos ÷ 60 × custo da hora;
   tempo de resposta = mediana de `answered_at − question_created_at`, ignorando perguntas importadas ao conectar (mais de
   15 min entre a pergunta e o registro); horário comercial fixo seg–sex 8h–18h; assuntos por palavra-chave nas até 1.000
   perguntas mais recentes do período. O Painel tem o botão "Ver resultados da IA".
7. Prompt: system = travas (Regra 0 da v1 etc.) + regras do vendedor + `<CONHECIMENTO_DA_LOJA>` (compilado do
   `store_profile` + `store_briefing`) + até 12 respostas ensinadas ranqueadas por semelhança; user = anúncio + perguntas
   já respondidas no anúncio (`[MESMO COMPRADOR]` marcado) + pergunta. Quando não sabe, escala com rascunho. No modo
   `always`, a seção de escalate vira "MODO RESPONDER SEMPRE" (informação ausente → escalate vazio = mensagem padrão;
   negociação → condições do anúncio; pedido/reclamação → desculpas + "Minhas compras"; contato → "atendimento por aqui").
   A "Sugestão da IA" na caixa de entrada sempre usa o modo cuidadoso.
- Realtime no navegador: chamar `supabase.realtime.setAuth(access_token)` antes de assinar (sem isso o RLS bloqueia os eventos).

### 7.0c v2 — Pós-venda (planos Pro e Escala e teste grátis; era "Essencial" até a Sessão 20)
1. ML → webhook `topic=messages` (`actions` com `created`) → só contas cujo plano inclui pós-venda → 200 → `after()`:
   `GET /messages/{id}` → pack (`message_resources`) → `registerConversation` → `processConversation`.
   Também entram: "Sincronizar com o ML" e conexão da conta (`/messages/unread`), cron (fila 1/min; a cada 15 min não lidas
   das contas com o agente ligado e conferência das conversas esperando o vendedor há > 30 min).
2. `processConversation`: lock → relê no ML todas as páginas da conversa (`mark_as_read=false`), pack/vendas e envio → grava.
   ML bloqueou → `blocked`; sem mensagem do comprador esperando → `answered`; conta inativa / assinatura / plano /
   reclamação aberta / agente pausado → `needs_review` sem IA. Senão IA (`gpt-6-luna`, prompt próprio com Regra 0) →
   `decideAfterSale` (mudança no pedido sempre para o vendedor; delicados conforme a política; certeza ≥ 0,85; sem contato;
   ≤ 350) → envio em latin1 (no Brasil `to` = agente do ML `3037675074`, comprador como 2ª tentativa) ou `needs_review` com rascunho.
3. Chegou mensagem durante o processamento → `resync_requested` → roda de novo. Erro passageiro → 1/2/4/8/16 min.
4. Envio manual reserva a conversa por 90 s (o agente não responde junto), relê o ML antes, aceita até 5 anexos (4 MB) e pode
   ensinar o agente (`after_sale_examples`).
- Detalhes e limites: `docs/superpowers/specs/2026-10-11-pos-venda-design.md`.

### 7.0c2 v2 — Limites do plano e Melhorias de anúncio (Sessão 20)
1. Antes de chamar a IA, `processQuestion` e o pós-venda conferem `answersQuotaFor` (respostas da IA no mês de Brasília ou no
   teste grátis × `monthly_answers_limit` ou o do plano). Esgotado → `needs_review` com `answers_limit` (sem IA). O layout
   mostra o aviso a partir de 80% (`answersUsageNotice`); Painel e Assinatura mostram a barra.
2. `/melhorias`: `listing_question_ranking` (90 dias) → "Analisar" (`analyzeListing`) → `generateListingImprovement`:
   confere plano/cota (prontas + reservas de até 10 min), lê até 120 perguntas do anúncio com a resposta enviada, apaga reserva
   abandonada, cria a reserva `processing`, lê o anúncio no ML (`fetchItemContext`), chama a IA (`runImprovementModel`,
   `listing_improvement`) e grava `ready`; erro → apaga a reserva (cota não é gasta) e mostra a mensagem.
3. `/melhorias/[id]`: resumo, sugestões (Copiar texto, "Já fiz" → `setSuggestionDone`) e efeito (perguntas/semana 30 dias
   antes × depois, a partir de 7 dias).

### 7.0c3 v2 — Cobrança pela AbacatePay (Sessão 23)
1. Assinatura → botão do plano (`PlanActionButton`, intenção por `planIntent`): **assinar** → `subscribeToPlan` →
   `startCheckout` confere plano/preço/catálogo/modo de teste, reaproveita página pendente de até 30 min, cria o cliente na
   AbacatePay (CPF/CNPJ do `billing_profiles`; se recusar, segue sem), grava `billing_checkouts`, cria o checkout
   (`externalId` = id da linha, cartão, 4 tentativas a cada 2 dias) e o navegador abre a `url`.
2. Pagou → AbacatePay manda `subscription.completed` → rota confere a origem → `processWebhookEvent`: grava a entrega,
   acha a organização (assinatura guardada, checkout por id/externalId/metadata ou `GET /subscriptions/get`), decide
   (`decideBillingEvent`), confirma na API que a assinatura nova está ACTIVE, grava `billing_subscriptions` e `organizations`
   (plano, `active`, ciclo, fim do período = pagamento + 1 mês/ano, mensalidade) e marca o checkout pago. Se havia outra
   assinatura ativa (troca de ciclo/outro cartão), cancela a anterior na AbacatePay. A volta (`?pagamento=concluido`)
   atualiza a tela a cada 4 s até isso acontecer.
3. `renewed` → novo fim do período (plano pelo valor; troca agendada aplicada). `payment_failed` → aviso. `cancelled` →
   `canceled` (acesso até o fim do período; disputa corta na hora). `plan_changed` aplicada → plano pelo valor.
4. Trocar de plano no mesmo ciclo → `changePlan` → `POST /subscriptions/change-plan`; subir grava o plano novo na hora,
   descer grava `scheduled_plan`. Cancelar → `cancelMySubscription` (ou a equipe na ficha do cliente) → `POST
   /subscriptions/cancel` e o mesmo efeito do webhook.

### 7.0c4 v2 — Clientes (Sessão 28, todos os planos)
1. Conta conectada → linha `pending` em `ml_customer_sync`. Cron `/api/cron/clientes` (1/min, `runCustomerSync`, até 45 s):
   **importação** — `claim_customer_sync('import')` → `GET /orders/search?seller=&order.date_created.from/to&sort=date_desc&limit=50`
   em janelas de 30 dias, da mais nova até 365 dias atrás; cada página vai inteira para `ingest_ml_orders`. O ML ordena
   pela data de fechamento e recusa offset + limit > 10.000: janela com mais de 9.000 vendas é dividida ao meio. Até 10
   páginas por rodada (divididas entre as contas, mínimo 2) = ~500 vendas/min para uma loja. Falha: 1/2/4/8/16/30 min e,
   depois de 6 tentativas, `failed` (a tela mostra "Tentar de novo", que continua de onde parou).
2. **Conferência** (importação concluída, a cada 10 min por conta): `order.date_last_updated.from` = última − 5 min, até 4
   páginas; filtro recusado (400) → vendas criadas nos últimos 3 dias.
3. **Cidade/UF e nome** (até 60 chamadas por rodada, quem comprou por último primeiro): `GET /shipments/{id}`
   (`x-format-new`, só `destination.shipping_address.city.name` e `state.id`) e, se o cliente ainda não tem nome,
   `GET /orders/{id}` (a busca não traz `first_name`/`last_name`; `buyerName` descarta sobrenome repetido). 403/404 usa o que
   veio da outra leitura; falha passageira fica para a próxima rodada.
4. **Notificação `orders_v2`** → webhook 200 na hora → `after()`: conta → `handleOrderNotification` (`GET /orders/{id}`, só se a
   conta for a vendedora e a organização tiver acesso) → `ingest_ml_orders`. Precisa do tópico Orders ligado no DevCenter.
5. Telas leem com a sessão (RLS). Observações: `saveCustomerNote` (service role, conferindo a organização).

### 7.0d v2 — Painel do administrador (`/admin`)
1. Entrar normalmente em `/login` com o usuário admin → menu do usuário → **Painel do administrador** (ou abrir `/admin`).
   Quem não é `is_platform_admin` vai para **`/acesso-negado`** em qualquer página `/admin/*` existente (inclusive a
   verificação e a exportação CSV): mensagem de acesso restrito e botão para voltar ao painel. Essa tela exige login,
   dispensa onboarding/plano/conta ML e funciona também no `ADMIN_HOST`, sem loop. Sem sessão, continua pedindo login.
2. `/admin/verificacao`: 1º acesso = "Gerar QR code" → escanear no app autenticador (Google Authenticator, 1Password,
   Authy...) → digitar o código (o código secreto aparece para guardar). Depois, só o código de 6 números; pedido de novo a
   cada 12 h (`lib/admin/session.ts` = `admin_assert()`). 5 códigos errados em 15 min bloqueiam por 15 min. Entradas,
   cadastros e erros de código vão para a Auditoria.
3. Layout `app/admin/(painel)` (menu grafite + faixa vermelha se a IA geral estiver pausada) chama `requireAdmin()`; cada
   página, Server Action (`app/admin/actions.ts`) e a rota do CSV conferem de novo, e o banco confere a 3ª vez.
4. Ações sobre usuários usam a API de administração do Supabase Auth no servidor (trocar e-mail já confirmado, confirmar
   e-mail, `generateLink` de recuperação → link `/auth/confirm?token_hash=&type=recovery&next=/redefinir-senha` de uso único
   e 1 h, `ban_duration` ~100 anos para bloquear). Administradores da plataforma não podem ser bloqueados/editados por e-mail
   nem receber link de senha pelo painel (só pelo banco).
5. **Perdeu o celular do autenticador:** no SQL Editor do Supabase do ambiente,
   `delete from auth.mfa_factors where user_id = (select id from auth.users where email = '<email>');` e cadastrar de novo.
6. **Chaves de IA** (`/admin/chaves-ia`, Sessão 17): "Cadastrar chave" (nome + chave + "Usar esta chave agora") → Server Action
   limpa o que veio colado, recusa `sk-admin-` e repetidas, **testa na OpenAI** (`checkOpenAIKey`), criptografa e grava
   (`admin_add_ai_key`). Ações por chave: testar agora, testar e usar, testar e deixar como reserva, desativar (com
   confirmação; a reserva mais nova assume, ou a variável), remover (só fora de uso; lembra de revogar na OpenAI). Cada
   chamada da IA usa a chave em uso (1 min de memória por servidor); se a OpenAI devolver 401, a chave é desativada, a
   reserva entra e a chamada é repetida uma vez. **Girar a chave:** criar a nova na OpenAI → cadastrar com "usar agora" → ver
   "Último uso" → revogar a antiga na OpenAI → Desativar → Remover.

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

### 🔒 Segurança do Supabase da v2 (auditoria e reforço da Sessão 15, 2026-10-12)
Projeto `ookosqyfazobiwmopiix` (vai virar a produção da v2). Conferido e corrigido:
- ✅ RLS ligado em **todas** as tabelas; visitante (chave pública, sem login) recebe **401 em todas as tabelas e funções**
  (testado tabela por tabela pela API). Usuário logado comum: negado nas tabelas sensíveis (tokens do ML, histórico e notas
  do admin, uso de IA, configurações da plataforma, tabelas da v1) e no painel admin. Os 6 testes de RLS passam.
- ✅ Tabelas herdadas da v1 trancadas, `rls_auto_enable` fora da API e privilégios padrão seguros (§6.1f).
- ✅ **SSL obrigatório** nas conexões diretas ao Postgres.
- ✅ **Senha do banco (`postgres`) trocada** por uma aleatória de 48 caracteres que **não foi guardada** em lugar nenhum. Nada
  do app usa essa senha (o app fala pela API e a CLI usa "login role" temporário). Se um dia precisar dela: Supabase →
  Project Settings → Database → Reset database password.
- ✅ **Senhas de usuário:** mínimo 8 e **letras + números** (no Supabase Auth e na validação dos formulários, com aviso na tela).
- ✅ Sem buckets de Storage, Vault vazio, sem extensões extras, cadastro anônimo/telefone desligados, confirmação de e-mail
  ligada, troca de e-mail com confirmação dupla, rotação de refresh token ligada, 2ª etapa (TOTP) disponível.
- ✅ Nenhum segredo no histórico do git (busca por chaves JWT/`sb_secret`/`sk-`/tokens ML em todos os commits) e nenhum
  dado de cliente versionado (`docs/v2/privado/` fora do git).
- Aceito (avisos do Supabase que são de propósito): 18 funções `security definer` executáveis por usuário logado — as
  `admin_*` todas chamam `admin_assert()` (admin + 2ª etapa recente) e as `current_user_*`/`is_org_member` só devolvem dados
  do próprio usuário (são usadas pelo RLS). Tabelas com RLS e **sem** policy = ninguém de fora acessa (intencional).
- ⏳ **Pendente (só no plano Pro):** bloqueio de senhas vazadas (HaveIBeenPwned), tempo máximo de sessão, backups diários.
- ✅ (Sessão 15b) **Chaves trocadas:** publishable + secret `maanu_servidor`; chaves legadas desligadas (testado: a anon
  antiga recebe 401) e segredo JWT HS256 antigo revogado (o que apareceu no terminal não vale mais nada).
- ✅ (Sessão 15b) Banco limpo: sem dados de demonstração, sem a Noord Shop; só o login admin do Breno (org "Loja Maanu",
  `plan='admin'`, com o CPF dele em dados de cobrança). Histórico do admin (`admin_audit_log`) mantido (é imutável).
- ✅ (Sessão 15b) Auth: Site URL `https://maanu.com.br`; redirects `https://maanu.com.br/**` e (só durante a semana de teste)
  `https://mlresponde-v2.vercel.app/**`; localhost removido. (Sessão 27) + `https://app.maanu.com.br/**` e Site URL
  `https://app.maanu.com.br` (links dos e-mails); `https://maanu.com.br/**` mantido (e-mails antigos redirecionam).
- ✅ (Sessão 15b) **SMTP próprio** (Resend, `nao-responda@maanu.com.br`), e-mails em português aplicados
  (`node scripts/emails-auth/gerar.mjs` → PATCH `config/auth`) e limite de 30 e-mails/hora.
- ⏳ **Pendente antes de abrir para todos os clientes:** (2) **CAPTCHA no cadastro** (Cloudflare Turnstile; chave +
  código). (3) Tirar a staging dos redirects do Auth quando ela for desligada.
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

- ✅ (v1, 2026-10-13, Sessão 21, commit `bf56777` na `main`) **Toggle "Automação de Respostas" agora pausa de verdade.**
  Detalhes no diário da Sessão 21. Texto original do problema:
  **Toggle "Automação de Respostas" não funciona em produção.** A checagem de `auto_reply_enabled` foi adicionada
  (commit `d50544e`) só em `app/api/process/route.ts`, rota legada que ninguém chama desde `4665c5c`. O webhook usa
  `lib/mercadolivre/workflow.ts`, que **sempre responde**. Cliente que "pausa o robô" continua tendo respostas automáticas.
- **Vazamento entre lojas em `question_jobs` (✅ CONFIRMADO em 2026-10-11).** A policy de prod é
  `auth.role() = 'authenticated'` para ALL: qualquer usuário logado pode ler, alterar e apagar perguntas/respostas
  de todas as lojas usando a chave anon (o filtro do Realtime é escolhido pelo browser). `knowledge_base`,
  `training_examples` e `ml_credentials` estão isoladas por `auth.uid() = user_id`.
- **OAuth sem `state` + upsert por `seller_id` sobrescreve `user_id`.** Um usuário pode "tomar" uma conta ML já
  vinculada a outro usuário ao conectá-la; também há risco de CSRF no fluxo de conexão.

### 🟠 P1
- ✅ (v2, 2026-10-13, Sessão 22) **Pergunta do comprador só aparecia depois de "Sincronizar com o ML"** (1º cliente real).
  O ML não entregou ao app da v2 **nenhuma** notificação da conta do cliente (entregou ao app da v1, ainda autorizado); a
  maanu dependia 100% da notificação. Agora o cron busca as perguntas no ML a cada ~10 s (`lib/answers/poll.ts`) e o
  webhook responde 200 antes de tocar no banco (regra dos 500 ms do ML). Causa do lado do ML ainda não confirmada (§13 0f).
- ✅ (v2, 2026-10-13, Sessão 22) **Foto do anúncio quebrada** em Perguntas/Painel: o ML devolve `thumbnail` com `http://` e o
  `next/image` só aceita `https://*.mlstatic.com` (`/_next/image` → 400). `mlImageUrl` troca para https ao gravar e ao mostrar.
- ✅ (v2, 2026-10-12, Sessão 17) **Cadastro da verificação em 2 etapas quebrava a tela** ("This page couldn't load") ao clicar
  em "Gerar QR code": o QR que o Supabase devolve termina em quebra de linha e o `next/image` passou a recusar `src` com
  espaço no fim. Corrigido com `trimEnd()` em `app/admin/verificacao/actions.ts` (afetava qualquer admin novo ou quem
  refizesse o autenticador). Conferido no navegador.
- ✅ (v2, 2026-10-12, Sessão 17) Tabelas largas do painel admin esticavam a página para fora da tela: `SidebarInset` do
  painel com `min-w-0` (a tabela rola dentro do cartão). Conferido em 1440 e 390 px.
- ✅ (v2, 2026-10-12, Sessão 14) **Loop de redirecionamento no login** (`ERR_TOO_MANY_REDIRECTS`): usuário apagado ou
  **bloqueado pelo painel do administrador** com sessão ainda no navegador. O `proxy.ts` só confere a assinatura do JWT
  (`getClaims`) e mandava /login → /painel, enquanto a página (`getUser`) mandava de volta para /login. Agora, nas telas
  de visitante, o proxy confirma no Auth (`getUser`) e limpa a sessão inválida. Reproduzido e conferido localmente.
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
- ✅ (v2, 2026-10-14, Sessão 24) **Cliente comum via o 404 padrão em inglês ao abrir links do administrador.**
  `getAdminIdentity` agora redireciona para uma tela própria de acesso restrito; a exportação CSV usa `requireAdmin`
  e segue o mesmo fluxo. Nenhum dado administrativo é consultado antes da validação da permissão.
- (v2, visto na Sessão 18, não corrigido) Links com cara de botão `outline` montados com `className={buttonVariants(...)}`
  **sem `cn(...)`** ficam sem borda (o `cva` junta `border-transparent` e `border-border` e o primeiro vence). Aparece em 7
  lugares (Resultados, Perguntas, Pós-venda e painel admin). Correção: `className={cn(buttonVariants({ ... }))}`.
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
- ⚠️ **Sessão 15b:** este projeto virou **produção**; a demonstração abaixo e a "Noord Shop" foram **apagadas** (sobrou só o
  login admin do Breno, org "Loja Maanu"). Texto mantido como histórico.
- **Admin de testes (2026-10-11):** login do Breno `brenosousaf13@gmail.com` (senha só com o Breno — nunca registrar aqui)
  com `is_platform_admin`, organização **"Loja Demonstração"** (`billing_exempt`, `plan='admin'`, até 10 contas ML) e
  conta ML **fictícia** `LOJA_DEMONSTRACAO` (`ml_user_id 999000000001`, sem tokens) + 12 perguntas, 2 respostas ensinadas
  e 1 anúncio bloqueado de exemplo (ids `MLB99900000xx`, `ml_question_id 9991000000xx`). **Sessão 7:** + 386 perguntas de
  histórico (90 dias, todas já respondidas ou arquivadas, `ml_question_id` 9994000000000–9994000000385, anúncios
  `MLB9990000001`–`08`) para a tela Resultados ter números; apagar só elas:
  `delete from ml_questions where ml_question_id between 9994000000000 and 9994000000385`. Serve para ver as telas; ações
  que falam com o ML falham nessa conta ("sem tokens"). Para apagar a demonstração: excluir a conta ML fictícia (as
  perguntas/exemplos/bloqueios saem em cascata). A conta "Noord Shop" (Gmail, criada pelo Breno) também é dele.
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

**Cutover (troca sem perda)** — ⚠️ **SUPERADO na Sessão 15:** a v1 será descontinuada e o projeto Supabase da v2 vira a
produção (sem migrar dados nem aplicar migrações no banco da v1). O plano atual está em §13 (item 0a). Histórico abaixo:
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
- ✅ **2b. Assistente de IA + caixa de entrada de Perguntas** — implementado em 2026-10-11 (spec
  `2026-10-11-assistente-ia-design.md`). Pendências: feedback do Breno nas perguntas da configuração; no cutover, levar a
  `knowledge_base` da v1 para "Outras informações" e os `training_examples` para respostas ensinadas.
- ✅ **2c. Dados de cobrança no cadastro** (CPF/CNPJ + endereço) — implementado em 2026-10-11 (spec
  `2026-10-11-dados-cobranca-design.md`). Base para o sub-projeto 4 (gateway e nota fiscal leem `billing_profiles`).
- ✅ **3a. Pós-venda com IA** (primeiro módulo do sub-projeto 3; desde a Sessão 20 nos planos Pro e Escala) — implementado em 2026-10-11
  (spec `2026-10-11-pos-venda-design.md`). Pendências: teste com conta ML real com venda; reclamações/mediações pela API de
  claims; números do pós-venda em Resultados; definir se o teste grátis inclui o pós-venda.
- ✅ **3b. Melhorias de anúncio** (Pro e Escala) e ✅ **4a. Planos e limites** (Starter/Pro/Escala, teste grátis, contador de
  respostas, avisos, Assinatura nova, painel admin) — Sessão 20 (spec `2026-10-13-planos-design.md`).
- ✅ **4b. Cobrança pela AbacatePay** (assinar/trocar/cancelar pelo app, webhooks, painel Cobrança) — Sessão 23 (spec
  `2026-10-14-cobranca-abacatepay-design.md`). Falta o Breno ligar (chave de API, §13 item 0g) e o teste ponta a ponta.
  Ideias não feitas: nota fiscal, cupons, PIX Automático (depende da AbacatePay liberar), e-mail de cobrança recusada.
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
1. Conhece a maanu pela **página de vendas** e pelo **Instagram**.
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
- ~~Gateway de pagamento~~ → **AbacatePay** (decisão do Breno, Sessão 20; docs `https://docs.abacatepay.com`). Falta nota fiscal.
- ~~Planos da maanu~~ → decididos e implementados na Sessão 20 (Starter/Pro/Escala). **Pesquisa de 2026-10-13 (Sessão 19)**
  com 30+ concorrentes e proposta de 3 planos em `docs/v2/referencias-mercado.md` (aguardando decisão do Breno).
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
| 2026-10-11 | "Respostas da IA" → **"Assistente de IA"** (`/assistente`; `/respostas` redireciona) | Breno entrou esperando ver respostas e era configuração. |
| 2026-10-11 | Configuração guiada **por conta ML**, 19 passos com opções rápidas + detalhes; respostas em `store_profile` (JSON estruturado), compiladas no prompt a cada pergunta | Estruturado = editável item a item e o texto do prompt pode evoluir sem refazer as respostas. Conta nova pode copiar de outra. |
| 2026-10-11 | IA só pode ser ligada com a configuração concluída | Evita a IA falar pela loja sem conhecer as políticas. |
| 2026-10-11 | Prompt da v2 herda as travas do prompt da v1 (Regra 0, contestação, contexto, checagem), mas quando não sabe **escala para o vendedor** em vez de mandar "não tenho a informação" | Na v2 existe a fila "Para responder" com rascunho; resposta vaga não vende. |
| 2026-10-11 | Respostas ensinadas ranqueadas por semelhança (até 12 de 300), não só as mais recentes | Antes uma ensinada antiga podia ser ignorada. |
| 2026-10-11 | Perguntas = caixa de entrada (lista + conversa), filtros com cor e contador, resposta na tela | Pedido do Breno: layout claro; fundo `--canvas` cinza para separar as superfícies brancas. |
| 2026-10-11 | Botão de recolher o menu no topo da própria barra lateral; barra de topo só no celular | Pedido do Breno. No computador a barra de topo só repetia o título da página; sem ela sobra altura para a caixa de entrada. Recolhido, a logo vira o botão de abrir (ícone no hover). Ctrl+B continua. |
| 2026-10-11 | Itens do menu com 4 px de espaço (`SidebarMenu gap-1`) | O preset base-nova vem com `gap-0`: item ativo e item com hover ficavam colados. Ajuste feito no uso, sem editar `components/ui`. |
| 2026-10-11 | Caixa de entrada com altura da tela e rolagem por coluna, 50 por página, paginação por número (offset) | Padrão de e-mail/atendimento; aguenta milhares de perguntas sem a página crescer. Offset é suficiente para dezenas de milhares; cursor só se passar disso. |
| 2026-10-11 | RLS de `ml_questions` no formato `organization_id in (select ...)` | Recomendação do Supabase: evita uma subconsulta por linha nas contagens e listas grandes. Mesma regra de acesso. |
| 2026-10-11 | Painel focado em ação: o que espera o vendedor e o que chegou por último | Pedido do Breno (resumo das últimas perguntas com acesso rápido). Cada linha abre a pergunta direto na caixa de entrada. |
| 2026-10-11 | Menu **Resultados** (não "Analytics") com o valor da IA em destaque: economia em R$, horas, projeção anual | Pedido do Breno: o cliente precisa ver que a IA resolve e quanto economiza. Nome em português claro, sem jargão. |
| 2026-10-11 | Economia = tempo poupado (respostas da IA × 3 min × R$ 20/h), premissas editáveis por organização | Número honesto e explicável; cada loja ajusta à própria realidade. Vendas geradas ficam para quando houver dados de pedidos. |
| 2026-10-11 | Números de Resultados numa única função SQL (`analytics_overview`, security invoker) | Uma ida ao banco, agregação no Postgres (escala) e o RLS continua valendo. Lógica de apresentação pura em `lib/results`, testada. |
| 2026-10-11 | Tempo de resposta pela **mediana** e sem as perguntas importadas ao conectar a conta | Média distorce com poucas respostas lentas; as importadas não refletem a velocidade da IA. |
| 2026-10-11 | Gráficos com o `chart` do shadcn (Recharts); mapa de calor como grade simples | Regra de UI = shadcn; o shadcn não tem heatmap. |
| 2026-10-11 | IA da v2: `gpt-4o-mini` → **`gpt-6-luna`** com `reasoning_effort: "none"`, mantendo Chat Completions | Pedido do Breno: modelo mais atual e mais barato (US$ 0,10 entrada / US$ 0,50 saída por 1M tokens). `none` preserva o comportamento da gpt-4o-mini (sem raciocínio, menor custo e latência) e é o único modo do GPT-6 que aceita `temperature`. Responses API não é necessária (sem ferramentas); SDK não foi atualizado (salto de versão grande, fora do escopo). |
| 2026-10-11 | CPF/CNPJ + endereço pedidos **logo depois de confirmar o e-mail** (etapa 2 do cadastro), não na tela `/cadastro` | Só conta com e-mail comprovado pode prender um documento: e-mail digitado errado não "sequestra" o CPF e ninguém reserva o CPF de outra pessoa. A primeira tela continua curta. |
| 2026-10-11 | Documento **único** na plataforma e **imutável** depois de salvo, travado no banco (trigger) e no servidor; correção só pelo suporte em SQL | Pedido do Breno ("único pra cada conta", "não pode alterar"). Confirmação em diálogo antes de gravar para evitar erro de digitação. |
| 2026-10-11 | Dados de cobrança em tabela própria (`billing_profiles`), lidos só por dono/administrador | Dado pessoal (LGPD): membros comuns e futuras equipes não veem o CPF do dono; fica pronto para o gateway/nota fiscal (sub-projeto 4). |
| 2026-10-11 | Aceitar o **CNPJ alfanumérico** (Receita, desde jul/2026) | Empresas novas já recebem CNPJ com letras; rejeitar seria perder cliente. Mesmo cálculo valida o CNPJ antigo. |
| 2026-10-11 | Contas antigas (e as da v1 no cutover) completam os dados no próximo acesso; admin da plataforma e membros comuns dispensados | Cobrança certa para todos; a "Loja Demonstração" não pode prender o CPF do Breno. |
| 2026-10-12 | No cadastro, CPF/CNPJ e endereço aparecem como **"Dados da conta" / "Titular da conta"**, sem falar em cobrança; "dados de cobrança" só em Configurações | Pedido do Breno: quem só quer testar estranha falar de cobrança no período grátis. Os dados e as regras (único, imutável) não mudaram. |
| 2026-10-11 | Modo "Responder sempre": a IA **nunca escreve o "não sei"** — ela escala com resposta vazia e o sistema envia a mensagem padrão da loja | Texto previsível e personalizável pelo cliente; a Regra 0 continua inteira (nada de palpite) e dá para medir/filtrar essas respostas (`fallback_reason`). |
| 2026-10-11 | No modo sempre, desconto, reclamação, pedido e contato recebem respostas de **procedimento** (condições do anúncio, desculpas + "Minhas compras", atendimento pelo ML) em vez da mensagem padrão | "Não temos essa informação" para uma reclamação soaria descaso; as respostas de procedimento não afirmam nada do produto. |
| 2026-10-11 | Anúncio bloqueado, respostas pausadas, conta inativa e erro continuam indo para o vendedor mesmo no modo sempre | O bloqueio é uma escolha explícita do vendedor; os outros casos nem chegam à IA. |
| 2026-10-11 | Falha passageira (5xx/429/rede) ao ler a descrição do anúncio **não** é mais engolida: a fila tenta de novo | Antes a IA respondia sem ter lido a descrição — principal fonte de "não está no anúncio" errado. 404/4xx seguem sem descrição. |
| 2026-10-11 | Pós-venda é o primeiro recurso **por plano**: `organizations.plan = 'essencial'` (e `admin`) libera; regra em `lib/plans/plans.ts`, espelhada no RLS (`plan_includes_after_sale`) | Pedido do Breno (exclusivo do Essencial). Bloqueio vale no servidor, na RLS e no webhook (contas sem o plano nem gastam chamadas ao ML). Planos ainda não existem (sub-projeto 4): o código já tem onde cadastrá-los. |
| 2026-10-11 | Menu Pós-venda **só aparece** para quem tem o plano; quem abre a URL sem o plano vai para Assinatura com o aviso "exclusivo do plano Essencial" | Literal ao pedido ("item no menu exclusivo"). Se o Breno quiser usar como vitrine, basta mostrar com cadeado (motivo `plan` já existe em `LOCK_REASONS`). |
| 2026-10-11 | Teste grátis **sem** pós-venda (plano nulo durante o teste) | Decisão provisória da IA; confirmar com o Breno junto com os planos. |
| 2026-10-11 | Agente de pós-venda separado do de perguntas (prompt, decisão, fila e tabelas próprias), reaproveitando o conhecimento da loja do Assistente | Quem já comprou precisa de outras fontes (venda, envio, histórico) e outras travas (nunca prometer reembolso/troca/prazo). A loja não precisa repetir as políticas. |
| 2026-10-11 | Agente começa **pausado**, certeza padrão **0,85**, assuntos delicados ficam com o vendedor por padrão; mudança no pedido e reclamação/mediação aberta **sempre** ficam | Pós-venda mexe com reputação (reclamações). Mais conservador que as perguntas; a loja pode afrouxar. |
| 2026-10-11 | Conversa por venda (pack) com fila no Postgres, igual às perguntas, e o ML como fonte da verdade (relê a conversa antes de responder) | Evita resposta dupla e responde todas as mensagens pendentes de uma vez; sem serviço extra. |
| 2026-10-11 | No Brasil a mensagem vai para o **agente de mensageria do ML** (`to` = 3037675074) e, se o ML recusar o destinatário, para o comprador | Exigência da "nova arquitetura de mensageria" (02/02/2026), com implantação gradual; as duas tentativas cobrem conversas antigas e novas. |
| 2026-10-11 | Dados de envio/pedido guardados sem endereço nem dados pessoais do comprador | LGPD: o agente e a tela só precisam de situação, rastreio e previsão. |
| 2026-10-11 | Marca **maanu** (Breno), no lugar de "MeLi Responde"/"Meli Fácil"; sempre minúsculo, tratada no feminino ("a maanu") | Nova identidade enviada pelo Breno; o gênero foi escolha da IA ("a plataforma") — trocar em Termos/Privacidade se ele preferir "o maanu". |
| 2026-10-11 | Logo vetorizada dos PNGs originais e desenhada como SVG no próprio HTML (`currentColor` nas letras) | Nítida em qualquer tamanho, funciona em fundo claro e escuro e não faz requisição extra. Scripts em `docs/brand/scripts/` para regerar. |
| 2026-10-11 | `primary` = teal um pouco mais fechado (`#009682`) que o da logo (`#1FAF9A`); o teal exato fica no ponto da logo, gráficos e destaques sobre grafite | Texto branco sobre `#1FAF9A` tem contraste 2,7:1 (ruim em botões e links pequenos); `#009682` mantém a cor da marca com 3,7:1. |
| 2026-10-11 | Cores de significado: teal = IA, grafite/slate = você, âmbar = esperando você, violeta = mensagem padrão, vermelho = problema | O verde-esmeralda usado para "você" se confundiria com o teal da IA. |
| 2026-10-11 | Favicon "m." branco em quadrado grafite; ícone de app (iPhone/materiais) em quadrado branco | O favicon precisa aparecer em abas claras e escuras; o ícone de app segue a apresentação da marca. |
| 2026-10-12 | Painel do administrador em **`/admin` no mesmo app** (não subdomínio agora), com **verificação em 2 etapas (TOTP) obrigatória** a cada 12 h | Pedido do Breno ("o melhor e mais seguro"). A segurança vem dos controles, não do endereço: `is_platform_admin` só pelo banco, 2ª etapa, checagem em 3 camadas (proxy/DAL/banco), 404 para quem não é admin e histórico imutável. Subdomínio sem domínio próprio não traz ganho real; ficou pronto pela variável `ADMIN_HOST` (testado com `admin.localhost`). |
| 2026-10-12 | O painel lê e altera dados **só** por funções `admin_*` com `admin_assert()` no banco, usando a sessão do próprio admin (sem service role para ler clientes) | Defesa em profundidade: um bug no servidor não expõe dados, porque o Postgres confere admin + aal2 + TOTP recente pelo JWT. As alterações gravam o histórico na mesma transação. |
| 2026-10-12 | Registrar **toda** chamada à OpenAI (`ai_usage_events`) com tokens de entrada/cache/saída e custo calculado na hora | Antes só existia `ai_tokens` da última execução de cada pergunta (sem testes, sugestões e repetições). Custo gravado no momento não muda quando o preço muda. Sem backfill. |
| 2026-10-12 | MRR vem de `organizations.monthly_price` (mensalidade digitada no painel) até existir gateway | Ainda não há cobrança automática; o financeiro já funciona e o sub-projeto 4 passa a preencher o valor. |
| 2026-10-12 | **Pausa geral da IA** (botão de emergência) em `platform_settings`, conferida antes de cada chamada | Para IA errando, OpenAI fora ou custo disparando. Perguntas vão para o vendedor (nada se perde) e o cliente vê um aviso. |
| 2026-10-12 | Admin pode **pausar** a IA de uma conta, mas não ligar | Ligar a IA fala em nome da loja do cliente: decisão do cliente. |
| 2026-10-12 | Migração v1 → v2 por **exportar (JSON local) → importar**, com regras puras e testadas em `lib/migration/v1.ts`; primeiro só para o Supabase de testes, com login novo | Pedido do Breno: ver um cliente real na v2. O mesmo código serve ao cutover. Produção só lida (GET); a importação trava pelo project ref; dados de clientes nunca no git (repo público). |
| 2026-10-12 | Tokens do ML **não** são migrados; cliente reconecta | App ML e chave de criptografia diferentes; copiar o refresh token derrubaria a v1. A conta importada fica "Reconexão necessária" e não responde nada. |
| 2026-10-12 | Base de conhecimento da v1 convertida **por IA, à mão, por cliente** para a configuração guiada | É um prompt inteiro (Regra 0, exemplos, fichas); metade já é o prompt da v2. Conversão automática perderia as fichas por modelo ou estouraria o limite de 5.000 de "Outras informações". São poucos clientes (7). |
| 2026-10-12 | Respostas da v1 com o texto padrão de "não tenho a informação" viram **mensagem padrão** na v2 | Mesma semântica do modo "Responder sempre": aparecem em violeta e no filtro próprio, e a loja vê onde ensinar a IA. |
| 2026-10-12 | Sem "entrar como cliente" (impersonação) e sem excluir conta nesta versão | Impersonação dá acesso total a dados de cliente (risco LGPD) e exclusão é irreversível; ficam para quando houver necessidade real e regras claras. |
| 2026-10-12 | **v1 descontinuada sem migração de dados**: os clientes atuais se recadastram na v2; nada é importado do banco da v1 | Decisão do Breno (6 clientes): quer ver a jornada desde o início e ter dados literalmente novos. Os scripts de `scripts/v1-para-v2/` ficam só como referência. |
| 2026-10-12 | O projeto Supabase da v2 (`ookosqyfazobiwmopiix`, plano grátis) **vira o banco de produção**; nenhuma migração da v2 vai para o banco da v1 | Decisão do Breno. Consequência: depois da troca não existe mais staging com banco separado (testes locais/na staging passam a mexer no banco real); um banco de testes novo pode ser criado depois. Sem backups diários no plano grátis. |
| 2026-10-12 | ~~Mesmo app ML de produção, só trocando as URLs~~ → **superada no mesmo dia** pela semana de teste (linha abaixo) | Trocar as URLs do app da v1 derrubaria a v1 de todos na hora. |
| 2026-10-12 | **Semana de teste com 1 cliente real na v2 antes de desligar a v1** (Breno). O **app ML da v2** (Client ID `8693830632560554`, hoje chamado "de teste") vira o **definitivo**: renomear para maanu e apontar as URLs para `maanu.com.br`. A v2 roda num **projeto Vercel novo "maanu"** com production branch `v2` e o domínio; a `main` (v1) não muda até o fim do teste | Cada app ML tem 1 URL de notificações: o app da v1 não serve as duas versões ao mesmo tempo, e trocar de app depois do teste obrigaria o cliente a reconectar. Crons da Vercel só rodam em deploy de produção (por isso projeto novo em vez de preview). O cliente do teste remove o app "Meli Fácil" dos aplicativos autorizados da conta ML dele (o "pausar" da v1 não funciona); volta = reconectar na v1 e pausar na v2. |
| 2026-10-12 | Domínio **`maanu.com.br`** (Registro.br) para o app e para os e-mails (SMTP) | Comprado pelo Breno. |
| 2026-10-12 | Reforço de segurança do banco da v2 (§8 "Segurança do Supabase da v2"): privilégios padrão negados, SSL obrigatório, senha do banco aleatória e não guardada, senha de usuário com letras + números | O banco vira produção e o cadastro é público. Falhar fechado (erro de permissão) é melhor que expor dados. |
| 2026-10-12 | Produção da v2 num **projeto Vercel novo `maanu`** com production branch `v2` (não preview do projeto antigo) | Crons só rodam em deploy de produção; a `main` (v1) não pode mudar até o fim do teste. Na Fase 2 o production branch vira `main`. |
| 2026-10-12 | **Chaves novas do Supabase** (publishable/secret) e legadas desligadas + segredo HS256 revogado | O segredo JWT antigo apareceu no terminal da Sessão 15; com ele dava para forjar um login de serviço. Chaves novas podem ser giradas uma a uma sem derrubar sessões. |
| 2026-10-12 | `ML_TOKEN_ENCRYPTION_KEY` de produção = a mesma da staging | Staging e produção usam o mesmo banco durante a semana de teste; chaves diferentes fariam um lado não conseguir ler os tokens do outro. Girar quando a staging for desligada (exige reconectar as contas). |
| 2026-10-12 | E-mails do login em português com link `token_hash` → `/auth/confirm` (`scripts/emails-auth/gerar.mjs`, `supabase/templates/`) + avisos de senha e e-mail alterados | Funciona em qualquer navegador (o cliente costuma abrir o e-mail no celular). Só aplicáveis com SMTP próprio no plano grátis. |
| 2026-10-12 | Noord Shop e dados de demonstração apagados do banco da v2 | Pedido do Breno (dados literalmente novos). |
| 2026-10-12 | Chaves de IA **cadastradas no painel do administrador**, criptografadas pelo servidor com chave-mestra só na Vercel (`AI_KEYS_ENCRYPTION_KEY`, separada da do ML); painel só grava, nunca mostra; `OPENAI_API_KEY` vira último recurso | Pedido do Breno (trocar chaves sem deploy). Vazar só o banco ou só a Vercel não expõe as chaves do painel. Supabase Vault descartado: a trava e o conteúdo ficariam no mesmo lugar. Perder a chave-mestra só exige recadastrar as chaves. |
| 2026-10-12 | Toda chave é **testada de verdade** (resposta mínima no mesmo modelo) antes de entrar em uso ou na reserva; chaves `sk-admin-` recusadas | Evita pôr em produção chave errada, sem permissão ou sem acesso ao modelo; a de administração dá poder sobre a conta inteira da OpenAI. Custo ~US$ 0,000004 por teste (registrado como `key_check`). |
| 2026-10-12 | Reserva entra **sozinha só no 401** (chave recusada), repetindo a chamada uma vez, com no máximo 1 troca automática a cada 10 min | 401 = problema da chave; outra chave resolve. 429/5xx não: o limite é do projeto/organização, não da chave (várias chaves no mesmo projeto não aumentam capacidade). A trava impede que uma instabilidade da OpenAI queime todas as reservas. |
| 2026-10-12 | Chave em uso fica **1 minuto** na memória de cada servidor | Evita uma consulta ao banco por pergunta; trocar no painel vale na hora no servidor que trocou e em até 1 min nos outros. |
| 2026-10-13 | Tour de boas-vindas em **duas colunas com as ilustrações do Breno**, etapas nomeadas clicáveis, "Pular" e voltar; clicar fora não fecha (Esc e "Pular" fecham e gravam como visto) | Pedido do Breno: estava idêntico ao AgilizaPRO (modal pequeno com ícone, "Passo X de 4" e bolinhas). Clicar fora sem querer pulava a apresentação. |
| 2026-10-13 | Teste grátis sai do topo e vai para um **cartão no rodapé do menu lateral** (anel com os dias; menu recolhido = só o anel; celular = selo no topo); conta do ML vira **cartão no topo do conteúdo**; nenhum dos dois pode ser fechado | Pedido do Breno: continuar sempre visíveis, mas sem as faixas de largura total do AgilizaPRO. Menu lateral é o padrão de SaaS para "dias de teste" e fica visível em todas as páginas; a conexão do ML é o passo que trava a plataforma, então fica no conteúdo com o botão de conectar. |
| 2026-10-13 | Aviso de conta bloqueada distingue teste encerrado, pagamento pendente e assinatura inativa | Antes dizia "Seu período de teste terminou" até para quem já tinha assinado; prepara o sub-projeto 4 (cobrança). |
| 2026-10-13 | **Planos Starter (R$ 97), Pro (R$ 197) e Escala (R$ 397)**; anual = 10 mensalidades; 300/1.500/5.000 respostas automáticas por mês (Starter era 500; Breno baixou para 300 para o Pro ficar mais atraente); 1/3/10 contas; pós-venda a partir do Pro; Melhorias de anúncio 20/100 por mês; suporte e-mail/WhatsApp/prioritário | Decisão do Breno sobre a proposta da Sessão 19. Riscou: usuários da equipe, excedente pago do Escala e relatório como diferencial (relatórios em todos os planos). |
| 2026-10-13 | **Teste grátis = tudo do Pro**, com 1 conta, 300 respostas (o mesmo do Starter) e 3 análises no período do teste (sem plano + `trialing` no prazo = plano `trial`) | Decisão da IA, seguindo a proposta da Sessão 19 (o Breno não comentou): mostrar o produto completo converte mais. Muda em `TRIAL_PLAN` + `plan_includes_after_sale`. |
| 2026-10-13 | Limite de respostas: mês do calendário de Brasília (no teste, o teste inteiro); acabou → pergunta/conversa fica com o vendedor (`answers_limit`), sem IA; aviso a partir de 80%; conta toda resposta enviada pela IA (inclusive mensagem padrão e as pendentes ao conectar), não conta sugestão/teste/manual | Simples de explicar ("renova dia 1º") e nada se perde. Limite "mole" (sem reserva) para não complicar o motor. Contar as pendentes ao conectar: é trabalho que a IA fez. |
| 2026-10-13 | Plano desconhecido, cortesia sem plano ou teste vencido usam o **Starter como base** | Nunca deixar a IA sem limite nem dar extras por engano; cortesia deve ganhar um plano no painel. |
| 2026-10-13 | Baixar o limite de contas **desativa as contas ativas mais novas** acima dele (gatilho no banco) | Sem isso, quem desce de plano manteria as contas extras funcionando. Nada é apagado; o cliente reativa a que quiser dentro do limite. |
| 2026-10-13 | Administrador pode definir um **acordo** de respostas por mês (`monthly_answers_limit`) e o ciclo (mensal/anual); escolher o plano no painel preenche contas e mensalidade | Escala sem excedente pago: casos acima de 5.000 viram acordo. MRR continua em `monthly_price` até o gateway. |
| 2026-10-13 | **Melhorias de anúncio**: a IA lê as perguntas do anúncio **com as respostas enviadas** + o anúncio e devolve até 6 sugestões com texto pronto; 1 análise = 1 da cota; mínimo 3 perguntas; a maanu não altera o anúncio; mede o efeito (perguntas/semana antes × depois) | Ideia do Breno (perguntas mais feitas → melhorar o anúncio). As respostas são a melhor fonte do que falta; texto pronto e efeito medido mostram valor. Alterar o anúncio pela API fica para depois (risco de apagar conteúdo do vendedor). |
| 2026-10-13 | Análise de anúncio com `gpt-6-luna` e **raciocínio `low`** (as respostas seguem sem raciocínio) | Volume baixo (até 100/mês por cliente) e a qualidade importa mais; teste real ~7 s. |
| 2026-10-13 | Contratação pelo app só com o gateway (**AbacatePay**, decisão do Breno); até lá o botão "Assinar" aparece desativado ("em breve") e o administrador ativa o plano no painel | Não há chave nem conta de pagamento configurada ainda; o catálogo já tem preços mensal/anual para virar produtos (`externalId`). |
| 2026-10-13 | Perguntas novas chegam por **dois caminhos**: notificação do ML (segundos) **e** consulta ao ML a cada ~10 s pelo cron de 1 min (rodadas durante ~50 s) | O ML não entregou nenhuma notificação da conta do 1º cliente ao app da v2 e a documentação dele admite perda/desligamento de tópicos. ~10–20 s continua "praticamente na hora" para o comprador. Custo: 1 consulta ao ML por conta por rodada, com teto de 100/min = 1/3 do limite do app no ML (18.000/h para tudo); acima de 16 contas as rodadas se espaçam e acima de 100 contas vira rodízio (aí a notificação volta a ser o caminho principal) e o cron fica ~50 s ativo por minuto (Fluid compute; a função passa quase todo o tempo esperando). Cron de segundos em outro serviço ficou de fora (mais uma peça para manter). |
| 2026-10-13 | Webhook do ML responde 200 **antes** de qualquer acesso ao banco (tudo em `after()`) | Regra do ML: 200 em até 500 ms, senão os tópicos podem ser desligados ("fall back") e é preciso se inscrever de novo. |
| 2026-10-13 | Perguntas abre em **Respondidas pela IA**, o 1º cartão (ordem: IA, você, para responder, todas) | Pedido do Breno: o principal para o cliente é ver o que a IA resolveu. O que espera o vendedor continua sinalizado (ponto âmbar no cartão, contador no menu) e os atalhos de "aguardando você" abrem direto em Para responder. |
| 2026-10-13 | Fotos do ML sempre em https (`mlImageUrl`), corrigidas também na hora de mostrar | O ML devolve http; corrigir na tela resolve as fotos já gravadas sem mexer no banco de produção. Endereço que não é do `mlstatic.com` vira o ícone de pacote (nunca imagem quebrada). |
| 2026-10-16 | **Página de vendas em `maanu.com.br/` e indexável já**, antes de o app sair do domínio principal; `/institucional` → `/` com **308** | Pedido do Breno (página pronta). A raiz é o que o anúncio, o Google e o avaliador da AbacatePay abrem; o app continua funcionando nos mesmos caminhos até o `APP_HOST`. 308 porque o endereço antigo nunca volta (estava fora do Google, nada a perder). |
| 2026-10-16 | **Webhooks e retorno do OAuth do ML ficam em `maanu.com.br`** mesmo com o app em `app.maanu.com.br` (`webhookBaseUrl`; `ML_REDIRECT_URI` não muda) | O domínio principal continua servindo `/api/webhook/*` e redireciona o retorno do OAuth (307, com a busca) para o app, onde está o cookie. Assim nada é recadastrado no DevCenter do ML nem na AbacatePay e não surgem 2 webhooks entregando o mesmo evento. Se um dia o domínio principal sair da Vercel, mudar os dois cadastros antes. |
| 2026-10-16 | `APP_HOST` **só depois do DNS e do HTTPS de `app.maanu.com.br`** (a IA confere antes de ligar) | Com a variável e sem DNS, o domínio principal mandaria login/painel/e-mails para um endereço que não abre: app fora do ar para os clientes. |
| 2026-10-16 | **Só o plano mensal**: anual removido da Assinatura, da página de vendas, das Dúvidas, do `llms.txt`, dos Termos e do painel; produtos ANNUALLY da AbacatePay ignorados | Decisão do Breno ("vamos trabalhar sem o anual por enquanto"). Menos coisa para explicar e manter. O banco continua aceitando `annual` (nada destrutivo). Voltar: devolver `priceAnnual`, o ciclo `annual` em `BILLING_CYCLES`, o seletor e os textos (ver o commit da Sessão 23d). |
| 2026-10-16 | Plano **anual só aparece quando existem os produtos anuais** na AbacatePay (sem nenhum, a Assinatura oferece só o mensal) | O Breno criou só os mensais em produção; botões "indisponível" no anual pareceriam erro. Volta sozinho quando os produtos forem criados. **Substituída** no mesmo dia pela decisão "só o plano mensal" (Sessão 23d). |
| 2026-10-14 | Cobrança pela **página hospedada da AbacatePay** (checkout de assinatura), cartão por padrão; sem checkout transparente | O cartão nunca passa pela maanu (sem PCI) e é o caminho da documentação para assinaturas. PIX Automático fica por variável quando a AbacatePay liberar. |
| 2026-10-14 | Produtos da AbacatePay reconhecidos **pelo nome (Starter/Pro/Escala) + recorrência + preço igual ao da maanu**; preço diferente não vende | O Breno já criou os produtos no painel (sem externalId combinado). Nunca cobrar um valor diferente do que a tela mostra. |
| 2026-10-14 | O **webhook manda** no plano, mas assinatura nova só vale depois de confirmada na API (`GET /subscriptions/get` = ACTIVE, mesmo ambiente) | Defesa em profundidade: um webhook forjado (segredo vazado) não libera plano sem pagamento real. |
| 2026-10-14 | Aceitar os **dois formatos de webhook** (antigo com `?webhookSecret=` + HMAC da chave pública, e Standard Webhooks com `webhook-signature`) | Os tipos oficiais (`@abacatepay/types` 4.0, 12/10/2026) mostram que endpoints novos recebem Standard Webhooks; a documentação ainda descreve o antigo. |
| 2026-10-14 | Cancelar = cancelar **na hora** na AbacatePay e manter o acesso **até o fim do período pago** (`computeAccess`: `canceled`/`past_due` com `current_period_end` futuro = ativo) | A AbacatePay não tem "cancelar no fim do ciclo"; cancelar depois (por cron) arriscaria uma cobrança indevida. O cliente não perde o que pagou. |
| 2026-10-14 | Cobrança recusada **não bloqueia**: aviso no topo + "Pagar com outro cartão"; a AbacatePay tenta 4 vezes a cada 2 dias e cancela | A AbacatePay já faz a régua de cobrança; bloquear no 1º erro puniria quem só teve o limite estourado. |
| 2026-10-14 | Subir de plano libera **na hora** (valor novo na renovação); descer vale **na próxima cobrança**; mensal ↔ anual = assinatura nova e a antiga é cancelada quando a nova é paga | `change-plan` só troca no mesmo ciclo e cobra o novo valor no ciclo seguinte. Upgrade imediato vende melhor; downgrade imediato tiraria o que o cliente pagou. Nunca duas cobranças. |
| 2026-10-14 | Chave de **teste** em produção só para administradores e `ABACATEPAY_TEST_EMAILS`; a organização interna (`admin`) não assina | Senão um cliente real "pagaria" com o cartão 4242 e ganharia o plano. A organização admin perderia o plano interno. |
| 2026-10-14 | Webhook **cadastrado pelo painel do administrador** com o segredo que só existe na Vercel (criado pela IA, aleatório) | Ninguém precisa ver ou copiar o segredo; o botão usa a própria chave de API (WEBHOOK:CREATE). |
| 2026-10-14 | Texto "se assinar antes, você não perde os dias que faltam" do teste grátis **retirado** | Não era verdade: ao assinar, o plano começa e a 1ª cobrança é na hora (a AbacatePay só daria dias grátis com `trialDays` no produto). |
| 2026-10-14 | **`maanu.com.br/` = página de vendas**; o app vai para **`app.maanu.com.br`** pela variável `APP_HOST`, com o domínio principal ainda aceitando webhooks/cron e redirecionando o resto para o mesmo caminho no app (307, busca preservada) | Pedido do Breno (Sessão 25). Recomendação da IA: é o padrão de SaaS (site de marketing × app), separa SEO/anúncios do app e deixa trocar um sem mexer no outro. Feito em 2 passos para não quebrar nada: (1) a página de vendas entra em "/" com o app no mesmo endereço; (2) com o DNS, `APP_HOST` e as URLs do ML/Supabase, o app muda de endereço. Webhooks e links antigos (e-mails, retorno do OAuth) continuam funcionando pelo redirecionamento; 307 (e não 308) para dar para voltar atrás sem cache no navegador. Login não é compartilhado entre os endereços (quem estava logado entra de novo uma vez). |
| 2026-10-14 | Página de vendas: layout inspirado na AbacatePay (topo emoldurado e arredondado, navegação flutuante, seções alternando claro/escuro, simulador escuro, dúvidas em 2 colunas, convite final) com identidade própria: grafite + teal "aceso" (`brand-mint`, `brand-night`), títulos em **Funnel Display**, demonstrações animadas feitas em código (sem vídeo) e espaços de imagem marcados | Pedido do Breno ("mais vivo, com animações e tecnologia, nada com cara de modelo feito por IA"). Animações em CSS + IntersectionObserver (sem biblioteca nova), página estática (○ no build) e o proxy nem consulta o login em "/" (carrega rápido para quem vem do anúncio). Tudo respeita "reduzir movimento". |
| 2026-10-14 | Calculadora da página de vendas **sem indicar plano** | Breno: quem visse que precisaria do plano mais caro poderia desistir antes do teste grátis. A escolha do plano fica para depois do teste, dentro do app. |
| 2026-10-14 | Sem depoimentos, números de clientes ou selos inventados na página de vendas; exemplos marcados como ilustrativos; preços e limites lidos de `SELLABLE_PLANS` | Ainda não há depoimentos reais (1 cliente em teste). Propaganda enganosa queima o anúncio e o CDC; preço em um lugar só não fica desatualizado. |
| 2026-10-15 | **SEO da página de vendas aberto para buscadores e IAs**: `robots.txt` libera explicitamente os robôs de busca e de IA (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, PerplexityBot, Google-Extended, Applebot-Extended...), com a área logada fora; `/llms.txt` com o resumo da maanu; dados estruturados (Organization com CNPJ, WebSite, WebPage, SoftwareApplication com os preços, FAQPage) | Pedido do Breno: ser achado no Google e nas respostas do ChatGPT, Claude, Gemini e Perplexity. A página é de venda, então não há o que proteger do treino das IAs; quanto mais elas conhecerem a maanu, mais a citam. Sem nota/avaliações nos dados estruturados enquanto não houver avaliações reais (o Google pune dados inventados). |
| 2026-10-16 | Rodapé da página de vendas mostra **só os contatos já informados** (`companyInfo`); os espaços "a definir" saíram (componente `pending.tsx` apagado) e o WhatsApp aparece com o número escrito, `(31) 99263-0934`, e link para o `wa.me` | A AbacatePay recusou o cadastro pedindo contato visível (e-mail e WhatsApp), Termos, Privacidade e CNPJ no rodapé (o avaliador abriu `maanu.com.br`, que leva ao login). Quem avalia precisa ver o número, não a palavra "WhatsApp"; um "a definir" à mostra parece site inacabado. |
| 2026-10-15 | Página de vendas publicada em **`maanu.com.br/institucional`** (e não em "/") e **fora do Google** (`noindex`, fora do sitemap) enquanto estiver lá; `maanu.com.br/` segue levando ao app | Pedido do Breno: colocar no ar para o sócio analisar, com o app ainda no domínio principal ("depois vamos mudar para app"). Indexar um endereço provisório, com conteúdo em revisão e contatos "a definir", obrigaria a redirecionar e reenviar tudo ao Google na troca; o SEO liga junto com a ida para "/" (uma constante, `SALES_PAGE_INDEXABLE`). A prévia do link no WhatsApp funciona normalmente. |
| 2026-10-15 | Fora de `maanu.com.br` (endereço da Vercel, prévias, futuro `app.maanu.com.br`) todas as respostas levam `X-Robots-Tag: noindex, nofollow`; termos e privacidade com canonical fixo no domínio principal | Evita conteúdo duplicado e o app aparecendo no Google no lugar da página de vendas. |
| 2026-10-15 | Respostas das Dúvidas no HTML mesmo fechadas (`hiddenUntilFound` do Accordion) e animação do título do topo sem esconder o texto | Buscadores e IAs leem o que está no HTML; o título apagado no início atrasava a "maior pintura" (LCP) que o Google mede. |
| 2026-10-15 | `TooltipProvider` e `Toaster` (sonner) saíram do layout raiz para os layouts das áreas que usam (`components/providers/app-providers.tsx`); menu do celular da página de vendas carregado só quando tocado | Menos JavaScript para quem chega pelo anúncio no celular (o que mais pesa na nota de velocidade). |
| 2026-10-15 | Criativos para Instagram usam o formato 1080×1350, direção editorial clean e apenas a paleta/logos oficiais da maanu | Apresentação da marca com leitura rápida no feed; evitar estética genérica ou artificial e manter as peças prontas para avaliação antes de publicar. |
| 2026-10-14 | Cliente sem `is_platform_admin` abre `/admin/*` → tela **`/acesso-negado`** com mensagem em português e botão de retorno ao painel (substitui o 404 da Sessão 13) | Pedido do Breno. Redirecionamento no servidor, mantendo MFA, proteção das ações e RLS. API estável do Next (`redirect`), sem habilitar `forbidden`/`authInterrupts` experimentais. |
| 2026-10-19 | Aba **Clientes** com **dados mínimos** do comprador (apelido, nome, sobrenome, cidade/UF e compras); **sem e-mail, telefone, CPF/CNPJ ou endereço completo** | Decisão do Breno. O ML não entrega e-mail, mascara o telefone (fora do ME1) e proíbe usar os dados fora da plataforma (risco de bloqueio do app e da conta do vendedor, LGPD). Atualiza a decisão de 2026-10-11 ("sem dados pessoais do comprador"), que continua valendo para o pós-venda. |
| 2026-10-19 | Clientes em **todos os planos**, com **observações internas** (um texto por cliente, qualquer membro edita) e sem exportar CSV nesta versão | Decisão do Breno. Conversas do pós-venda na ficha seguem a regra do plano (cadeado com link para Assinatura). |
| 2026-10-19 | Cliente = **conta do ML + comprador** (o mesmo comprador em 2 lojas da organização = 2 clientes) | Cada loja tem a própria relação com o comprador; perguntas e conversas também são por conta. Juntar por organização fica para depois, se o Breno pedir. |
| 2026-10-19 | Importação dos **últimos 12 meses** em janelas de 30 dias pelo cron + conferência a cada 10 min + notificação `orders_v2` | Decisão do Breno (12 meses). Janelas pequenas respeitam o limite de offset de 10 mil do ML; o cron segue o padrão de fila no Postgres (sem serviço extra). A conferência cobre notificação perdida, como nas perguntas. |
| 2026-10-19 | Nome do comprador lido de `/orders/{id}` **junto com a cidade** (1 venda por cliente), não na importação | A busca de vendas não traz o nome (conferido na API em 2026-10-19). Ler cada venda custaria 1 chamada por venda; assim é 1 por cliente, e quem comprou por último é preenchido primeiro. |
| 2026-10-19 | Aba Clientes na branch `codex/clientes`, migração aplicada antes do merge | Mudança grande (regra do AGENTS.md). A migração é aditiva e não muda nada para a produção atual; o código só começa a importar quando entrar na `v2`. |

---

## 12. Diário de sessões (mais recente no topo)

### 2026-10-19 — Sessão 28 · Aba Clientes (IA: Claude, via app Codex)
- Pedido do Breno: "existe alguma maneira de ter a aba de clientes, que são os que compraram na nossa loja do ML, e ter
  alguns dados como e-mail e telefone deles vindos do Mercado Livre?"
- Pesquisa (documentação do ML + API real, só leitura e só a estrutura das respostas, sem guardar dados): `/orders/search`
  traz o comprador só com `id` e `nickname`; `/orders/{id}` traz também `first_name`/`last_name` (às vezes repetidos) e
  `billing_info`; nenhum e-mail; `/shipments/{id}` traz cidade/UF e `receiver_phone` **mascarado** ("XXXXXXX") nas vendas
  Full; a busca ordena pela data de fechamento e recusa offset + limit > 10.000 ("limit.maximum_exceeded"); o filtro
  `order.date_last_updated.from` funciona. Resposta ao Breno: dá para ter a aba, sem e-mail e sem telefone.
- Decisões do Breno (perguntas no modo plano): conhecer os clientes (sem contato fora do ML), dados mínimos, últimos 12
  meses, todos os planos, com observações internas.
- Banco (produção): migração `20261019120000_clientes.sql` (§6.1j) **ensaiada antes** numa transação desfeita junto com o teste
  novo (conferido que nada ficou), dry-run, `db push`; os 10 testes SQL passam depois. Tipos regenerados. As 3 contas
  existentes ficaram com a importação `pending` (nada roda até o código entrar na `v2`).
- Código (branch `codex/clientes`): `lib/customers/*`, `lib/mercadolivre/orders.ts`, `lib/dal/customers.ts`, cron
  `/api/cron/clientes` (+ `vercel.json`), tópico `orders_v2` no webhook do ML, seção `clientes` (menu, `AppSection`, títulos,
  robots), telas `/clientes` e `/clientes/[id]` (shadcn: Card, Table, Badge, Avatar, Alert, Empty, Select, Textarea),
  `components/clientes/*`, busca reaproveitando `QuestionSearch` (parâmetro `name`), rascunho da Privacidade (dados dos
  compradores tratados em nome do vendedor, nunca para marketing). Spec `docs/superpowers/specs/2026-10-19-clientes-design.md`.
- Testes: `tests/unit/customers.test.ts` (38 com o webhook) e o caso `orders_v2` em `webhook.test.ts`; `clientes_rls.sql`;
  `tests/integration/customers-db.test.ts` (`RUN_CUSTOMERS_DB=1`): importação de 12 meses até concluir, conferência (venda
  alterada e nova), cidade/nome com envio 404, notificação de outra loja ignorada e números do topo — no banco real com o ML
  simulado e loja temporária apagada no fim (conferido: nada ficou). QA visual no navegador local (`next start`) com uma loja
  temporária de dados falsos: lista, paginação, busca, filtro, ordem, ficha, observações, cadeado do pós-venda (Starter),
  importação em andamento e com falha ("Tentar de novo") e celular (cartões 2 por linha); loja apagada e conferida.
- Verificação: typecheck, 494 testes, lint e build ok. **Não publicado**: commit na branch `codex/clientes` (push só da
  branch, que nenhum projeto Vercel publica). Falta o Breno liberar o merge na `v2` e ligar o tópico Orders (§13 0l).

### 2026-10-16 — Sessão 27 · Troca de endereços: página de vendas na raiz e app em app.maanu.com.br (IA: Claude, via app Codex)
- Pedido do Breno: "a plataforma vai passar a responder em app.maanu.com.br e o /institucional vai responder no domínio
  principal. Me passe tudo que eu preciso fazer e atualize do seu lado tudo que conseguir."
- Código (commits `30b0cbe` + `42b7ec8` na `v2`; o 1º saiu só com a mudança de pasta por um `git add` que falhou, e o deploy
  dele foi **cancelado** antes de terminar, então a produção nunca o serviu): `app/(site)/institucional/page.tsx` →
  `app/(site)/page.tsx`, `app/page.tsx` apagado, `SALES_PAGE_PATH = "/"`, `SALES_PAGE_INDEXABLE = true`,
  `SITE_CONTENT_UPDATED = 2026-10-16`, `/institucional` → `/` (308, `next.config.ts`, busca preservada) e
  `webhookBaseUrl` (`lib/site/host.ts`): com `APP_HOST`, o webhook da AbacatePay continua em `maanu.com.br` (o painel
  Cobrança não pede recadastro). `.env.example` atualizado. Testes novos em `site.test.ts` e `site-seo.test.ts` (raiz,
  sitemap, webhook). typecheck, 460 testes, lint e build ok (`/` estática). Conferido com `next start` +
  `APP_HOST=app.localhost`: domínio principal serve página/termos/llms.txt/sitemap/webhook; login, painel, `/auth/confirm`
  e retorno do OAuth vão para o app com a busca; no app, `/` → `/painel`.
- Infra: `app.maanu.com.br` adicionado ao projeto Vercel `maanu` (API; aguardando DNS: CNAME `app` →
  `5205331b18becd29.vercel-dns-016.com`, o mesmo do `www`); Supabase Auth com `https://app.maanu.com.br/**` nos redirects
  (Site URL mantido). **Não** foram criadas/alteradas variáveis na Vercel: `APP_HOST` sem DNS derrubaria o app.
- Produção (deploy `dpl_H3U4pDJwwhV2SUMpgzA3aaFKdfpv` READY): `maanu.com.br/` 200 com a página de vendas (`index, follow`,
  canonical `https://maanu.com.br`), `/institucional?utm_source=ig` → 308 `/?utm_source=ig`, `/login` e `/cadastro` 200,
  `/painel` → login, sitemap com a raiz, webhook do ML 200.
- Observação: cache `.next/dev/types` antigo (de um `next dev` anterior) fazia o typecheck acusar `app/page.js` e
  `institucional/page.js` inexistentes; rodar `next dev` uma vez regenera (apagar arquivos foi bloqueado pela política do app).
- Pergunta do Breno: "nas URLs do Mercado Livre não tenho que fazer nada?" → não (URI de redirect e notificações ficam em
  `maanu.com.br`; opcional adicionar a do app como 2ª).
- **Troca ligada (mesmo dia, ~19:30):** o Breno criou o CNAME `app` no Cloudflare (achou que a troca já estava feita ao ver o
  "Entrar" levando a `maanu.com.br/login`). Conferido: DNS (1.1.1.1 e 8.8.8.8), Vercel `misconfigured: false`, HTTPS válido.
  Feito: `APP_HOST=app.maanu.com.br` criada e `NEXT_PUBLIC_SITE_URL=https://app.maanu.com.br` (Vercel `maanu`, Production),
  redeploy `dpl_6ZLQmJF8YEeBUvcRhce5we4y8UKY` READY, Supabase Auth `site_url = https://app.maanu.com.br` (redirects mantidos).
  Testado em produção: `maanu.com.br/` 200 sem `X-Robots-Tag`; `/institucional` → 308 `/`; `/login?next=`, `/painel`,
  `/cadastro`, `/auth/confirm?token_hash=...` e o retorno do OAuth → 307 para o mesmo caminho em `app.maanu.com.br`;
  `www.maanu.com.br` → 308 `maanu.com.br`; `app.maanu.com.br/` → `/painel`; `app.maanu.com.br/login` 200 com
  `noindex, nofollow`; "Entrar"/"Testar grátis" e `/llms.txt` apontando para `app.maanu.com.br`; webhook do ML 200 em
  `maanu.com.br` (logs: notificações reais chegando), AbacatePay sem segredo 401 (esperado), crons `questions` e
  `pos-venda` 200 a cada minuto, nenhum 5xx. Logs pela CLI: `npx vercel logs requests --project maanu --scope
  brenosousaf132-gmailcoms-projects --deployment <id> --since 15m --json` (o endpoint `runtime-logs` da API fica pendurado).
- Falta (Breno): avisar os clientes do endereço novo, testar "Conectar conta" do ML no app novo, Search Console/Bing (§13 0k).

### 2026-10-16 — Sessão 23d · Só o plano mensal (IA: Claude, via app Codex)
- Pedido do Breno: "vamos trabalhar sem o anual por enquanto… remover tudo que tem anual e deixar apenas o mensal" (ele
  tinha acabado de criar os produtos anuais na AbacatePay).
- Feito: `lib/plans/plans.ts` sem `priceAnnual`/`monthlyPrice`/`annualSavings`, `BILLING_CYCLES = ["monthly"]`; catálogo
  da AbacatePay só reconhece MONTHLY (ANNUALLY = ignorado, "recorrência que a maanu não vende — pode arquivar");
  `decide.ts` (`addOneMonth`, `monthlyPriceFromAmount`), `subscription.ts` (`planIntent`/`isUpgrade` sem ciclo), motor
  (`startCheckout(actor, planId)`), ações e tela Assinatura ("Pro · Mensal", "Cobrado todo mês no cartão de crédito",
  sem seletor), botões dos planos sem ciclo ("pagar com outro cartão" só para cobrança recusada); página de vendas
  (`pricing-section` sem o seletor e sem "use client"), Dúvidas, `llms.txt`/dados estruturados e Termos ("cobrados
  mensalmente"); painel admin (produtos "X de 3", MRR "soma das mensalidades ativas", diálogo do plano do cliente só
  com o mensal). Banco intacto (`annual` continua aceito, sem uso). Testes ajustados.
- Verificação: typecheck, 458 testes, lint e build ok; fluxo completo da cobrança no banco de produção
  (`RUN_BILLING_DB=1`, loja temporária apagada) ok. Publicado na `v2`.
- Achado nos logs depois do deploy: das 17:00 às 18:44 a loja Girassol Moda Jeans tentou assinar 5 vezes (Pro, Starter,
  Escala) e a AbacatePay respondeu `400 CARD is not available for this store` em todas: a conta aprovada **não tinha o
  cartão de crédito habilitado** (habilitação separada, por análise da AbacatePay). O Breno habilitou no painel; às 18:49 a
  mesma conta gerou a página de pagamento do Pro em produção (`bill_MHFp…`, sem "Modo simulação", logo da maanu, R$ 197/mês),
  ainda não paga. Sem o cartão habilitado o cliente vê "O sistema de pagamento recusou o pedido" e o painel Cobrança mostra
  o erro em Páginas de pagamento.
- Taxas escolhidas pelo Breno (recebe em 1 dia útil): cartão à vista **3,50% + 1,92% de antecipação + R$ 0,60** por
  cobrança; 10% do líquido fica bloqueado por 40 dias (Bloqueio de Contencioso, termos da AbacatePay item 10). Líquido por
  mês: Starter R$ 91,14 (R$ 82,03 na hora + R$ 9,11 em 40 dias), Pro R$ 185,72 (167,15 + 18,57), Escala R$ 374,88
  (337,39 + 37,49). Saque por PIX: R$ 0,80 cada (até 20/mês). Impostos não incluídos.
- Falta o Breno: arquivar os 3 produtos anuais na AbacatePay (opcional; são ignorados) e a compra real de verificação
  (§13 item 0g).

### 2026-10-16 — Sessão 23c · Cobrança pela AbacatePay em produção (IA: Claude, via app Codex)
- O Breno teve a conta da AbacatePay aprovada, criou a chave de produção (8 permissões), os produtos Starter/Pro/Escala
  mensais em produção, trocou a `ABACATEPAY_API_KEY` na Vercel (16/10 16:30, deploy `dpl_G5xnP3ksrxYf1ZthQ3hbyj3Lu3zG` READY)
  e cadastrou o webhook pelo painel. Admin → Cobrança: chave "produção", loja "maanu.", webhook cadastrado com os 6 eventos,
  contratação ligada; produtos **3 de 6** (sem os anuais).
- Conferido: nenhuma assinatura/pagamento/notificação no banco ainda (a compra real de verificação não foi feita) e nada da
  cobrança com erro nos logs de produção.
- Feito: sem nenhum produto anual, a Assinatura **não mostra** o seletor Mensal/Anual nem o "ou R$ 81/mês no plano anual"
  (mostra "Cobrado todo mês no cartão de crédito"); volta sozinho com os produtos anuais (catálogo lido a cada 5 min ou
  "Ler de novo" no painel). Admin → Cobrança mostra "mensal 3 de 3 · anual não vendido" como ok (anual é opcional;
  1 ou 2 anuais = aviso). **Atenção:** a página de vendas (`components/site/pricing-section.tsx`, `lib/site/faq.ts`,
  `lib/site/seo.ts`) anuncia o anual com 2 meses grátis — criar os produtos anuais ou tirar o anual de lá antes de divulgar
  (resolvido na Sessão 23d: o anual saiu de tudo).
- O webhook do modo de teste continua no Dev mode da AbacatePay (mesmo endereço): eventos de teste chegam com
  `devMode: true` e são ignorados (não estão ligados a nenhuma loja). Pode ser apagado lá.

### 2026-10-15 — Sessão 26 · Carrossel de apresentação da maanu
- Pedido do Breno: criar a pasta `CRIATIVOS` na página do projeto e quatro imagens para um carrossel do Instagram,
  apresentando a maanu com identidade visual consistente, visual clean e sem cara de IA.
- Feito: quatro PNGs 1080×1350 em `CRIATIVOS/`: capa, apresentação da IA, fluxo pergunta → resposta e fechamento com CTA.
  As peças usam os logos oficiais, grafite/off-white/teal/mint, tipografia geométrica e elementos de conversa desenhados
  para o formato 4:5. Aguardando avaliação do Breno; ainda não há publicação nem alteração de código/produto.

### 2026-10-14 — Sessão 25 · Página de vendas e endereço do app (IA: Claude, via app Codex)
- Pedido do Breno: criar a página de vendas para os anúncios (todo o conteúdo e copy), inspirada no layout da
  `abacatepay.com` sem copiar e sem cara de modelo de IA, com a logo/cores da maanu "mais vivas", animações e tecnologia; onde
  houver imagem, deixar o espaço marcado. E: `maanu.com.br` deveria ser a página de vendas e a plataforma algo como
  `app.maanu.com.br` — dá para mudar?
- Análise da AbacatePay (navegador, página inteira): topo verde emoldurado com navegação flutuante, selo + título em 2 linhas
  com a 2ª colorida, print do painel saindo do topo, frase de preço enorme com ilustrações nas laterais, 3 cartões com ícones
  3D, seções alternadas imagem/texto, simulador num painel escuro arredondado, suporte com foto do time, dúvidas em 2
  colunas, convite final ("Você leu até aqui"), rodapé escuro com CNPJ; textos informais, microtexto repetido abaixo dos
  botões e entrada suave ao rolar (fonte Fustat).
- Feito (branch `codex/pagina-de-vendas`, **não publicada**): `app/(site)` + `components/site/*` (mapa no §4). Seções: topo
  escuro "Quem responde primeiro, vende primeiro." com demonstração ao vivo (pergunta às 23:47/02:13/06:58 → lendo o
  anúncio → resposta digitada → "Enviada ao Mercado Livre", cronômetro e certeza; pausa fora da tela); faixa de perguntas
  correndo; "O comprador não espera" + "um dia de perguntas" (linha da maanu varrendo 24 h, âmbar → teal); 3 passos; "ela
  lê tudo antes de responder" (raio-x do anúncio animado); "Na dúvida, ela não inventa" (barras de certeza × rigor de 75%,
  níveis Cautelosa/Equilibrada/Ousada, Responder sempre, bloqueios, pausa); recursos (caixa de entrada, ensinar, pós-venda,
  melhorias, várias contas); Resultados; calculadora (mesma conta de Resultados: perguntas/dia × minutos × R$/h, plano
  indicado e R$ por resposta); planos com mensal/anual vindos de `SELLABLE_PLANS` ("R$ 3,23 por dia"); suporte; 10 dúvidas
  ("respondidas por humanos, desta vez"); convite final com "você está nesta página há mm:ss"; rodapé com aviso de que a
  maanu não é afiliada ao Mercado Livre; botão fixo "Testar grátis" no celular. Dados estruturados (SoftwareApplication +
  FAQPage), canonical `maanu.com.br`, robots e sitemap.
- Endereços: `lib/site/host.ts` + `proxy.ts` (variável `APP_HOST`, §5). Opinião dada ao Breno: vale a pena e dá para mudar
  sem quebrar nada (passo a passo em §13 item 0k, desde a Sessão 27).
- Testes novos `tests/unit/site.test.ts` (endereços e calculadora). Conferido no navegador local (1280 e 390 px: topo,
  demo, faixa, linha do dia, passos, recursos, calculadora com teclado, planos mensal/anual, dúvidas, menu do celular) e,
  com `next start` + `APP_HOST=app.localhost`, os redirecionamentos (login, painel, `/auth/confirm` e retorno do OAuth com a
  busca → app; `/`, termos, sitemap, robots e webhooks ficam; no app, `/` → `/painel`). typecheck, 444 testes, lint e build
  ok (`/` estática). Sem mudanças no banco, na Vercel, no ML ou no Supabase Auth.
- Ajustes pedidos pelo Breno (mesma sessão, com prints): tirados o selo acima do título, a lista "sem cartão / cancele /
  pronto em minutos" abaixo dos botões do topo, os ícones da faixa do topo, o texto à direita de "Como funciona" e as 3
  imagens dos passos (a linha que liga os passos agora vai até o fim da seção) e a lista de controles de "Na dúvida, ela não
  inventa". Botões com a seta mais perto da borda: o `buttonVariants` do shadcn diminui o espaço do lado do ícone
  (`has-data-[icon=inline-end]:pr-2`); todos os botões da página passaram para `components/site/site-button.tsx` (alturas
  10/12/14, mesmo espaço dos dois lados e a folga interna da seta compensada). Medido no navegador: diferença de 0,2–0,4 px
  entre os lados em todos os botões. Título do topo menor entre 1024 e 1280 px (cabia mal) e rodapé da demonstração sem
  quebra de linha.
- 2ª rodada de ajustes: "Tudo para atender bem" (cards com ícone) refeita como **"No dia a dia"** — do lado do vendedor
  ("Do seu lado da tela, tudo fica mais leve."): 5 itens escritos como o que muda para ele (caixa de entrada, ensinar a IA,
  pós-venda, melhorias de anúncio, várias contas), em lista editorial numerada; no computador, o item ativo abre o texto e
  mostra à direita uma tela da maanu desenhada em código (dados de exemplo), passando sozinho a cada 7 s (para ao passar o
  mouse, fora da tela, com "reduzir movimento" ou depois de um clique); no celular, cada item com a sua tela. Removidas as
  seções Resultados e Suporte (o contato fica no rodapé).
- 3ª rodada: o gráfico "um dia de perguntas" (linha do dia com bolinhas) não se entendia; virou **"A mesma pergunta, em três
  lojas"** (`buyer-race.tsx`): às 22:14 o comprador pergunta "Esse tênis tem no 42?" em 3 lojas; com um relógio correndo,
  "Sua loja, com a maanu" responde em 6 s e vende às 22:16, a concorrente responde 44 min depois e a outra só às 7:30 do dia
  seguinte ("Tarde: ele já tinha comprado"). Roda uma vez ao aparecer, com "Ver de novo". Removidos os 3 avisos abaixo dos
  planos, a lista de garantias e o espaço de imagem do convite final (componente `image-slot` apagado: a página não tem mais
  espaços de imagem).
- 4ª rodada: links do menu centralizados na barra (computador, a partir de 1024 px; abaixo disso ficam no menu ☰); no
  celular a barra do topo não tem mais "Testar grátis" (já existe a barra fixa de baixo); tirado o texto à direita do título
  "No dia a dia"; a **calculadora não indica plano** (pedido do Breno: ver um plano caro poderia afastar a pessoa do teste
  grátis) — no lugar, perguntas por mês e horas por semana que voltam para a pessoa.
- Correção: o painel escuro da calculadora ficava com um vão grande embaixo (conteúdo subia). Causa: os painéis usavam
  `overflow: hidden` e o brilho do fundo passa da borda, então o painel virava área rolável por dentro (buscar texto, focar o
  controle ou um `scrollIntoView` rolava o painel). Agora os painéis usam `.site-clip` (`overflow: clip`, que não rola;
  navegador antigo fica com hidden). Exceção: o abre/fecha de "No dia a dia" continua com hidden (precisa para a animação).
- CNPJ do Breno no rodapé (`companyInfo.cnpj`); a razão social saiu do rodapé e do `companyInfo` (pedido dele).
- **Contato para o gateway (2026-10-16, "Sessão 25c")** — a AbacatePay devolveu o cadastro ("Seu cadastro precisa de
  ajustes": meios de contato (e-mail e WhatsApp), Termos de uso, Política de privacidade, CNPJ no rodapé). O Breno explicou
  que o avaliador abriu a página de login (`maanu.com.br` leva ao login) em vez de `/institucional` e mandou o telefone
  **31 99263-0934**. Feito: `companyInfo.whatsapp = "5531992630934"`; no rodapé, "WhatsApp e telefone (31) 99263-0934" com
  link `wa.me` (formatado por `formatWhatsapp`/`normalizeWhatsapp` de `lib/validation/forms.ts`); contatos vazios não
  aparecem mais (sem "a definir"); WhatsApp também no `llms.txt` e no `contactPoint` dos dados estruturados. Teste novo em
  `site-seo.test.ts`. typecheck, 458 testes, lint e build ok; rodapé conferido em 1366 e 390 px. **E-mail de contato ainda
  não existe no site** (nenhum endereço cadastrado; `nao-responda@` é só remetente) — a AbacatePay pede os dois.
- **Publicação (2026-10-15, "Sessão 25b")** — pedido: "coloque a página no ar pra eu enviar para meu sócio analisar,
  /institucional nesse caminho por enquanto. Depois vamos mudar para app." Feito: a página foi para
  `app/(site)/institucional/page.tsx` e `app/page.tsx` voltou a ser o da `v2` ("/" → `/painel`, ou `/login` sem sessão);
  `SALES_PAGE_PATH` em `lib/site/host.ts` (o proxy deixa só esse caminho sem login); canonical, Open Graph, dados
  estruturados e `llms.txt` apontando para `https://maanu.com.br/institucional`; `SALES_PAGE_INDEXABLE = false` (meta
  `noindex, follow` e fora do sitemap). Conferido antes do merge: os arquivos compartilhados com o app que a branch mexe
  (layout raiz sem providers → `AppProviders` nos layouts de todas as áreas que usam toast/tooltip; `accordion` e `slider`
  novos do shadcn usados só pela página; tokens `brand-mint`/`brand-night`/`font-display` no `globals.css`) não mudam
  nada no app. typecheck, 457 testes, lint e build ok; em `next start`: `/` → `/login`, `/painel` → `/login?next=...`,
  `/institucional` 200 sem erros no console. Merge na `v2` → deploy da Vercel em `maanu.com.br`.
- **SEO (2026-10-15)** — pedido: "SEO perfeito, busca orgânica rápida, Google e IAs (ChatGPT, Claude, Gemini) achando a
  página". Medição inicial (Lighthouse, celular): desempenho 84 (LCP 3,9 s), SEO 100, acessibilidade 96; a página "/" estava
  sem imagem de compartilhamento (o `openGraph` da página apagava a do arquivo), as respostas fechadas das Dúvidas não
  estavam no HTML e os toasts/tooltips do app carregavam na página de vendas. Conferido que os robôs de IA já entram em
  `maanu.com.br` (200 para GPTBot, ClaudeBot etc.; Cloudflare em DNS only, sem bloqueio).
  Feito: `lib/site/seo.ts` (título "Respostas automáticas com IA para o Mercado Livre | maanu", descrição, imagem
  `public/og/maanu-pagina-de-vendas.jpg` 1200×630 feita com as fontes e cores da marca, JSON-LD, lista de robôs, `llms.txt`)
  e `lib/site/faq.ts` (13 dúvidas; novas: "O que é a maanu?", "Quanto custa a maanu?" (gerada dos planos) e "Funciona para
  qualquer tipo de produto?"); metadata da página (canonical, pt-BR, `max-image-preview:large`, Open Graph/Twitter,
  verificação opcional por variável); `app/robots.ts`, `app/sitemap.ts` (com data), `app/llms.txt/route.ts`;
  `isIndexableHost` + `X-Robots-Tag` no `proxy.ts`; termos/privacidade com descrição e canonical; texto do topo citando
  "Mercado Livre"; título do topo sem esconder o texto na entrada; providers do app fora do layout raiz; menu do celular
  sob demanda; contrastes ajustados (rodapé, demonstrações, "No dia a dia", itens não incluídos dos planos).
  Resultado (Lighthouse em `next start`): celular **90–91** de desempenho (FCP 1,5 s, LCP ~3,5 s simulado em 4G lento; no
  computador local a página pinta em 0,33 s), TBT 30 ms, CLS 0; computador **100**; SEO, acessibilidade e boas práticas
  **100** nos dois. Testes novos `tests/unit/site-seo.test.ts`; typecheck, 455 testes, lint e build ok (`/` e `/llms.txt`
  estáticas). Menu do celular testado (abre, links levam à seção e fecham). Sem mudanças no banco, na Vercel, no ML ou no
  Supabase Auth.

### 2026-10-14 — Sessão 23b · Aviso antes do pagamento e limpeza do teste (IA: Claude, via app Codex)
- O Breno colocou a `ABACATEPAY_API_KEY` (chave de **teste**) e a `ABACATEPAY_TEST_EMAILS`, cadastrou o webhook pelo painel e
  assinou o Pro com o cartão 4242: webhook `subscription.completed` aplicado, Assinatura mostrando "Pro ativa, VISA final 4242,
  próxima cobrança 14/11". Perguntou se dava para fazer a compra inteira dentro da maanu (checkout transparente): dá só para
  cobranças avulsas (cartão via `abacatepay.js` + `cardToken`); a recorrência teria de ser feita pela maanu (cron,
  tentativas, troca de cartão, risco de cobrança dupla). **Decisão do Breno: manter a página da AbacatePay por enquanto.**
- Pedido: avisar que o cliente vai para o gateway e uma tela de carregamento. Feito `CheckoutRedirectDialog` (Dialog do
  shadcn, sem fechar por Esc/clique fora): "Levando você para o pagamento seguro", plano e valor, 3 garantias (ambiente
  seguro; dados do cartão só na AbacatePay; volta para a maanu com o plano liberado), "Preparando…" → "Abrindo…", fica pelo
  menos 1,8 s para dar tempo de ler e mostra "Clique aqui para continuar" se a página não abrir em 8 s. Abaixo do botão:
  "Você vai para a página segura da AbacatePay". Visto no navegador (página temporária local, apagada).
- **Limpeza do teste (pedido do Breno, "remover tudo isso de teste"):** o teste foi feito na organização **Girassol Moda
  Jeans** (o cliente real da semana de teste). Apagados só os registros `dev_mode` (1 assinatura, 1 página de pagamento,
  1 notificação) e a loja voltou ao estado de antes: teste grátis até 20/10, sem plano, limite de 1 conta do ML (a conta
  ativa dela continua). `ABACATEPAY_TEST_EMAILS` removida da Vercel. Na AbacatePay (Dev mode) a assinatura de teste continua
  existindo: se ela mandar alguma notificação, é ignorada (não está mais ligada a nenhuma loja).

### 2026-10-14 — Sessão 24 · Mensagem de acesso restrito no admin (IA: Codex)
- Pedido do Breno (print de `/admin/cobranca`): cliente logado sem permissão de administrador deve ver uma mensagem
  customizada em vez do 404 padrão do Next em inglês.
- Causa: `getAdminIdentity()` chamava `notFound()` de propósito desde a Sessão 13. Agora chama `redirect("/acesso-negado")`;
  layout, páginas e leituras continuam barrando o cliente antes de consultar dados administrativos. Exportação CSV também
  passa por `requireAdmin()` (antes devolvia um 404 isolado). Ações e funções do banco mantêm as mesmas permissões/MFA.
- Tela nova `app/acesso-negado/page.tsx`: shadcn Card/Badge/Button, logo oficial, tokens da marca, título "Você não tem
  acesso a esta página", explicação e "Voltar ao meu painel". Exige apenas login (`requireUser`), sem depender da situação
  do plano/onboarding/conta ML. `ADMIN_HOST` permite a tela e o botão aponta ao domínio do app (sem redirecionamento em loop).
- Regressão reproduzida antes da correção: cliente recebia `not_found` e o link de exportação devolvia 404. Testes novos
  em `admin-access.test.ts` e `admin.test.ts`: cliente/perfil ausente negados, visitante pede login, admin exige MFA recente,
  admin válido entra, ações recusadas, exportação negada sem consultar dados e `ADMIN_HOST` sem loop.
- QA no navegador local com Auth/perfil simulados em localhost (sem acesso ou escrita no banco real): `/admin/cobranca`
  abre a mensagem; layout conferido em 1280 e 390 px. HTTP: `/admin`, Cobrança, Clientes, Verificação e exportação →
  307 para `/acesso-negado`; visitante → login. Servidores e arquivos temporários do QA removidos.
- Verificação final: `npm run typecheck`, `npm test` (**432 passando**, 36 cenários de integração pulados),
  `npm run lint` e `npm run build` ok. Sem alterações no banco, na infraestrutura ou na v1.
- Publicado: commit `e390421` na `v2` → produção do projeto `maanu` **READY**
  (`dpl_E1FAtatWsbWja1aW4up796omU74d`, domínio `maanu.com.br`). Conferido em produção sem sessão: login e webhook ML
  200; `/admin/cobranca` e `/acesso-negado` pedem login (307). Fluxo autenticado validado localmente com Auth simulado.

### 2026-10-14 — Sessão 23 · Cobrança pela AbacatePay (IA: Claude, via app Codex)
- Pedido do Breno: analisar toda a documentação da AbacatePay e preparar a maanu para a integração (ele já criou os
  produtos Starter, Pro e Escala na AbacatePay). A internet dele caiu duas vezes; a sessão anterior só tinha lido a
  documentação (nada escrito no projeto), então tudo foi feito nesta.
- Lido: `llms-full.txt` inteiro (~13 mil linhas: assinaturas, checkout, produtos, clientes, webhooks, segurança, dev mode,
  produção, changelog até 12/10/2026) + tipos e SDK oficiais (`@abacatepay/types` 4.0.0, `@abacatepay/sdk` 3.0.0, `rest`
  1.1.0, só para conferir formatos; **nenhuma dependência nova**). Achado importante fora da documentação: endpoints de
  webhook criados agora recebem **Standard Webhooks** (outro formato de assinatura); a maanu aceita os dois.
- Banco (produção): migração `20261014120000_cobranca_abacatepay.sql` (§6.1i) **ensaiada antes** junto com o teste novo numa
  transação desfeita (conferido que nada ficou), dry-run, `db push`; os 9 testes SQL passam depois. Tipos regenerados.
- Código: `lib/billing/abacatepay/*`, `lib/billing/engine.ts`, `lib/billing/subscription.ts`, `lib/dal/subscription.ts`,
  `lib/dal/admin-billing.ts`, rota `app/api/webhook/abacatepay`, ações da Assinatura e do admin, `PlanActionButton`,
  cartão "Sua assinatura", cancelar, volta do pagamento, aviso de cobrança recusada no topo, painel admin → **Cobrança** e
  cartão de cobrança na ficha do cliente; `computeAccess` mantém o acesso até o fim do período pago; Termos e Privacidade
  (rascunhos) citam a AbacatePay, renovação, troca e cancelamento.
- Testes: `tests/unit/abacatepay.test.ts` (configuração, produtos, origem nos 2 formatos, leitura, decisões, datas,
  intenções) e `abacatepay-webhook-route.test.ts` (503/401/200/500). **Fluxo inteiro no banco real** com a API simulada
  (`tests/integration/billing-db.test.ts`, `RUN_BILLING_DB=1`): assinar, clicar de novo, webhook, entrega repetida, subir de
  plano, renovar, evento atrasado, cobrança recusada, descer agendado, troca aplicada, cancelar (acesso até o fim) e
  assinatura desconhecida — loja temporária apagada no fim (conferido). QA visual da Assinatura no navegador local com uma
  loja temporária (cobrança recusada, troca agendada, botões, diálogos, anual, volta do pagamento, modo de teste), também
  apagada. O painel admin → Cobrança não foi visto no navegador (exige a 2ª etapa); typecheck e build ok.
- Vercel: `ABACATEPAY_WEBHOOK_SECRET` criada no projeto `maanu` (Production, sensível, aleatória, valor não registrado).
- Verificação: typecheck, 424 testes, lint e build ok. Publicado: commit `d691909` na `v2` → deploy de produção do projeto
  `maanu` **READY** (`dpl_3nhqbNmUs7rE9Q3xCtrn4ufixoWC`). Conferido em `maanu.com.br`: `GET /api/webhook/abacatepay` 200,
  POST com segredo errado 401 (o segredo já vale), login/termos 200, Assinatura e Admin → Cobrança pedem login, webhook do
  ML recebendo normalmente, nenhum erro nos logs. Falta o Breno: chave de API + conferir produtos + cadastrar o webhook
  pelo painel + teste com cartão 4242 (§13 item 0g).

### 2026-10-13 — Sessão 22 · Perguntas chegando sozinhas e foto do anúncio (IA: Claude, via app Codex)
- Pedido do Breno (1º cliente real conectado para a semana de teste, "Girassol Moda Jeans", conta ML `LOJAJEANSDAMODA`,
  `254752194`): a pergunta só aparecia na maanu depois de clicar em "Sincronizar com o ML" (tem que ser praticamente
  instantâneo) e a foto do anúncio não aparecia.
- Investigação (só leitura): no banco, as 2 perguntas do cliente entraram 15 s e 1,6 min depois de feitas, exatamente
  quando o Breno clicou em sincronizar. Nos logs da Vercel, o ML mandou a notificação de pergunta nova da conta `254752194`
  ao app da **v1** (`mlresponde.vercel.app`, app `2157906452264565`, ainda autorizado pelo cliente e pausado desde a
  Sessão 21) às 23:18:34 e 23:21:35 UTC, e **nada** chegou em `maanu.com.br` nesses horários (nenhuma requisição, nem com
  erro). Desde a conexão (22:30 UTC) o app da v2 não recebeu nenhuma notificação dessa conta, enquanto a v1 recebeu
  dezenas (envios, anúncios, perguntas). Só chegaram 2 notificações em `maanu.com.br`, no momento em que a IA respondeu —
  pelo horário e pela contagem, as da conta do Breno (`131607524`, que fez as perguntas e também está conectada). Na API do
  ML com o token do cliente (só GET): a autorização do app da v2 existe (criada às 18:30 de Brasília, com os escopos de
  comunicação) e a busca de perguntas funciona. Conclusão: o ML não está entregando as notificações dessa conta ao app da
  v2. Depois do deploy, com o token da conta do Breno (`SOUSABRENO30` é a **dona** do app da v2): a configuração do app no
  ML está certa (`notifications_callback_url` = `https://maanu.com.br/api/webhook/mercadolivre`, tópicos `questions`,
  `messages.created`, `items`, `shipments`, `orders_v2` e outros), `missed_feeds` **vazio** (o ML nem tentou entregar),
  `certification_status: not_certified` e `max_requests_per_hour: 18000` (300/min para o app inteiro). Nos 30 min seguintes
  chegaram ~20 notificações do ML em `maanu.com.br` (provavelmente da conta do Breno). Causa exata do lado do ML. Suspeito documentado
  pelo ML: o webhook precisa responder 200 em até 500 ms, senão os tópicos podem ser desligados ("fall back") e é preciso
  se inscrever de novo; o nosso consultava e gravava no banco antes de responder (medido de fora: 310–560 ms com a função
  já aquecida; fria passa disso).
- Foto: o ML devolveu `thumbnail` com `http://` (sem `secure_thumbnail`) e o `next/image` só aceita
  `https://*.mlstatic.com` → `/_next/image` respondia 400 (visto nos logs). Conferido: a mesma foto com https → 200.
- Feito:
  - `lib/answers/poll.ts` + `lib/answers/polling.ts` (puro): o cron `/api/cron/questions` (1/min) roda **rodadas a cada
    ~10 s durante ~50 s**; em cada uma, `GET /my/received_questions/search?status=UNANSWERED` (50 mais recentes) de todas
    as contas ativas, com token válido e organização com acesso; registra só as que o banco não tem, já manda para a IA
    (até 3 ao mesmo tempo) e roda a fila (`processDueQuestions(10)`). Mais de 16 contas → rodadas mais espaçadas (teto
    100 consultas ao ML por minuto = 1/3 do limite do app, 18.000/h; acima de 100 contas, rodízio). Erro numa conta não para as outras; rodada que passaria de 50 s fica para o minuto
    seguinte. `maxDuration` do cron: 120 s. A tela já atualiza sozinha (Realtime), então a pergunta aparece sem clicar.
  - Webhook: responde 200 **antes** de tocar no banco (tudo em `after()`, também no pós-venda) e loga cada notificação de
    pergunta/mensagem (`[webhook] pergunta X da conta ML Y (tentativa N)`) para sabermos quando o ML voltar a entregar.
  - `lib/mercadolivre/images.ts` (`mlImageUrl`): http → https só para fotos do `mlstatic.com` (outro endereço vira o ícone
    de pacote). Usado no `ItemThumb` (corrige as fotos já gravadas, sem mexer no banco) e ao gravar a foto em perguntas,
    pós-venda e Melhorias de anúncio.
  - Testes novos: `ml-images.test.ts`, `question-polling.test.ts` (rodadas, contas bloqueadas, erros, atraso) e
    `webhook.test.ts` (200 sem banco; registro e processamento depois).
- Consultas da rotina conferidas no banco de produção (só leitura). typecheck, testes (393), lint e build ok. Nada no banco.
- Ajuste depois de ler a configuração do app no ML (`max_requests_per_hour: 18000` para o app inteiro): teto da rotina
  baixado para **100 consultas/min** (1/3 do limite) e rodízio acima de 100 contas; o webhook também loga os tópicos
  ignorados (`[webhook] items da conta ML ... (ignorada)`), para sabermos de quais contas o ML está mandando.
- Publicado: commits `eda766b` e `bbc79b4` na `v2` → deploys de produção do projeto `maanu` **READY**
  (`dpl_7MxXiwW7fTXpu39H4unGYM7goK5e`, `dpl_FRpXCmARBt8ni1kJYt8SxTgsYbpg`). Webhook respondendo 200 em ~390 ms medidos do
  Brasil (rede incluída).
- **Resultado em produção:** a partir de ~23:32 UTC o ML passou a mandar notificações para `maanu.com.br` (antes do deploy;
  provável atraso do lado do ML para começar a notificar uma autorização nova, ~1 h) e os logs novos confirmam a conta do
  cliente (`items`, `shipments`, `invoices` e `questions` da `254752194`). Pergunta real "Tem na cor azul?": feita no ML às
  00:00:16,05 UTC, registrada na maanu às 00:00:16,76 e **respondida pela IA às 00:00:21,9 (~6 s)**, com a foto já em https.
  Outra ("Tem na cor preto?", 23:55:51) entrou em 3 s; a IA mandou para o vendedor (não achou o estoque da cor no kit) e foi
  respondida à mão.
- Pedido seguinte do Breno: cartões do topo de Perguntas na ordem **Respondidas pela IA, Respondidas por você, Para
  responder, Todas** (ordem das chaves de `INBOX_TABS` em `lib/questions/presentation.ts`; teste em `inbox.test.ts`). Em
  seguida o Breno pediu que a tela **abra no primeiro cartão** ("a principal sempre tem que ser a primeira"):
  `DEFAULT_INBOX_TAB = "ia"` (vale para `parseInboxTab`, `inboxHref` e o campo escondido da busca); os links que significam
  "o que espera você" (Painel: "Aguardando você" e "Esperando você", Resultados: "N aguardando você", aviso de pausa geral)
  passaram a levar `?aba=responder`. Pós-venda não mudou.

### 2026-10-13 — Sessão 21 · v1: botão de pausar a IA funcionando (IA: Claude, via app Codex)
- Pedido do Breno: o botão "Automação de Respostas" da v1 precisa funcionar (para pausar na v1 o cliente que vai testar a
  v2), **sem parar a IA de ninguém**.
- Causa: a v1 só checava `auto_reply_enabled` na rota legada `/api/process` (ninguém chama); o webhook
  (`lib/mercadolivre/workflow.ts`) sempre respondia. Armadilha: a coluna tem **default false** — leitura (só leitura) do banco
  da v1 mostrou **3 das 7 contas com `false`** e respondendo normalmente. Só ligar a checagem pararia essas 3.
- Feito (worktree `codex/v1-pausa-ia` a partir da `main`, fast-forward para a `main` = `bf56777`, pedido explícito do Breno):
  - `lib/mercadolivre/auto-reply.ts`: pausa **só** com `false` explícito; sem linha, nulo ou **erro ao ler o banco** = continua
    respondendo (nunca desliga por falha).
  - `workflow.ts`: checa antes de chamar a IA; pausada → `question_jobs.status = 'manual'` com pergunta e anúncio preenchidos,
    sem chamar a OpenAI nem postar no ML.
  - Toggle: confere se alguma linha mudou (antes dizia "ok" mesmo sem mudar nada); texto explica que é para responder pelo ML.
  - Callback do OAuth: conta **nova** nasce com `auto_reply_enabled = true` (reconexão não mexe na escolha; se a leitura falhar,
    grava como sempre, sem mexer na automação).
  - Painel: selo "⏸️ Robô pausado" e aviso nas perguntas pausadas.
- **Dado alterado no banco da v1 (antes de publicar):** as 3 contas com `false` passaram para `true` (comportamento real
  preservado: já eram respondidas). Lista local em `docs/v2/privado/v1-pausa-ia.md`. Conferido depois: as 7 contas `true`.
- Verificação: `tsc` ok, build ok, lint sem problema novo (os 4 `any` são antigos), teste da regra (7 casos) e simulação do
  workflow com banco/ML/IA falsos (ligada responde, pausada não chama a IA e fica `manual`, nulo/sem linha/erro de leitura
  respondem, pergunta já respondida no ML continua `done`). Produção: deploy `dpl_3gq3PDVhN3mEk7TujqPQrpAmiEDh` READY,
  login/settings/webhook 200, webhooks do ML chegando; nenhuma pergunta nova entre a publicação e o fim da sessão (a 1ª
  pergunta real confirma o fluxo).
- Rollback, se preciso: Vercel → `mlresponde` → Deployments → promover `dpl_DvR1qS3pZ6WpZxyLz7kANr6Vqoyv` (versão de
  junho). Os valores `true` não atrapalham a versão antiga.
- **Como pausar o cliente do teste na v1:** botão em **Configurações** do login **dele** na v1
  (`mlresponde.vercel.app/settings`). Pausado, a v1 continua recebendo as perguntas (aparecem como "Robô pausado") mas não
  responde; isso substitui remover o app "Meli Fácil" da conta ML (e é reversível pelo mesmo botão).

### 2026-10-13 — Sessão 20b · Starter com 300 respostas e espaço nos cards dos planos (IA: Claude, via app Codex)
- Pedido do Breno: (1) os cards dos planos em Assinatura estavam colados na borda de baixo do cartão "Planos"; (2) baixar o
  Starter de 500 para 300 respostas por mês (500 deixava o Pro pouco atraente).
- (1) Causa: o `Card` do shadcn tira o espaço de baixo (`has-data-[slot=card-footer]:pb-0`) quando existe um rodapé em
  qualquer nível dentro dele — os cards dos planos têm rodapé, então o cartão de fora também perdia o espaço. Corrigido só no
  cartão "Planos" (`has-data-[slot=card-footer]:pb-(--card-spacing)`), conferido no navegador.
- (2) `lib/plans/plans.ts`: Starter 300. O **teste grátis também foi para 300** (antes 500, igual ao Starter; manter 500 daria
  ao teste de 7 dias mais respostas que o plano mensal de entrada). Sem migração (limites de respostas só no código).
  Documentação atualizada (aqui, spec e referências de mercado).
- QA com usuário temporário (apagado no fim). typecheck, testes, lint e build ok.

### 2026-10-13 — Sessão 20 · Planos Starter/Pro/Escala, limites e Melhorias de anúncio (IA: Claude, via app Codex)
- Pedido do Breno: implementar os planos que ele definiu sobre a proposta da Sessão 19 (nomes Starter, Pro e Escala; Starter
  com 500 respostas; sem "usuários da equipe"; sem excedente no Escala; relatórios não são diferencial), pós-venda a partir
  do Pro, criar/melhorar as **sugestões de melhoria de anúncio** a partir das perguntas mais feitas e publicar na v2. Gateway
  futuro: AbacatePay (só para conhecimento). Spec: `docs/superpowers/specs/2026-10-13-planos-design.md`.
- Banco (produção `ookosqyfazobiwmopiix`): migração `20261013140000_planos.sql` (§6.1h) **validada antes** junto com cada um
  dos 8 testes SQL numa transação desfeita (conferido que nada ficou), depois `db push` (dry-run antes). Tipos regenerados.
  Os 8 testes SQL passam depois do push (`planos_rls.sql` novo; `pos_venda_rls.sql` com a organização B no Starter, porque o
  teste grátis agora inclui o pós-venda).
- Código: `lib/plans/plans.ts` reescrito (catálogo, plano em vigor, teste grátis, preços), `lib/plans/usage.ts`,
  `lib/dal/plan.ts`; limite conferido em `processQuestion` e no pós-venda antes da IA (`answers_limit`); webhook, cron e OAuth do
  pós-venda usam o plano em vigor (o teste grátis entra); `AppContext` ganhou `plan`, `createdAt`, `trialEndsAt` e
  `monthlyAnswersLimit`; avisos de 80%/esgotado no topo; Painel, Assinatura (plano, uso e os 3 planos com Mensal/Anual),
  Contas e Resultados atualizados; painel admin (plano preenche contas/mensalidade, ciclo, acordo de respostas, ficha com uso,
  histórico com os campos novos). Melhorias de anúncio: `lib/listing-improvements/*`, `lib/dal/listing-improvements.ts`,
  `/melhorias` e `/melhorias/[id]`, `components/melhorias/*`, `components/plans/*`.
- IA real: `tests/integration/listing-improvement-live.test.ts` passou (mesa lateral com 12 perguntas: medidas com os números
  das respostas do vendedor, montagem e material dos pés; ignorou desconto e perguntas isoladas; ~7 s). Chave lida pela API da
  Vercel só na memória do processo.
- QA no navegador (servidor local → banco de produção, loja temporária "Loja QA Planos" com conta ML fictícia, 41 perguntas e
  1 análise): Painel com aviso de 82%, Assinatura (Pro/anual/Starter/teste grátis), limite esgotado, Melhorias (lista, erro
  sem tokens sem gastar cota, análise, "Já fiz"), Starter redirecionando para Assinatura com o aviso, Resultados com o
  rodapé, celular 390 px. Ajustes no caminho: passos e tabela no celular, contas no limite sem vermelho, textos dos planos.
  **Tudo apagado no fim** (usuário, organização, conta, perguntas, análise; script e arquivos temporários).
- Verificação: typecheck, 366 testes, lint 0, build ok. Commit `6fa4741` na `v2` → deploy de produção do projeto `maanu` **READY**;
  `maanu.com.br` conferido (login 200, `/melhorias` e `/assinatura` pedem login, webhook 200).

### 2026-10-13 — Sessão 19 · Pesquisa de preços dos concorrentes e proposta de planos (IA via app Codex)
- Pedido do Breno: pesquisar plataformas brasileiras parecidas com a maanu (IA respondendo nos marketplaces), levantar
  preços e planos e propor 3 níveis; ideia dele: pós-venda no plano superior e limite de perguntas por plano.
- Lidos os sites oficiais de ~30 plataformas (preços públicos em 2026-10-13): diretos (AgilizaPRO, Zelure, Vantaro,
  SellerChat, Ginte, LiveDesk, AnswerForMe, SmartSelling, Otto, Rednev, TrueSeller, Real Trends), SAC enterprise (GoBots,
  Predize, Zaapi, Vechat, Atendente.AI, Promp) e gestão/ERP com IA (QuantumOps, MeliPilot, Ryzo, Fluv Hub, ADS Premium,
  Seconds, UpSeller e outros sem preço público). Tabela e leituras em `docs/v2/referencias-mercado.md`.
- Proposta (não decidida): Essencial R$ 97 (300 respostas, 1 conta, sem pós-venda) · Pro R$ 197 (1.500, 3 contas,
  pós-venda) · Escala R$ 397 (5.000 + excedente, 10 contas); anual com 2 meses grátis; teste de 7 dias com o Pro.
  Exigiria renomear o plano que libera o pós-venda (hoje `essencial`) e construir: contador/limite de respostas, cobrança
  (sub-projeto 4), equipe, melhorias de anúncio e relatório mensal.
- Só documentação; nada no código nem no banco.

### 2026-10-13 — Sessão 18 · Tour de boas-vindas e avisos com visual próprio (IA: Claude, via app Codex)
- Pedido do Breno: usar as 4 imagens novas (`passo1..4.png`, colocadas na raiz) no tour do primeiro acesso, deixar o tour mais
  clean/bonito e mudar o visual dos avisos "sem conta do ML" e "teste de 7 dias" (estavam idênticos ao AgilizaPRO), mantendo
  as regras: ML até conectar uma conta; teste até acabar ou até assinar.
- Imagens: originais movidas para `docs/brand/onboarding/` (usado o `passo2semfundo.png` como passo 2; o com fundo branco
  ficou como `passo-2-com-fundo.png`, só referência); `docs/brand/scripts/onboarding.mjs` (sharp) recorta as margens e
  equilibra o tamanho dos 4 desenhos em `public/tour/passo-N.png` (640 px). Pasta `tour` e não `onboarding` porque
  `/onboarding` já é uma rota do app.
- Tour (`components/app/welcome-tour.tsx`): diálogo shadcn largo em duas colunas — à esquerda a ilustração num "palco" claro
  (grade de pontos suave, brilho branco, logo maanu) com troca deslizando; à direita etapas nomeadas (Rapidez, IA, Controle,
  Contas) com barra de progresso clicável, título e texto, "Pular", voltar e "Próximo"/"Começar a usar". Setas ← → navegam;
  foco inicial no diálogo; clicar fora não fecha mais; erro ao gravar mostra aviso e fecha mesmo assim. Respeita "reduzir
  movimento". No celular a ilustração fica em cima.
- Avisos: `components/app/access-banners.tsx` removido. `lib/access/notices.ts` (puro, 10 testes novos em
  `tests/unit/notices.test.ts`) decide quando e o que aparece; `trial-status.tsx` + `trial-ring.tsx` (cartão no rodapé do menu,
  anel no menu recolhido, selo no topo do celular; âmbar nos 2 últimos dias; vermelho quando bloqueado);
  `account-notices.tsx` (cartões `Item` do shadcn no topo do conteúdo: conta do ML com ponto âmbar e "Conectar agora" —
  `ConnectMlDialog` ganhou a prop `size` — e a pausa geral da IA). Regras de acesso e bloqueios não mudaram.
- QA visual numa página temporária com dados fictícios (sem banco; apagada antes do commit) no navegador do app, em 1440 px e
  390 px: os 4 passos, menu aberto/recolhido/gaveta do celular, teste com 5, 2 e 1 dia, bloqueado, sem conta, contas
  inativas, membro comum e pausa geral. Ajustes feitos no caminho: anel de foco no 1º passo ao abrir, textura do palco
  invisível, botões "Ver contas"/"Ver perguntas" sem borda (ver §8 P2), textos cortados no cartão e no celular.
- Verificação: typecheck, 341 testes, lint 0, build ok. Nada no banco.

### 2026-10-12 — Sessão 17 · Chaves de IA no painel do administrador (IA: Claude, via app Codex)
- Pergunta do Breno: qual o jeito mais seguro de cadastrar os tokens da IA? Hoje são variável de ambiente e ele vai precisar
  trocar e variar; pensou num lugar no painel admin. Resposta: dá para fazer seguro se a chave ficar criptografada com uma
  chave-mestra fora do banco e o painel só gravar; e várias chaves não aumentam o limite da OpenAI (é por projeto). Breno:
  "pode implementar ... na v2 direto" (produção sem usuários ainda). Spec: `docs/superpowers/specs/2026-10-12-chaves-ia-design.md`.
- Banco (produção `ookosqyfazobiwmopiix`): migração `20261013012212_chaves_ia.sql` **validada antes** numa transação que
  terminava em erro (migração + testes juntos, tudo desfeito; conferido que a tabela não ficou), depois `db push` (dry-run
  antes). Ao rodar os testes de novo depois do QA, a trava de 10 min pegou a troca automática real do QA (histórico imutável)
  → migração `20261013015035_chaves_ia_trava.sql`: o teste encurta a trava só dentro da própria transação. Os 7 testes SQL
  passam. Tipos regenerados. §6.1g.
- Código: `lib/ai/{keys,key-crypto,key-store,key-check}.ts`, `trackedCompletion` agora entrega o cliente OpenAI da chave
  certa (`runAnswerModel`/`runAfterSaleModel` recebem `(client) => ...`; `getOpenAIClient` removido), registro com
  `ai_key_id`/`key_source` e erros sem pedaços de chave; `/admin/chaves-ia` (ordem de uso painel → reserva → variável,
  tabela com teste/uso/custo, cadastrar, ações, boas práticas, últimos eventos), item no menu, filtro "Chaves de IA" na
  Auditoria, `OPENAI_API_KEY` opcional em `lib/env.ts`. 20 testes unitários novos (inclui a troca automática com banco e
  OpenAI simulados).
- Vercel: `AI_KEYS_ENCRYPTION_KEY` gerada (nunca exibida) e criada como **sensível** no projeto `maanu` (Production) e no
  `mlresponde` (Preview + `v2`); cópia no `.env.local`. (A `OPENAI_API_KEY` do `maanu` já era sensível.)
- QA local (servidor em `localhost:3100` com a `OPENAI_API_KEY` só no ambiente do processo, lida da Vercel em memória) com um
  admin temporário (2 etapas cadastrada com código gerado na hora): chave falsa recusada no teste e não salva; chave real
  testada, salva e em uso; repetida recusada; "Testar agora"; chamada real pelo `trackedCompletion` usando a chave do painel
  sem `OPENAI_API_KEY` no processo; **troca automática de verdade** (chave falsa posta em uso direto pelo banco → 401 →
  desativada, reserva assumiu, chamada repetida com sucesso, "por sistema" no histórico); reativar a recusada falha no teste;
  desativar sem reserva (aviso de cair na variável); remover; Auditoria com o filtro novo; celular 390 px. Achados e
  corrigidos: QR da 2ª etapa quebrava a tela (bug antigo, §8), página do admin mais larga que a tela (§8), espaço sumindo
  antes de aspas no JSX (`&quot;` → aspas tipográficas), mensagem de erro duplicada no cadastro.
- Limpeza: chaves de QA removidas pelo próprio painel (tabela vazia), admin temporário e a organização dele apagados, servidor
  parado, arquivo de teste temporário apagado, chaves fora da memória. Ficam no banco, de propósito: o histórico do QA
  (`admin_audit_log` é imutável: entrada no painel, 2 etapas e `ai_key.*` do usuário `qa-chaves-ia-…@example.com`) e 7
  linhas reais de `ai_usage_events` (testes de chave e chamadas do QA, custo total US$ 0,0000142).
- Verificação: typecheck, 331 testes, lint 0, build ok; 7 testes SQL ok.

### 2026-10-12 — Sessão 16 · Textos do cadastro sem falar em cobrança (IA: Claude, via app Codex)
- Pedido do Breno (com print da etapa 2): quem só quer testar pode estranhar falar de cobrança no período grátis.
- Etapa 2 do cadastro: "Dados para cobrança" → **"Dados da conta"** ("Último passo: conte quem é o titular da conta. Seu
  teste continua grátis e sem cartão."); "Titular da cobrança" → "Titular da conta"; opções "Conta no seu CPF" / "Conta
  no CNPJ da empresa"; endereço "Seu endereço ou o da sua empresa."; rodapé sem "cobrança e nota fiscal". Contas antigas
  ("Complete seu cadastro") também sem cobrança. Configurações continua com "Dados de cobrança".
- Código: `lib/billing/copy.ts` (textos por `variant` `signup`/`settings`), prop `variant` no `BillingProfileForm`,
  `app/onboarding/page.tsx`, mensagem de erro da etapa. Teste novo impede palavras de cobrança nos textos do cadastro.
  Dados, validação e regras (único, imutável) não mudaram; nada no banco.
- Verificação: typecheck, 311 testes, lint 0, build ok. Sem QA no navegador: o `.env.local` agora aponta para o banco de
  produção e não criei usuário de teste nele (mudança só de texto, coberta pelo teste).
### 2026-10-12 — Sessão 15b · Fase 1 da troca: banco limpo, chaves novas, projeto Vercel `maanu` (IA: Claude, via app Codex)
- Breno: "pode fazer"; vai pôr o domínio no **Cloudflare** e cuidar do DNS; já tem conta no **Resend**; pode apagar a Noord.
- Banco (`ookosqyfazobiwmopiix`): apagadas a conta ML fictícia `LOJA_DEMONSTRACAO` (398 perguntas, 2 ensinadas, 1 bloqueio
  em cascata), a organização "Noord Shop" e o login dela (`brenosousaf132@…`), e `ai_usage_events`. Ficou só o admin do Breno.
- Chaves: criada a secret `maanu_servidor`; `.env.local` e variáveis Preview `v2` trocadas para publishable/secret; teste
  com usuário temporário (cadastro pelo servidor, login, JWT ES256, `getClaims`, RLS, tokens negados; apagado no fim) e
  staging (páginas e os 2 crons = 200); depois **chaves legadas desligadas**, **HS256 revogado** e a secret `default` apagada.
  Conferido: a anon antiga recebe 401.
- Vercel: projeto **`maanu`** criado pela API (repo `brenosousaf13/mlresponde`, production branch `v2`, só publica a `v2`),
  9 variáveis de Production (falta `ML_CLIENT_SECRET`, que só o Breno tem), domínios `maanu.com.br` + `www` (308). 1º deploy
  de produção ok; logs mostram os crons de 1 min respondendo 200. Projeto antigo `mlresponde`: ignored build step para só
  publicar `main` e `v2`.
- Supabase Auth: Site URL e redirects para `maanu.com.br` (staging mantida na lista durante o teste; localhost removido).
- E-mails do login em português (`scripts/emails-auth/gerar.mjs` → `supabase/templates/*.html`): confirmação, nova senha,
  troca de e-mail, link de acesso, convite, código e avisos de senha/e-mail alterados. O Supabase **recusou aplicar** sem SMTP
  próprio (plano grátis) → aplicar quando o Resend estiver ligado.
- `AGENTS.md` e §2: `v2` agora é produção (push só com as 4 verificações) e o banco da v2 é produção.
- DNS: Breno ativou o Cloudflare (NS `chance`/`malavika.ns.cloudflare.com`). O domínio abriu sem HTTPS ("Não seguro"): a
  Vercel ainda não tinha emitido o certificado. Resolvido pedindo o certificado pela API (`POST /v8/certs` com
  `maanu.com.br` e `www.maanu.com.br`; Let's Encrypt, renovação automática). Conferido: `https://maanu.com.br` 200,
  `http` e `www` redirecionam (308). Registros do Resend publicados (`send` → `forge.rmta.net`, DKIM `resend._domainkey`,
  DMARC `p=reject`); SMTP no Supabase ainda não ligado.
- **SMTP ligado** pelo Breno à mão no Supabase (a conta Resend dele já tem integração com outro Supabase): `smtp.resend.com`
  465, usuário `resend`, senha = API key só de envio restrita a `maanu.com.br`, remetente `nao-responda@maanu.com.br`
  ("maanu"), intervalo 60 s por usuário. IA aplicou os 8 modelos em português (conferidos 1 a 1), avisos de senha/e-mail
  alterados ligados e limite de 30 e-mails/hora. Teste: cadastro pela API de Auth com `brenosousaf13+teste-maanu@gmail.com`
  → 200 com `confirmation_sent_at`. **Breno confirmou: o e-mail de confirmação e o de nova senha chegaram e funcionaram.**
  Usuário de teste e a organização dele apagados (SQL). No banco ficaram o admin do Breno ("Loja Maanu") e uma conta nova
  `brenosousaf132@…` com a loja "Descomplicasa" (criada pelo Breno depois da limpeza; não mexida).
- ⚠️ Dica técnica: a chave `sb_secret_` é **recusada** quando a chamada vem com User-Agent de navegador — o PowerShell
  (`Invoke-RestMethod`) manda "Mozilla/..." e recebe "Forbidden use of secret API key in browser". Para tarefas de
  administração usar Node (`@supabase/supabase-js`) ou SQL via `npx supabase db query`. O app (servidor Node) não é afetado.

### 2026-10-12 — Sessão 15 · Plano da troca e reforço de segurança do Supabase da v2 (IA: Claude, via app Codex)
- Pergunta do Breno: dá para tornar a v2 a `main` sem derrubar os clientes, sem migrar ninguém (6 clientes vão se
  recadastrar) e sem importar nada do banco da v1? Resposta: sim (a `main` não tem commits que a `v2` não tenha). A IA
  sugeriu banco e app ML novos para manter a v1 viva em paralelo; o Breno decidiu: **v1 será descontinuada** (não precisa
  protegê-la), **manter o projeto Supabase atual da v2 (plano grátis)** como produção, **mesmo app ML** trocando as URLs e
  domínio **`maanu.com.br`** (comprado; DNS ainda no padrão do Registro.br). Pediu garantir a segurança do banco.
- Auditoria só leitura (Management API, SQL de catálogo, consultas com a chave pública, histórico do git) e correções no
  projeto `ookosqyfazobiwmopiix`: migração `20261012231651_reforco_seguranca.sql` aplicada (§6.1f); SSL obrigatório;
  senha do banco trocada por uma aleatória não guardada; senha de usuário com letras + números no Auth e em
  `lib/validation/forms.ts` (+ aviso nas telas de cadastro, nova senha e Configurações; teste novo). Bloqueio de senhas
  vazadas recusado pelo Supabase (só no Pro). Resultado completo em §8.
- Conferido depois: visitante recebe 401 em todas as 20 tabelas e nas funções; usuário logado comum negado nas tabelas
  sensíveis e no painel admin; 6 testes de RLS ok; avisos de segurança restantes são intencionais (§8).
- ⚠️ Transparência: a leitura da configuração do PostgREST pela Management API mostrou o **JWT secret legado** do projeto no
  terminal desta sessão (não foi salvo nem commitado). Fica como pendência trocar para as chaves novas e revogar as legadas
  antes de abrir para clientes (§13, 0a).
- Vercel (só leitura): time no plano **Pro** (crons de 1 minuto permitidos), production branch `main`, domínios
  `mlresponde.vercel.app` (produção) e `mlresponde-v2.vercel.app` (→ `v2`). O token da CLI tinha expirado; renovado com
  `npx vercel whoami`.
- Verificação: typecheck, 298 testes, lint 0, build ok. Nada mudou na v1/produção.
- Ajuste no mesmo dia: o Breno vai testar 1 semana com 1 cliente na v2 antes de desligar a v1 → app ML **da v2** vira o
  definitivo, v2 num projeto Vercel novo "maanu" (production branch `v2`) e `main` só muda depois (§11, §13 0a).

### 2026-10-12 — Sessão 14 · Cliente real da v1 importado na staging (IA: Claude, via app Codex)
- Pedido do Breno: trazer o perfil inteiro de UM usuário da v1 (com todas as perguntas e respostas) para a v2, para ver
  como os dados se comportam e popular a staging.
- Acesso à produção **só leitura**: a service role da v1 foi lida da API da Vercel só em memória e usada apenas em GET
  (auth admin + REST), sem nenhuma escrita. Levantamento dos 7 usuários; escolhido o mais completo (loja de moda feminina,
  conta ML com 831 perguntas de 14/05 a 12/10/2026, base de conhecimento de 24.898 caracteres, 113 exemplos). A mesma loja
  tem uma 2ª conta na v1 (1.631 perguntas, sem exemplos) — não importada.
- Novo: `lib/migration/v1.ts` (regras, §6.3) + `tests/unit/migration-v1.test.ts` (12 testes), `scripts/v1-para-v2/exportar.mjs`
  e `importar.mjs` (Node roda o TypeScript de `lib/` direto; avisa `MODULE_TYPELESS_PACKAGE_JSON`, inofensivo — usar
  `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON`). A base de conhecimento foi convertida à mão para a configuração
  guiada (11 de 16 respostas, fichas dos 6 modelos em "Detalhes confirmados", tabela de tamanho/altura/peso, trocas,
  garantia, regras especiais; exemplos de respostas em "Outras informações"; modo "Responder sempre" com o texto da
  Regra 0.4 da loja como mensagem padrão). Links da v1 viraram "Minhas compras"/Ajuda (a v2 bloqueia links).
- Supabase de **testes**: organização da loja com cortesia, dados de cobrança **fictícios** (CNPJ válido gerado), conta ML
  sem tokens, 820 respondidas pela IA (46 com a mensagem padrão), 3 respondidas fora, 4 para responder (erros/travadas da
  v1), 4 arquivadas (a v1 nem leu), 113 respostas ensinadas, nota interna no painel do admin. Login
  `brenosousaf13+<loja>@gmail.com` (senha passada ao Breno no chat).
- QA na staging e local (1440 px): Painel, Perguntas (abas, filtro "Só mensagem padrão", conversa), Resultados (90 dias:
  R$ 438 de economia, mediana 4 s, mapa de horários, anúncios e assuntos), Assistente (configuração concluída, 113
  ensinadas), Contas ("Reconexão necessária"). Ajustes durante o QA: data de "respondida fora" vazia (antes aparecia
  "Você leva 5 s" falso em Resultados) e respostas com o texto padrão marcadas como mensagem padrão.
- Bug achado e corrigido: loop de redirecionamento no /login com sessão de usuário apagado/bloqueado (§8, `proxy.ts`).
- Achados da v1 (produção, não mexido): 3 perguntas presas em `processing` desde jul–set e erros "No ML credentials found
  for this seller" em set/2026 nas contas dessa loja (indício de reconexão/credencial perdida na v1).
- Verificação: typecheck, 297 testes (12 novos da migração), lint 0, build ok.
- **Limpeza (mesmo dia, pedido do Breno depois de testar):** apagados do Supabase de testes a organização importada (em
  cascata: conta ML, 831 perguntas, 113 ensinadas, dados de cobrança fictícios, nota interna), os 2 registros de uso de IA
  dos testes dele e o login; conferido: 2 organizações, 2 usuários e 398 perguntas, como antes, sem perfis ou organizações
  órfãos. Apagados também os arquivos da pasta privada (exportação, assistente convertido, LEIA-ME) e a chave da produção
  que estava na memória da sessão. Fica só o código (scripts, regras testadas e a correção do login). O histórico de
  auditoria do painel admin é imutável, mas não tinha registros dessa importação.

### 2026-10-12 — Sessão 13 · Painel do administrador (IA: Claude, via app Codex)
- Pedido do Breno: painel para monitorar a plataforma inteira (tokens gastos, financeiro, cadastros, usuários ativos,
  editar usuários "etc."); decidir entre subdomínio e `/admin` pelo mais seguro e completar o que faltasse.
  Spec: `docs/superpowers/specs/2026-10-12-painel-admin-design.md`.
- Decisão: `/admin` no mesmo app + **verificação em 2 etapas (TOTP do Supabase Auth) obrigatória** a cada 12 h + checagem
  em 3 camadas (proxy, `lib/dal/admin.ts`, `admin_assert()` no banco) + 404 para quem não é admin + auditoria imutável.
  Subdomínio pronto por `ADMIN_HOST` (§5) para quando houver domínio próprio.
- Migração `20261012120000_painel_admin.sql` aplicada no Supabase de **testes** (dry-run antes); tipos regenerados. Ver §6.1e.
- Novo: `app/admin/*` (verificação, Visão geral, Clientes + ficha + CSV, Uso de IA, Financeiro, Operação, Auditoria,
  `actions.ts`), `components/admin/*`, `lib/admin/*`, `lib/ai/{pricing,usage}.ts`, `lib/dal/admin.ts`, shadcn `input-otp`
  (dependência `input-otp`). Alterados: `runAnswerModel`/`runAfterSaleModel` (recebem o contexto de uso; pausa geral; erro
  `PlatformAiPausedError` vira "pausada" sem gastar tentativa), motores e ações que chamam a IA, `getAppContext` (último
  acesso), layout do app (aviso de pausa geral), menu do usuário (link do painel para admins), `proxy.ts` (ADMIN_HOST),
  `next.config.ts` (cabeçalhos noindex/DENY/no-referrer em `/admin`), tema do menu grafite em `app/globals.css`.
- Testes: `supabase/tests/admin_rls.sql` (TESTES_ADMIN_OK) + os anteriores; 23 unitários novos em `tests/unit/admin.test.ts`
  (total 285); typecheck, lint e build ok. A bateria com a IA real (`tests/integration`) **não** foi rodada de novo nesta
  sessão (o ambiente bloqueou passar a chave por arquivo); a mudança no `runAnswerModel` é só o envelope de registro e uma
  chamada real ponta a ponta pelo app foi conferida (abaixo). Rodar na próxima oportunidade.
- QA no navegador (servidor local → Supabase de testes, 1440 e 390 px) com admin temporário e 3 lojas fictícias: cliente
  comum recebe 404 em todo `/admin` e as funções do banco recusam (cliente, admin sem 2ª etapa); cadastro do autenticador
  (QR + código gerado por TOTP), código errado recusado e registrado; Visão geral, Clientes (busca por e-mail/apelido ML/
  nome, filtros pela interface, CSV com BOM e sem fórmulas), ficha (editar assinatura com validação, +7 dias de teste,
  confirmar e-mail, notas, link de senha nova usado de verdade e recusado na 2ª vez, bloquear → login recusado "User is
  banned" → desbloquear, trocar nome/WhatsApp/e-mail, pausar respostas de uma conta), Uso de IA (7/30 dias), Financeiro
  (premissas com validação), Operação (pausa geral → faixa no painel e aviso no app do cliente, Testar do Assistente
  bloqueado sem chamar a OpenAI → retomar), Auditoria (16 registros com antes/depois e IP, filtro). Subdomínio testado com
  `ADMIN_HOST=admin.localhost` (`/admin` 404 no app; no subdomínio só login + painel). Chamada real à OpenAI pelo Testar
  gravou 2.100 tokens de entrada/45 de saída e US$ 0,0002325 (conferido à mão). Ajustes do QA: logo clara no fundo
  grafite, eixo em US$ cortado, tabela "Por função" estourando, preços com vírgula, "< 1%", histórico com nomes legíveis,
  links entre app e painel com subdomínio. A chave da OpenAI foi lida da Vercel só em memória (passada por stdin).
  Dados de QA (usuários, lojas, perguntas, eventos de uso) apagados no fim; o histórico de auditoria do QA fica (é imutável).
- Deploy da staging: o automático da Vercel demorou ~4 min para aparecer; nesse meio-tempo dois deploys disparados pela API
  (`POST /v13/deployments` com `gitSource`) falharam com `git_info_fail` (ficaram na lista, inofensivos). Lição: esperar
  o deploy do push; **nunca** fazer deploy pela CLI local (sem o vínculo da branch ele usaria as variáveis gerais de Preview,
  que hoje são as de **produção**, §5). Staging conferida no ar: `/admin` sem login → `/login?next=/admin`.

### 2026-10-11 — Sessão 12 · Nova marca: maanu (IA: Claude, via app Codex)
- Pedido do Breno: trocar toda a identidade visual e o nome da plataforma para **maanu**; mandou a apresentação da marca, a
  logo e o "m." (para favicon e menu recolhido) e pediu para ajustar as cores em tudo.
- Logo e "m." vetorizados dos PNGs (`potracer`; o ponto virou círculo perfeito) → `components/brand/logo.tsx`
  (`LogoWordmark`, `LogoMark`: SVG no HTML, letras com `currentColor`, ponto teal) e `public/brand/*` (SVG/PNG, versões
  brancas, ícone 512). Originais e apresentação movidos da raiz para `docs/brand/` (nomes sem acento); guia em
  `docs/brand/README.md`; scripts `docs/brand/scripts/vetorizar.py` + `gerar.mjs` regeram tudo.
- Ícones: `app/icon.svg` + `app/favicon.ico` (16/32/48, "m." branco em quadrado grafite), `app/apple-icon.png`,
  `app/opengraph-image.png` (+ alt) para links compartilhados; `metadataBase` (de `NEXT_PUBLIC_SITE_URL`), Open Graph e
  Twitter no `app/layout.tsx`. Removidos `app/icon.png`, `public/brand/logo-*.png`, `public/logo.png` e `MeliLogo.png`.
- Tema (`app/globals.css`): tokens `brand-graphite|teal|teal-ink|sage|slate|offwhite`; `primary` teal `#009682`, neutros
  slate (texto = grafite), foco teal, gráficos teal (IA) / slate (você), raio 0,75rem; `.dark` coerente (não usado hoje).
  Trocadas todas as cores fixas da marca antiga (amarelo/marinho/azul) e os verdes que brigariam com o teal: "você" virou
  grafite/slate, "IA analisando" teal pulsando, caixas de sucesso em sage, cartão de economia de Resultados grafite com
  valor teal, aviso de teste grafite, aviso "conecte o ML" em sage, contador do menu teal.
- Menu: aberto mostra "maanu." + nome da loja; recolhido mostra só o "m." (clicar abre). Ajuste no QA: logo alinhada à
  esquerda (o SVG esticava na coluna) e `!important` no tamanho (o botão do menu força `size-4` em SVGs).
- Textos: `siteConfig` (nome, assinatura e slogan da apresentação), títulos ("Painel · maanu"), Termos/Privacidade
  ("a maanu"), README novo, pacote npm `maanu`. O nome continua só em `lib/config/site.ts`.
- QA no navegador (servidor local → Supabase de **testes**, 1440 e 390 px) com loja temporária e perguntas em todos os
  estados: login, Painel, Perguntas (lista e conversas IA/você), Resultados, menu aberto/recolhido, gaveta do celular,
  Termos; tags de ícone/compartilhamento conferidas (servidas sem login); sem erros no console. Usuário/loja de QA apagados.
- Verificação: typecheck, 262 testes, lint 0, build ok.

### 2026-10-11 — Sessão 11 · Pós-venda com IA, exclusivo do plano Essencial (IA: Claude, via app Codex)
- Pedido do Breno: feature exclusiva do plano Essencial — agente que responde as mensagens de pós-venda (compras feitas),
  mantém a conversa e usa o histórico; item novo no menu só para clientes Essencial; "do início ao fim, pensando em tudo".
- Documentação do ML conferida na hora (mensagens pós-venda, bloqueios, não lidas, notificações, vendas, envios): limite de
  350 caracteres em latin1, agentes de mensageria no Brasil desde 02/02/2026, vendedor não inicia conversa, motivos de bloqueio.
- Migração `20261011235900_pos_venda.sql` aplicada no Supabase de **testes** (dry-run antes); tipos regenerados.
- Novo: `lib/plans/plans.ts`, `lib/after-sale/*`, `lib/mercadolivre/messages.ts` (+ `mlFetchRaw` e FormData em `client.ts`),
  `lib/dal/after-sale.ts`, `app/(app)/pos-venda/*`, `app/api/cron/pos-venda`, `app/api/pos-venda/anexo`, `components/pos-venda/*`;
  webhook trata o tópico `messages`; callback do OAuth traz as não lidas; Painel (cartão), Assinatura (recursos do plano e
  aviso), menu com contador; `QuestionSearch` e `LiveRefresh` reutilizáveis; Server Actions aceitam 4,5 MB (anexos).
- Verificação: typecheck, **262 testes** (46 novos em `tests/unit/after-sale.test.ts`), lint 0, build ok; RLS
  `pos_venda_rls.sql` + os 4 anteriores ok; **IA real 12/12 em 2 rodadas** (1ª rodada 11/12 → ajuste da ordem dos motivos).
  A chave `OPENAI_API_KEY` foi lida pela API da Vercel só na memória (o login da CLI tinha expirado: `vercel whoami` renovou).
- QA no navegador (servidor local → Supabase de testes, 1440 e 390 px) com loja temporária "Passo Certo (QA)" no plano
  Essencial e 6 conversas fictícias: menu/contador, cartão do Painel, abas, conversa com anexo e rascunho, conversa fechada por
  mediação, configuração (recusa telefone, salva, liga), ensinar, celular, bloqueio sem plano (redireciona + aviso; anexo 403).
  Ajustes feitos no QA: detalhes da venda recolhíveis com resumo no título, conversa abre na última mensagem, plural no Painel.
  Usuário/loja de QA apagados.
- Não testado com conta ML real (precisa de conta de teste com uma venda). Produção (`main`) intocada.

### 2026-10-11 — Sessão 10 · Modo "Responder sempre" e leitura completa do anúncio (IA: Claude, via app Codex)
- Pedido do Breno: (1) chave para a IA sempre responder, com mensagem personalizável quando não souber; (2) garantir que a
  IA lê o anúncio inteiro. Spec: `docs/superpowers/specs/2026-10-11-modo-sempre-e-leitura-do-anuncio-design.md`.
- Migração `20261011235500_modo_responder_sempre.sql` aplicada no Supabase de testes (`db push`); tipos regenerados.
- `decision.ts` (modos, mensagem padrão, `FALLBACK_REASON_LABELS`), `prompt.ts` (seção do modo sempre; manda procurar em todas
  as partes do anúncio), `context.ts`/`engine.ts` (modo da conta, `fallback_reason`, leitura do anúncio sem engolir erro da
  descrição), `item.ts` reescrito (condições de venda, vários valores, variações com nome, medidas, catálogo, descrição até
  20 mil com começo+fim, HTML → texto), `questions.ts` (`fetchItemContext`), `parseItemId` (links de catálogo `/p/`).
- Telas: card + chave em Jeito de responder, passo novo na configuração guiada (20 passos), selo "sempre" no cabeçalho,
  Testar com 3 desfechos e "O que a IA leu deste anúncio", Perguntas com tom violeta, filtro `?padrao=1` e "Ensinar a IA"
  (`teachFromQuestion`, `components/perguntas/teach-fallback.tsx`).
- Testes: 216 unitários (+ `always-mode.test.ts`, `item-reading.test.ts`) e **22 cenários com a IA real** (`gpt-6-luna`),
  todos passando — inclui leitura da descrição, ficha, prazo de fabricação, medidas e o modo sempre (desconto, reclamação,
  contato, informação ausente). O cenário de "instrução escondida" passou a aceitar recusa educada sem contato (o Luna às
  vezes responde em vez de escalar; as duas saídas são seguras). RLS (`respostas_rls.sql`) ok. Typecheck, lint e build ok.
- QA no navegador (1440 e 390 px) com loja temporária no Supabase de testes: salvar/validar mensagem (telefone recusado),
  ligar/desligar, Testar no modo sempre, filtro e ensinar na caixa de entrada, passo da configuração guiada. Dados apagados.
- Trabalho em paralelo com a Sessão 9 (cobrança) na mesma pasta: commits separados, só com os arquivos de cada uma.

### 2026-10-11 — Sessão 9 · CPF/CNPJ e endereço no cadastro (IA: Claude, via app Codex)
- Pedido do Breno: coletar CPF/CNPJ e endereço no cadastro (para a cobrança) e permitir atualizar em Configurações;
  o CPF/CNPJ não pode mudar depois de vinculado e é único por conta. Spec `2026-10-11-dados-cobranca-design.md`.
- Migração `20261011235000_dados_cobranca.sql` aplicada no Supabase de **testes** (dry-run antes); tipos regenerados
  (só os trechos de `billing_profiles` e das 2 funções novas entraram neste commit). `cobranca_rls.sql` e
  `fundacao_rls.sql` ok.
- Novo: `lib/billing/*`, `lib/validation/billing.ts`, `lib/dal/billing.ts`, `components/billing/billing-profile-form.tsx`,
  onboarding em 2 etapas, card em Configurações, `needsOnboarding` (também no início do OAuth do ML), `AuthShell size="lg"`,
  Política de Privacidade (rascunho) com os dados de cobrança. 34 testes novos em `tests/unit/billing.test.ts`.
- QA no navegador (servidor local → Supabase de testes, Chromium headless, 1440 e celular 390): etapa 1 → 2, erros do
  servidor, CPF inválido, CEP preenchendo o endereço (ViaCEP) e foco no número, diálogo de confirmação, gravação, CPF
  travado em Configurações, edição do endereço, tentativa de trocar o CPF injetando campos (ignorada), conta antiga
  levada à etapa única, CPF duplicado barrado, CNPJ alfanumérico `12.ABC.345/01DE-35`, "Voltar", admin da plataforma
  dispensado. Sem erros no console. Usuários/organizações de QA apagados.
- ⚠️ **Outra conversa trabalhava ao mesmo tempo na mesma pasta** (modo "responder sempre" do Assistente, migração
  `20261011235500_modo_responder_sempre`, já aplicada no Supabase de testes por ela). Para não misturar, as verificações
  (typecheck, 185 testes, lint 0, build ok) rodaram numa worktree temporária só com os arquivos desta sessão, e o commit
  inclui só eles. Os arquivos da outra conversa ficaram intactos e sem commit.

### 2026-10-11 — Sessão 8 · Troca do modelo de IA para GPT-6 Luna (IA: Claude, via app Codex)
- Pedido do Breno: trocar o modelo que responde (gpt-4o-mini) pelo **GPT-6 Luna**, mais atual e mais barato, na `v2`.
- Conferido na documentação oficial da OpenAI: id `gpt-6-luna`, suporta Chat Completions e Structured Outputs; `reasoning_effort`
  aceita `none`; fora do `none` não aceita `temperature`; preço US$ 0,10 (entrada) e US$ 0,50 (saída) por 1M tokens.
- Código: `lib/answers/model.ts` (novo, padrão e parâmetros por modelo), `lib/answers/ai.ts` (`reasoning_effort: "none"`,
  `max_completion_tokens` no lugar de `max_tokens`), `lib/env.ts` (padrão `gpt-6-luna`), `.env.example`,
  `tests/unit/model.test.ts` (3 testes).
- Prompt (`lib/answers/prompt.ts`): com o Luna, a resposta sobre "comprar duas cores" avisava que a preta estava esgotada
  (quebra a trava "nunca citar variação esgotada"). Regra reforçada: não mencionar variação esgotada salvo se o comprador
  perguntar por ela pelo nome; ao explicar o carrinho, citar só as com estoque.
- Verificação: IA real (`gpt-6-luna`): antes do ajuste 11/12 (só o caso das variações); com o prompt final **12/12 em 3 rodadas
  completas** + 6/6 repetindo só o caso das variações;
  ~1–2 s por resposta. Chave `OPENAI_API_KEY` lida pela API da Vercel só na memória do processo. typecheck, 151 testes,
  lint e build ok. `OPENAI_MODEL` não existe na Vercel → staging passa a usar o Luna no próximo deploy da `v2`.
- Produção (v1, `main`) **não** foi alterada: continua com `gpt-4o-mini`.

### 2026-10-11 — Sessão 7 · Tela Resultados (analytics do vendedor) (IA: Claude, via app Codex)
- Pedido do Breno: faltava no menu uma opção de analytics para o cliente ver que a IA resolve — quanto respondeu mais
  rápido, quanto economizou (números financeiros), produtos com mais perguntas etc., com os componentes do shadcn.
- Feito numa worktree separada (`codex/resultados`) enquanto a Sessão 6 rodava em paralelo; rebase sem conflitos.
- Novo: menu Resultados, `app/(app)/resultados`, `components/resultados/*`, `lib/results/*`, `lib/dal/results.ts`,
  shadcn `chart` (dependência `recharts`), seção de acesso `resultados`, botão "Ver resultados da IA" no Painel, link
  "ver perguntas do anúncio" usando o filtro `?anuncio=` da Sessão 6. Spec `2026-10-11-resultados-design.md`.
- Migração `20261011230000_resultados.sql` aplicada no Supabase de **testes** (antes, durante o desenvolvimento, a mesma
  SQL idempotente foi aplicada direto para o QA local; depois registrada com `db push`). Tipos regenerados.
- QA: loja temporária com 613 perguntas em 95 dias (IA ligada no meio do período, perguntas importadas, noites e fins de
  semana) — desktop 1440 e celular 390: períodos 7/30/90, diálogo "Ajustar cálculo" (validação e salvar), gráficos, mapa,
  tabela → perguntas do anúncio, Painel → Resultados. Dados de QA apagados. "Loja Demonstração" ganhou histórico (ver §9).
- Verificação: typecheck, 148 testes (33 novos em `tests/unit/results.test.ts` e 1 em `access.test.ts`), lint 0, build ok; RLS `fundacao`,
  `respostas` e `resultados` ok.

### 2026-10-11 — Sessão 6 · Menu lateral, Perguntas em escala e resumo no Painel (IA: Claude, via app Codex)
- Pedido do Breno (com prints): botão de recolher o menu na própria barra; itens do menu colados no hover; a tela de
  Perguntas (que ele gostou) funciona com 1.000+ perguntas?; Painel com resumo das últimas perguntas e acesso rápido.
- Menu: `SidebarBrand` em `app-sidebar.tsx` (recolher no topo da barra; recolhido, a logo vira "abrir"), `gap-1` entre os
  itens, `AppHeader` só no celular.
- Perguntas: veja §7.0b item 6. Resumo da linha mostra o motivo (para responder) ou quem respondeu + prévia da resposta.
  Composer mais compacto (sem o parágrafo de dica; textarea com altura máxima). `timeAgo` arredonda antes de escolher a
  unidade (não mostra mais "há 60 minutos").
- Painel: `components/painel/question-cards.tsx` + `getDashboardData` com as listas; "Aguardando você" passou a contar todas
  as pendentes (igual ao menu e à aba), não só as dos últimos 7 dias.
- Migração `20261011220000_perguntas_escala.sql` aplicada no Supabase de **testes** (ver §6.1b).
- QA: usuário/loja temporários com **1.500 perguntas** no Supabase de testes; Chromium isolado em 1536×730 (tela do Breno),
  1440×900 e celular 390: página sem rolagem, lista rolando por dentro, troca de página, filtro por anúncio, ordem, busca,
  página inexistente, menu recolhido/hover, gaveta no celular, Painel. EXPLAIN com RLS: listas/contagens em 1–2 ms.
  Teste de Realtime (evento da própria loja chega, de outra loja não) e testes de RLS ok. Dados de QA apagados.
  ⚠️ Perguntas de QA com status `failed` atrapalham `respostas_rls.sql` (o teste usa `due_ml_questions(10)`): limpar antes.
- Verificação: typecheck, 114 testes (14 novos em `tests/unit/inbox.test.ts`), lint 0, build ok.
- Em paralelo, outra conversa estava criando a tela **Resultados** (analytics) numa worktree separada
  (`codex/resultados`, migração `20261011230000_resultados`); ela integra depois deste commit.

### 2026-10-11 — Sessão 5 · Assistente de IA + caixa de entrada de Perguntas (IA: Claude, via app Codex)
- Pedido do Breno: Perguntas confuso/"tudo branco"; renomear "Respostas da IA"; ligar/desligar discreto; configuração
  inicial com perguntas sobre o negócio que vira o system prompt (editável), mantendo as travas do prompt da v1 (enviado
  por ele); manter ensinadas/bloqueados se funcionarem. Spec `2026-10-11-assistente-ia-design.md`.
- Migração `20261011210000_assistente_ia.sql` aplicada no Supabase de **testes** (aditiva); tipos regenerados.
- Novo: `lib/assistant/*`, `lib/answers/{examples,context}.ts`, `lib/questions/presentation.ts`, `components/assistente/*`,
  caixa de entrada em `components/perguntas/*`, rota `/assistente`, token `--canvas`, shadcn `toggle-group`,
  `radio-group`, `scroll-area`. Removidos: `question-list`, `answer-dialog`, `answer-settings-form`, `auto-reply-switch`.
- Verificação: typecheck, 100 testes unitários, lint 0, build ok, RLS ok; **IA real 12/12** (2 rodadas) com o prompt novo —
  ajustes feitos durante o teste: responder "não oferecemos X" em vez de escalar, rascunho sem inventar, nunca citar
  variação esgotada, motivo em linguagem simples. QA no navegador (desktop 1440 e celular 390): filtros, lista/conversa,
  configuração completa (19 passos, salvamento e retomada), edição de item, prévia do prompt, estilo, ensinadas,
  bloqueados, ligar IA, Testar com IA real.
- Para os testes com IA real a chave `OPENAI_API_KEY` foi lida pela API da Vercel (só em memória e num arquivo temporário
  apagado em seguida). Usuário/organização de QA criados no Supabase de testes e apagados no fim. Staging conferida após o
  deploy (/respostas → /assistente, Testar com IA real). Contas que já estavam com a IA ligada antes da configuração
  (ex.: Loja Demonstração) abrem a configuração guiada e podem pausar, mas só religam depois de concluí-la.

### 2026-10-11 — Sessão 4b · Login de administrador (IA: Claude, via app Codex)
- Pedido do Breno: login de admin com tudo liberado para ver as telas (e para o futuro painel admin).
- Código: `decideSectionAccess` aceita `isPlatformAdmin` (libera tudo); selo "Admin" no menu do usuário; teste unitário.
- Supabase de testes: usuário admin criado já confirmado + "Loja Demonstração" com dados de exemplo (ver §9).
- ⚠️ A senha foi enviada no chat → recomendado o Breno trocar em Configurações depois do primeiro acesso.

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
- `proxy.ts` libera `/api/webhook` e `/api/cron` (rotas públicas; o cron valida `CRON_SECRET`, testado na staging: sem/errado → 401, certo → 200).
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

0l. **Aba Clientes (Sessão 28) — falta publicar.** Código na branch `codex/clientes` (4 verificações ok); migração já aplicada.
   (a) **Breno:** revisar e liberar o merge na `v2` (a IA faz o merge, o push e confere o deploy). (b) **Breno:** DevCenter
   do Mercado Livre → app da v2 (`8693830632560554`) → Notificações → ligar o tópico **Orders** (`orders_v2`), sem mudar a URL
   (`https://maanu.com.br/api/webhook/mercadolivre`). Sem ele, as vendas novas aparecem em até ~10 min pela conferência.
   (c) **IA, depois do deploy:** acompanhar a importação das 3 contas (`ml_customer_sync` por SQL só leitura; loja com dezenas
   de milhares de vendas por ano leva ~2 h para importar e nomes/cidades completam em até ~1 dia, a 60 chamadas/min), conferir
   numa venda real que nome e cidade chegam, logs do cron `clientes` sem erro e que perguntas e pós-venda seguem normais.
   Ideias não feitas: exportar CSV, juntar o mesmo comprador de lojas diferentes, "clientes mais valiosos" no Painel.

0k. ✅ **TROCA DE ENDEREÇOS concluída (Sessão 27, 2026-10-16).** `maanu.com.br` = página de vendas (+ termos,
   privacidade, `llms.txt`, robots/sitemap, webhooks e crons); `app.maanu.com.br` = o app (`APP_HOST`). Webhook do ML,
   webhook da AbacatePay e URL de retorno do OAuth do ML **continuam** em `maanu.com.br` (`webhookBaseUrl`; nada mudou no
   DevCenter nem na AbacatePay). Conferido em produção: redirecionamentos, `noindex` no app, links da página e do
   `llms.txt` no app, crons 200 a cada minuto e notificações do ML 200, sem 5xx.
   **Breno, falta:** (a) avisar os clientes em teste (Girassol Moda Jeans, Descomplicasa) do endereço novo (links antigos
   levam para lá; quem estava logado entra de novo uma vez); (b) conferir "Conectar/Reconectar conta" do ML no app novo
   (1ª conexão depois da troca prova o retorno do OAuth pelo redirecionamento); (c) no cadastro da AbacatePay, site
   `https://maanu.com.br`; (d) Google Search Console e Bing (item 0i (e)). Opcional: 2ª URL de retorno
   `https://app.maanu.com.br/api/auth/callback/mercadolivre` no DevCenter (só serve se um dia `ML_REDIRECT_URI` mudar).
   **Voltar atrás:** apagar `APP_HOST`, devolver `NEXT_PUBLIC_SITE_URL=https://maanu.com.br` e o Site URL do Supabase →
   Redeploy (o domínio principal volta a servir o app; a página de vendas continua em "/").
   **Cuidado para as próximas IAs:** `app.maanu.com.br` depende do CNAME `app` → `5205331b18becd29.vercel-dns-016.com`
   no Cloudflare (DNS only). Se esse registro sumir, o app sai do ar (o domínio principal manda tudo para lá).

0j. **Breno — avaliar o carrossel de Instagram (Sessão 26):** revisar as quatro peças em `CRIATIVOS/` e pedir ajustes de
   texto, composição ou cor antes de publicar. Não publicar os criativos sem essa revisão.

0i. **Breno — página de vendas (Sessão 25; em `https://maanu.com.br/` desde 2026-10-16, Sessão 27; antes em
   `/institucional`, que agora redireciona para "/").** (a) Ajustes: pedir à IA (cada push na `v2` publica). (b) Imagens:
   nenhuma pendente (todas as telas são desenhadas em código; se quiser fotos/prints reais depois, é só pedir). Prints
   podem ser da conta admin com dados fictícios (nunca de cliente). (c) ✅ CNPJ no rodapé (sem razão social) e ✅
   WhatsApp/telefone (31) 99263-0934 (2026-10-16). **Falta o e-mail de contato** (a AbacatePay pede e-mail e WhatsApp,
   §13 0g item 6): Breno manda o endereço → IA coloca em `companyInfo.email` (`lib/config/site.ts`); Instagram é opcional.
   No cadastro da AbacatePay, o site agora é **`https://maanu.com.br`**. (d) ✅ Publicada (Sessão 25b em `/institucional`,
   Sessão 27 em "/"). Ideias não feitas: Pixel da Meta/Google (para medir os anúncios), depoimentos reais quando houver,
   vídeo curto da maanu respondendo.
   (e) **SEO: ligado na Sessão 27** (`SALES_PAGE_INDEXABLE = true`, página no sitemap). Breno, uma vez: Google Search
   Console → "Adicionar propriedade" → **Domínio** `maanu.com.br` → copiar o registro TXT → Cloudflare → DNS → TXT na raiz
   (`@`) → Verificar → Sitemaps: enviar `https://maanu.com.br/sitemap.xml` → Inspeção de URL na home → "Solicitar
   indexação". Bing Webmaster Tools → "Importar do Google Search Console" (o Bing alimenta a busca do ChatGPT e do Copilot).
   Colocar o link `maanu.com.br` no Instagram e nos perfis da marca (links de fora ajudam o Google e as IAs a acharem a
   página). Ao mudar textos da página, atualizar `SITE_CONTENT_UPDATED` em `lib/site/seo.ts`. Ideia não feita:
   blog/guias ("como responder perguntas no Mercado Livre") para atrair busca orgânica de quem ainda não conhece a maanu.
0h. **Breno — conferir o aviso de acesso restrito (Sessão 24):** com um cliente comum logado, abrir
   `maanu.com.br/admin/cobranca` e conferir "Você não tem acesso a esta página" e "Voltar ao meu painel".
0g. **Breno — cobrança pela AbacatePay (Sessão 23).** ✅ **No ar em produção desde 2026-10-16 (Sessão 23c).** Faltam:
   (a) a **compra real de verificação** (conta separada, nem admin nem cliente; Starter; depois cancelar e pedir o estorno no
   painel da AbacatePay) — a IA confere os registros; (b) ✅ anual decidido: **só o mensal** (Sessão 23d) — os 3 produtos anuais criados na
   AbacatePay são ignorados e podem ser arquivados lá; ✅ cartão de crédito habilitado na loja em 16/10 (antes a API
   respondia `400 CARD is not available for this store`; taxas e líquido por plano no diário da Sessão 23d); (c) opcional: apagar o webhook do Dev mode.
   (Histórico:) Passos 1 a 5 feitos em modo de teste (Sessão 23b; dados do teste apagados); faltava o passo 6 (produção). Hoje a chave em uso é a de teste e não há e-mails liberados, então os
   clientes veem "Contratação pelo app em breve" até a troca. Ao trocar: chave de produção com as mesmas permissões, produtos
   recriados no modo de produção, `ABACATEPAY_API_KEY` trocada na Vercel + Redeploy e "Cadastrar webhook na AbacatePay" de
   novo no painel (o aviso "Pagamentos em modo de teste" some sozinho com a chave de produção).
   1. AbacatePay (Dev mode primeiro) → Integração → API Keys → **Criar chave** com as permissões PRODUCT:READ,
      CUSTOMER:CREATE, SUBSCRIPTION:CREATE, SUBSCRIPTION:READ, SUBSCRIPTION:DELETE, WEBHOOK:CREATE, WEBHOOK:READ e STORE:READ
      (não dá para editar depois; faltou uma = criar outra).
   2. Produtos: cada um com **recorrência** (mensal) e o preço da maanu (Starter R$ 97, Pro R$ 197, Escala R$ 397) e
      "Starter"/"Pro"/"Escala" no nome. Para vender o anual, criar mais 3 com recorrência **anual**: R$ 970, R$ 1.970 e
      R$ 3.970. Produtos de Dev mode só existem no Dev mode.
   3. Vercel → projeto `maanu` → Settings → Environment Variables → `ABACATEPAY_API_KEY` (Production, **Sensitive**) e,
      para testar com uma conta comum, `ABACATEPAY_TEST_EMAILS` (o e-mail dessa conta). Depois, Redeploy do último deploy.
   4. `maanu.com.br/admin/cobranca`: conferir "6 de 6 produtos" (ou 3, sem os anuais) e clicar em **Cadastrar webhook na
      AbacatePay**. Os itens da Configuração devem ficar verdes.
   5. Teste: com a conta comum (não a admin), Assinatura → "Assinar o Pro" → cartão 4242 4242 4242 4242, validade futura,
      qualquer CVV → volta para a maanu e o plano aparece ativo em segundos. Testar também trocar de plano e cancelar.
      Ver Admin → Cobrança → Notificações. Depois do teste, apagar essa assinatura de teste (cancelar) ou avisar a IA.
   6. Produção: verificar a conta na AbacatePay (CNPJ; site com contato por e-mail e WhatsApp, termos, privacidade e **CNPJ
      no rodapé** — a página de vendas da Sessão 25 já tem o CNPJ, termos e privacidade no rodapé; falta publicar e os
      contatos de e-mail/WhatsApp), criar a chave de **produção** e os produtos de produção, trocar a `ABACATEPAY_API_KEY`, apagar a
      `ABACATEPAY_TEST_EMAILS` (opcional) e cadastrar o webhook de novo pelo painel.
   Se algo falhar: Admin → Cobrança mostra o motivo (chave, permissões, produto com preço diferente, webhook). Logs da Vercel:
   `[webhook abacatepay]` e `[cobrança]`.
0f. **Notificações do ML (Sessão 22):** desde ~23:32 UTC de 2026-10-13 o ML entrega as notificações da conta do cliente
   (pergunta respondida em ~6 s). Fica a observar: (a) se parar de novo, a rotina cobre em ~10–20 s; a configuração do app
   está certa (URL e tópicos conferidos pela API do ML); se for preciso, no DevCenter abrir o app da maanu (Client ID
   `8693830632560554`) → notificações e **salvar de novo** (o ML diz que tópico desligado por "fall back" exige nova
   inscrição) ou pedir ao cliente "Reconectar" a conta. (b) Fazer uma pergunta
   de teste num anúncio do cliente: deve aparecer respondida em segundos (notificação) ou em ~10–20 s (rotina). A IA confere
   nos logs do projeto Vercel `maanu`: linha `[webhook] pergunta ...` = o ML voltou a entregar. (c) Se o ML continuar sem
   entregar, chamado no suporte de desenvolvedores do ML (`missed_feeds` estava vazio: o ML nem tenta entregar; dá para
   reconferir com o token da conta `SOUSABRENO30`, dona do app). (d) Mesmo risco no **pós-venda**: hoje ele confere as não lidas só a cada 15 min
   e só com o agente ligado; se o agente for ligado para o cliente, levar a mesma rotina para lá (pedir aprovação: mais
   consultas ao ML). (e) Com muitas contas (> 50), rever o custo da rotina (consultas ao ML e tempo do cron na Vercel).
0e. **Breno — conferir os planos (Sessão 20) em `maanu.com.br`:** Assinatura (seu plano, uso e os 3 planos), menu Melhorias de
   anúncio (precisa de conta ML conectada com perguntas) e, no painel admin, "Editar assinatura" (escolher o plano preenche
   contas e mensalidade; campos Ciclo e Respostas por mês). Confirmar: (a) **teste grátis = tudo do Pro** com 1 conta, 300
   respostas e 3 análises (decisão da IA); (b) o que acontece no limite (perguntas vão para o vendedor; sem pacote extra);
   (c) itens de plano escondidos no menu para quem não tem (ou mostrar com cadeado como vitrine); (d) passar o **e-mail e o
   WhatsApp de suporte** para aparecerem em Assinatura. O cliente "Descomplicasa" está em teste (vai até 20/10) e já vê
   Pós-venda e Melhorias; a "Loja Maanu" (admin) não tem limites.
0d. ✅ (Sessão 20) Planos decididos pelo Breno e implementados. ✅ (Sessão 23) Cobrança pela AbacatePay implementada — ligar
   pelo item 0g. (Texto original do plano, mantido como histórico:) criar
   na AbacatePay os produtos com `cycle` MONTHLY/ANNUALLY e `externalId` (ex.: `pro_mensal`, `pro_anual`), chave de API
   (variável sensível na Vercel) e webhook HTTPS com segredo (`subscription.completed/renewed/plan_changed/payment_failed/
   cancelled` → `plan`, `billing_cycle`, `subscription_status`, `current_period_end`, `monthly_price`); botão "Assinar" da
   Assinatura vira o checkout; troca de plano usa `/subscriptions/change-plan` (mesmo ciclo). Precisa do Breno: conta
   AbacatePay e as chaves (dev e produção).
0c. **Breno — conferir o tour e os avisos novos (Sessão 18) em `maanu.com.br`:** criar uma conta de teste (ou zerar o
   `tour_completed_at` do seu perfil no banco para rever o tour) e ver os 4 passos com as imagens, o cartão do teste no rodapé
   do menu (e o selo no topo, no celular) e o cartão "Conecte sua conta do Mercado Livre" no topo. Dizer se prefere o aviso do
   teste também no topo do conteúdo (hoje só no menu/celular). Ideia não feita: corrigir os 7 botões sem borda do §8 P2.
0b. **Breno — Chaves de IA (Sessão 17), em `maanu.com.br/admin/chaves-ia`:** hoje **nenhuma** chave está cadastrada no
   painel, então a IA continua com a `OPENAI_API_KEY` da Vercel (a mesma da v1). Recomendado: (a) na OpenAI, criar um
   **projeto só da maanu** com limite de gasto mensal; (b) criar nele uma chave de projeto com **data de validade** e
   permissão restrita (só gerar respostas / "Model capabilities"); (c) cadastrar no painel com "Usar esta chave agora";
   (d) criar e cadastrar uma 2ª chave como **reserva**; (e) depois da v1 desligada, revogar a chave antiga da v1 e, se quiser,
   trocar a `OPENAI_API_KEY` da Vercel por outra do projeto maanu (ou deixar só o painel). Girar a cada ~90 dias (passo a
   passo na própria tela). Ideias não feitas: outros provedores (a coluna `provider` já existe), modelo escolhido pelo
   painel, alerta por e-mail quando houver troca automática.
0a. **TROCA em 2 fases (Sessões 15; executar quando o Breno der o "pode fazer").** Sem migração de dados.
   **Fase 1 — semana de teste com 1 cliente (a v1 continua no ar para os outros):**
   1. ✅ IA (15b): banco limpo; chaves novas (legadas desligadas, HS256 revogado); projeto Vercel `maanu` com production
      branch `v2`, variáveis de Production e domínios; Auth com Site URL/redirects `maanu.com.br`; e-mails prontos.
   2. ✅ (DNS ativo e HTTPS emitido) **Breno — DNS no Cloudflare** (proxy **desligado**, nuvem cinza, "DNS only"): `A  @  216.150.1.1`,
      `A  @  216.150.16.1` e `CNAME  www  5205331b18becd29.vercel-dns-016.com`. A Vercel emite o certificado sozinha.
   3. ✅ `ML_CLIENT_SECRET` criado pelo Breno no projeto `maanu` (Production, sensível); produção republicada (Sessão 15b).
   4. ✅ **Breno — Resend:** adicionar o domínio `maanu.com.br` (o Resend mostra os registros MX/TXT de envio e DKIM; tem
      botão para configurar direto no Cloudflare) e, quando verificar, ligar o SMTP no Supabase pela integração do Resend
      (Resend → Integrations → Supabase → projeto "Mercado Livre Responde v2"; remetente `nao-responda@maanu.com.br`, nome
      `maanu`) ou à mão (Supabase → Authentication → Emails → SMTP: host `smtp.resend.com`, porta 465, usuário `resend`,
      senha = API key do Resend). Recomendado também um TXT `_dmarc` = `v=DMARC1; p=none;`. Registros do Resend no
      Cloudflare sempre **sem proxy**. Quem envia: o Supabase Auth dispara e monta o e-mail; o Resend entrega (SMTP) e
      mostra os logs de entrega. Situação (fim da Sessão 15b): Breno criou os registros no Cloudflare; o Registro.br ainda
      publicava os DNS antigos (`a/b.auto.dns.br`) e o SMTP ainda não estava ligado no Supabase.
   5. ✅ (SMTP ligado, modelos aplicados, 30/h; cadastro e nova senha testados pelo Breno) IA, depois do SMTP: aplicar os e-mails em português (`node scripts/emails-auth/gerar.mjs`) e subir o limite de
      e-mails; testar cadastro e "esqueci minha senha" ponta a ponta em `maanu.com.br`.
   6. ✅ (Breno salvou; PKCE ainda desmarcado de propósito) Breno, no DevCenter do **app da v2**: nome/logo maanu; redirect `https://maanu.com.br/api/auth/callback/mercadolivre`;
      notificações `https://maanu.com.br/api/webhook/mercadolivre`. (A staging `mlresponde-v2.vercel.app` deixa de receber.)
      Depois do 1º OAuth ok: marcar PKCE como obrigatório. (A config do app não dá para conferir pela API do ML sem token;
      a prova é a 1ª conexão. Conferido: `maanu.com.br/api/webhook/mercadolivre` responde 200 e `/api/ml/oauth/start` exige
      login. Nenhuma conta ML conectada ainda ao fim da Sessão 15b.)
   7. Cliente do teste: cadastro em `maanu.com.br`, conecta a conta ML, configura o Assistente, liga a IA e **remove o app
      "Meli Fácil" dos aplicativos autorizados da conta ML** (senão a v1 continua respondendo por ele). Voltar atrás:
      reconectar na v1 e pausar a IA na v2. **Desde a Sessão 21 basta PAUSAR na v1** (Configurações do login dele em
      `mlresponde.vercel.app/settings`), sem remover o app; voltar = religar o mesmo botão. Admin acompanha em `maanu.com.br/admin` (o Breno precisa refazer o QR da 2ª
      etapa só se perder o autenticador; o fator TOTP continua no banco).   **Fase 2 — depois que o Breno aprovar o teste:**
   8. Merge `v2` → `main` (com aprovação); projeto "maanu" passa a usar production branch `main`; projeto antigo
      `mlresponde` desligado (ou sem Git) para não publicar a v2 com as variáveis da v1.
   9. Breno avisa os outros clientes para se cadastrarem em `maanu.com.br`; desligar o app ML da v1 e pausar o Supabase da
      v1 quando ninguém mais usar.
   10. Atualizar `AGENTS.md` e §2 (o banco da v2 é produção: nada destrutivo; CLI com cuidado) e decidir um ambiente de
       testes novo (hoje não existe banco separado).0. **Breno: primeiro acesso ao painel do administrador na staging** (`https://mlresponde-v2.vercel.app/admin`): entrar com
   `brenosousaf13@gmail.com` (já é admin), clicar em "Gerar QR code", escanear com um app autenticador no celular e digitar
   o código. **Guardar o código secreto** que aparece (permite cadastrar o mesmo autenticador em outro celular). Depois:
   (a) em Financeiro → "Ajustar números", colocar a cotação do dólar que o cartão cobra e os custos fixos (Vercel, Supabase,
   domínio...); (b) nos clientes que pagam, preencher a mensalidade em "Editar assinatura" (é o que forma o MRR);
   (c) no cutover, a produção ganha o painel junto (a migração é aditiva) e o Breno precisa ser marcado admin no banco de
   **produção** (`update public.profiles set is_platform_admin = true where id = '<id do usuário>';`) e cadastrar a 2ª etapa
   de novo lá. (d) Quando comprar o domínio, decidir se o painel vai para `admin.<domínio>` (variável `ADMIN_HOST`,
   Preview + Production, e domínio apontado na Vercel).
1. ✅ Infra de staging, inventário de prod, baseline, **Fundação** (sub-projeto 1) e **Respostas v2** (sub-projeto 2).
1b. **Breno: Pós-venda (planos Pro/Escala e teste grátis desde a Sessão 20).** (a) No app ML de **teste** (DevCenter), conferir o tópico **`messages`** marcado
   e as permissões **Comunicações pré e pós-vendas** e **Venda e envios** (leitura e escrita) — sem isso o agente não recebe
   nada; se mudar permissões, reconectar a conta. (b) Para testar na staging, a organização precisa do plano: entrar com o
   login admin (a "Loja Demonstração" tem `plan='admin'` e já vê o menu) ou rodar no Supabase de **testes**
   `update organizations set plan = 'pro' where id = '<id da organização>';`. (c) Teste real: com uma conta ML de
   teste segura, fazer uma compra a partir de outra conta de teste, mandar mensagem pela compra, ligar o agente em
   `/pos-venda/agente` e ver a resposta em Pós-venda. (d) Decidir: o teste grátis inclui o pós-venda? O menu deve aparecer
   com cadeado para quem não tem o plano (vitrine) ou continuar escondido? Preço/limites do Essencial.
2. **Breno: conferir na staging** o menu recolhendo pela barra, a caixa de entrada (filtro por anúncio, ordem, páginas), o
   novo Painel e a tela **Resultados** (a "Loja Demonstração" já tem 90 dias de histórico). Dizer se as premissas padrão
   da economia (3 min por resposta, R$ 20/h) fazem sentido para os clientes dele.
2b. **Breno: conferir o cadastro novo em `maanu.com.br`** (depois do DNS/SMTP) — criar uma conta e ver as 2 etapas (a 2ª agora
   se chama "Dados da conta", sem falar em cobrança), a busca do CEP e o CPF travado em Configurações. Decidir se quer
   pedir também e-mail financeiro ou inscrição estadual (depende do gateway/nota fiscal do sub-projeto 4).
3. **Breno: observar as respostas do `gpt-6-luna` na staging** (aba Testar do Assistente e perguntas reais). Se algo piorar,
   dá para voltar ao antigo sem código: variável `OPENAI_MODEL=gpt-4o-mini` (Preview + `v2`) e novo deploy.
   No cutover, a produção passa a usar o Luna automaticamente (padrão do código).
3b. **Breno: experimentar o Assistente de IA na staging** (`/assistente`): responder a configuração guiada com dados de uma
   loja real, usar a aba Testar e dizer se falta alguma pergunta/opção no roteiro (`lib/assistant/questions.ts`).
3c. **Breno: testar o modo "Responder sempre"** (Assistente → Jeito de responder) e aprovar o texto da mensagem padrão
   sugerida. Com uma conta ML real conectada, usar Testar com o link de um anúncio e abrir **"O que a IA leu deste
   anúncio"** para confirmar que descrição, ficha, variações e medidas estão chegando (a leitura só foi testada com dados no
   formato da documentação do ML). Ideia: separar em Resultados as respostas com mensagem padrão.
4. **Breno: teste real na staging** (`https://mlresponde-v2.vercel.app`, a conta "Noord Shop" já existe): conectar uma conta
   ML **segura** (sem compradores reais e que NÃO esteja no app de produção), concluir a configuração do Assistente de IA,
   ligar, e fazer uma pergunta num anúncio dessa conta a partir de outra conta ML. Conferir em Perguntas.
5. Depois do 1º OAuth bem-sucedido: marcar PKCE como obrigatório no app ML de teste.
5b. ✅ Teste de importação de um cliente real feito e apagado (Sessão 14). Para importar de novo (outro teste ou o cutover):
   `scripts/v1-para-v2/` + conversão da base de conhecimento por IA (§6.3, §14). Numa importação de teste, **nunca
   reconectar na staging a conta ML do cliente** (é loja real e a v1 ainda responde por ela, §9) e apagar tudo no fim.
6. **Decidir com o Breno o próximo passo:** (a) migração de dados v1 → v2 e cutover (clientes atuais com cortesia,
   reconectar contas, importar base de conhecimento → "Outras informações" e exemplos → respostas ensinadas; o prompt do
   cliente atual da v1 pode virar as respostas da configuração guiada), ou (b) sub-projeto 4 (planos e cobrança), ou (c) WhatsApp.
7. **Breno decide:** SMTP próprio (Resend), textos legais, provedor de WhatsApp. (Marca decidida: **maanu**.)
7b. **Breno: pendências da marca maanu fora do código** — (a) conferir na staging (login, menu aberto/recolhido, favicon,
   Resultados) e dizer se o teal dos botões está bom (pode ficar idêntico ao da logo, só que menos legível); (b) trocar o
   nome/logo do app no DevCenter do ML (aparece para o vendedor na tela de autorização) — teste agora, produção no
   cutover; (c) domínio próprio (ex.: maanu.com.br) → depois ajustar `NEXT_PUBLIC_SITE_URL`, `ML_REDIRECT_URI`, URLs do app
   ML e Site URL do Supabase; (d) nome do remetente dos e-mails de cadastro/senha só muda com SMTP próprio; (e) opcional:
   renomear projeto/repositório na Vercel/GitHub (muda a URL `mlresponde-v2.vercel.app` — refazer as URLs do app ML de
   teste); (f) a v1 em produção continua "Meli Fácil" até o cutover.
8. ~~**Cutover (checklist parcial)**~~ (**superado pelo item 0a**; mantido como histórico): `CRON_SECRET`, `ML_TOKEN_ENCRYPTION_KEY` (nova), `NEXT_PUBLIC_SITE_URL` em Production;
   `supabase migration repair --status applied 20261011150000` em prod e `db push`; URLs do app ML de produção (redirect
   `/api/auth/callback/mercadolivre`, notificações `/api/webhook/mercadolivre`) e permissões novas; clientes reconectam.
   No 1º acesso pós-cutover, cada cliente da v1 completa CPF/CNPJ + endereço (etapa única do cadastro).
9. **Lembrete:** P0 de prod (§8) — vazamento em `question_jobs` segue na v1 (mitigado pelo cadastro fechado).
10. Limpeza recomendada (com aprovação): tirar Preview/Development das variáveis de produção na Vercel.
11. Ideias anotadas (não feitas): "fichas de produto" por modelo como cadastro próprio (hoje vão em "Detalhes confirmados
    dos produtos"), importar o histórico de respostas do ML como respostas ensinadas, avaliação das respostas da IA.
    Caixa de entrada: ações em lote (arquivar / "IA tenta de novo" em várias), atalhos de teclado (j/k), busca com índice
    trigram (`pg_trgm`) se alguma loja passar de ~100 mil perguntas.
    Resultados: **vendas após a resposta** (tópico `orders_v2` + `buyer_id` já gravado: quem perguntou e comprou depois,
    em R$) — é o número financeiro mais forte que falta; relatório mensal por e-mail/WhatsApp; horário comercial vindo do
    Assistente; assuntos classificados pela IA.
    Painel do administrador (Sessão 13, não feito): alertas por e-mail/WhatsApp (custo de IA de um cliente acima do
    limite, fila parada, OpenAI falhando), limite de tokens/perguntas por plano, "entrar como cliente" com consentimento e
    registro, excluir conta (LGPD, com carência), cohort de retenção por mês de cadastro, gráfico de MRR no tempo (precisa
    guardar o histórico de assinaturas — sub-projeto 4), backfill dos tokens antigos de `ml_questions.ai_tokens`.

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

Migração v1 → v2 (§6.3; saídas sempre em `docs/v2/privado/`):

```powershell
# 1) Exportar da v1 (só GET). Chaves da v1 só na memória do terminal, nunca em arquivo.
$env:V1_SUPABASE_URL = "..."; $env:V1_SUPABASE_SERVICE_ROLE_KEY = "..."
node scripts/v1-para-v2/exportar.mjs --usuario <uuid ou e-mail> --saida docs/v2/privado/v1-para-v2/<nome>.export.json
# 2) (opcional) converter a base de conhecimento em <nome>.assistente.json (IA, à mão; formato no §6.3)
# 3) Importar no Supabase de TESTES (usa o .env.local; recusa outro projeto). --substituir refaz a importação do mesmo login.
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/v1-para-v2/importar.mjs --projeto ookosqyfazobiwmopiix `
  --export <...>.export.json --assistente <...>.assistente.json --email brenosousaf13+<loja>@gmail.com --loja "<Nome>" --cobranca-ficticia
```

Webhook local exige túnel público (ex.: ngrok) e um app ML de teste apontando para ele.

## 15. Glossário

- **seller_id:** ID do usuário vendedor no Mercado Livre (`user_id` no payload do ML).
- **user_id:** ID do usuário do SaaS (`auth.users.id` do Supabase).
- **job:** linha em `question_jobs` que representa uma pergunta recebida e seu processamento.
- **v1 / v2:** v1 = app atual em produção; v2 = nova versão comercializável em desenvolvimento.
