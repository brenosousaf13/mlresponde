# Referências de mercado para a v2

> Material de pesquisa para a definição da v2 (brainstorming). Não é spec.
> Atualizar quando o Breno trouxer novas referências.
> ⚠️ O repositório é **público**: aqui só entra visão de **produto** (funcionalidades, regras, UX, preços públicos).
> O documento técnico completo da engenharia reversa do AgilizaPRO fica **só na máquina do Breno**, fora do git:
> `docs/v2/privado/AGILIZAPRO-ENGENHARIA-REVERSA.md` (717 linhas, 2026-10-11). Não versionar.

## Referências indicadas pelo Breno (2026-10-11)

| Produto | URL | O que o Breno gostou |
|---|---|---|
| **AgilizaPRO** | https://agilizapro.ia.br/ (app em `app.agilizapro.ia.br`) | Referência principal. Gosta muito do produto, do teste grátis de 7 dias e da plataforma bloqueada até conectar a conta ML. |
| **Zelure** | https://www.usezelure.app/landing | Referência de página de vendas/produto. |

## AgilizaPRO — o que o Breno observou ao criar uma conta (sem pagar)

Fonte: prints enviados pelo Breno em 2026-10-11.

**Fluxo de entrada (nessa ordem):**
1. Cria conta (e-mail/senha).
2. **Confirma o e-mail.**
3. **Aceita um termo de contrato** (aceite registrado antes de usar).
4. **Informa o WhatsApp** (tela "Configure seu WhatsApp — Este é o núcleo do AgilizaPRO"): o número recebe as
   notificações das perguntas do ML e é o canal de comunicação com o agente de IA. Campo `+55` + DDD + número.
   Botão "Salvar e ir para o dashboard".
5. Cai no dashboard **já em período de teste de 7 dias, sem ter pago nada** (barra fixa no topo:
   "Você está no período de teste. Restam 7 dias. Ver Planos").
6. **Tour de boas-vindas** (modal em 4 passos):
   1. "Responda rápido, venda mais!" — quem responde primeiro no ML leva a venda; tempo de resposta em segundos.
   2. "Sua IA, Autônoma e Treinada" — não precisa criar regras; a IA lê as informações dos anúncios; 24/7.
   3. "Seu WhatsApp no Controle" — se a IA não tiver certeza, não inventa: manda a dúvida na hora para o WhatsApp do
      vendedor responder.
   4. "Multi-Contas em um só lugar" — várias lojas, métricas de atendimento e perguntas centralizadas num painel.
7. **Tudo bloqueado até conectar uma conta ML.** Segunda barra fixa (amarela): "Você ainda não conectou nenhuma conta
   do Mercado Livre. Conectar agora". Tela "Contas Mercado Livre" com "0 contas vinculadas" e botão "Vincular Primeira Conta".
8. **Modal de vínculo** antes de ir ao ML: explica que vai redirecionar para autorizar; avisa que **todas as perguntas
   pendentes serão analisadas pela IA e respondidas automaticamente** se ela achar uma resposta satisfatória; lista de
   garantias: "Leitura e resposta de perguntas", "Acesso às informações dos seus anúncios", "Nunca publicamos ou
   alteramos seus anúncios". Botões "Cancelar" / "Ir para o ML".

**Menu lateral (dá a dimensão do produto):** Dashboard · Perguntas · Pós-venda · Melhorias · Contas ML · Blacklist ·
Vendas · Centro de Custo · Feedback · Ajuda · Faturamento · (nome/e-mail do usuário) · Sair.

**Leituras para o Meli Fácil (a validar com o Breno):**
- Teste grátis **sem cartão** começa no cadastro; a assinatura vem depois ("Ver Planos").
- WhatsApp é peça central: notificação + "escalar para humano" quando a IA não tem certeza.
- Onboarding guiado: confirmação de e-mail → termos → dados de contato → tour → conectar ML (obrigatório).
- Multi-contas ML por cliente desde o início.
- Módulos além de perguntas: pós-venda, "melhorias" (provavelmente sugestões para anúncios), blacklist (compradores),
  vendas, centro de custo (custos/margem), feedback.

## AgilizaPRO — visão de produto (síntese da engenharia reversa de 2026-10-11)

**Posicionamento:** SaaS para vendedores do Mercado Livre. Núcleo = IA que responde perguntas 24/7 lendo o anúncio
(título, descrição, ficha técnica, variações), o **briefing da loja** e as **respostas que o vendedor ensinou**.
Na dúvida **não inventa**: escala para o WhatsApp do vendedor, que responde pelo próprio WhatsApp (conversando com um
agente) ou pelo painel. Toda pergunta é classificada pela origem da resposta: **IA**, **WhatsApp**, **plataforma**
(manual no painel) ou **fora da plataforma** (direto no ML).

**Stack deles (igual à nossa):** Next.js 16 (App Router) + Supabase (Auth, Postgres/RLS, Realtime, Storage) + Stripe
(migraram do Asaas) + n8n para orquestração/IA/WhatsApp + Sentry + Meta Pixel. Tailwind, Lucide, react-hook-form + zod,
Recharts, date-fns pt-BR.

### Jornada / acesso
- Cadastro e-mail/senha ou Google; nome, sobrenome e **cupom de indicação** (via `?ref=`/`?cupom=`) no cadastro.
- Confirma e-mail → **aceite de termos** (gravado com data) → **WhatsApp obrigatório** → dashboard em **trial de 7 dias
  sem cartão** → **tour de 4 passos** (gravado como concluído) → **tudo bloqueado até vincular uma conta ML**.
- Barras fixas: dias restantes do trial + "Ver Planos"; aviso de "nenhuma conta ML conectada".
- **Trial vencido ou pagamento falhou (`isBlocked`):** só **Faturamento** e **Configurações** ficam acessíveis.
- **Assina por dentro do app** (Faturamento → Stripe Checkout). Assinar durante o trial **mantém os dias restantes**
  (1ª cobrança só quando o trial acaba). Troca de plano com prévia de valor proporcional; cancelamento no fim do período;
  histórico de cobranças; próxima fatura.

### Planos (preços públicos observados)
| Plano | Mensal | Perguntas/mês | Contas ML | Extras |
|---|---|---|---|---|
| Starter | R$ 97,90 | 250 | 1 | WhatsApp, dashboard básico, suporte por IA |
| PRO (mais popular) | R$ 159,80 | 1.000 | até 3 | dashboard avançado, relatórios, suporte prioritário |
| Enterprise | R$ 299,00 | 5.000 (+R$ 0,10/resposta extra) | até 10 (+R$ 10/conta extra) | dashboard premium, relatório mensal |

Anual com 17% de desconto. Starter/PRO: ao atingir o limite a IA **para** e avisa no WhatsApp. Enterprise: continua e
cobra o excedente semanalmente. "Melhorias": 5 análises/mês incluídas, excedente R$ 5,90.

### Módulos
| Módulo | O que faz |
|---|---|
| Dashboard | Total de perguntas, % IA, % WhatsApp, pendentes, tempo médio de resposta, gráfico diário, top produtos; filtro por período e conta |
| Perguntas | Sincroniza pendentes do ML; histórico em 4 abas (IA/WhatsApp/plataforma/fora); responder manual com histórico do comprador naquele anúncio; **ensinar a IA** (resposta ideal por anúncio ou para a conta toda); **avaliação 1–5 estrelas**; saudação + assinatura padrão por conta; **respostas prontas** (scripts) com sugestões; limite de 2.000 caracteres; atualização ao vivo |
| Sino de avisos | Perguntas novas a cada 60 s, som e notificação do navegador (uma aba só), contador na sidebar e no título |
| Pós-venda | Inbox de mensagens pós-venda (não lida / aguardando resposta, anexos, marcar resolvida) e **reclamações/mediações** com ações do ML (responder mediador/comprador, reembolso parcial, devolução, evidência, abrir disputa) e prazos |
| Melhorias | IA analisa perguntas que **não soube responder** e sugere melhorias no anúncio; checklist ✓/— por item; cota mensal |
| Contas ML | Várias contas por cliente; ativar/desativar (libera vaga do plano, mantém histórico); alertas WhatsApp por conta; WhatsApp próprio por conta; **briefing da empresa** por conta (prazos, trocas, garantia, envio); saúde do token (só avisa quando a integração parou de fato); desvincular (mantém histórico) × excluir (apaga) |
| Blacklist | Anúncios que a IA nunca responde (vão para resposta manual) |
| Vendas | Pedidos do ML ao vivo com P&L por pedido: receita, taxa ML, frete, custo, margem; cadastro rápido de custo |
| Centro de Custo | Custo por anúncio ou por SKU (CMV + embalagem), regime tributário e alíquota por conta, **margem de contribuição** (preço − comissão ML − imposto − custo; verde ≥ 20%, âmbar ≥ 10%); integração Bling para SKUs |
| Equipe | Membros com permissões (ver valores financeiros, usar melhorias) — atrás de flag |
| Faturamento | Planos, assinatura, troca, cancelamento, cupom, histórico |
| Configurações | Dados pessoais, CPF/CNPJ (uma vez), WhatsApp (protegido por "senha master"), senha |
| Feedback / Ajuda | Tickets com prints e conversa com o suporte; FAQ + "pergunte à IA"; fallback para WhatsApp humano |
| Shopee | Só financeiro (a API de chat da Shopee não é aberta) — atrás de flag |

### Regras de negócio que valem como referência
1. Contexto da IA = anúncio + briefing da conta + respostas ensinadas; na dúvida, escala (não inventa).
2. Blacklist tem precedência sobre tudo (inclusive ensino).
3. Ensino vale por anúncio por padrão; opcionalmente para a conta inteira.
4. Uma conta ML pertence a **um único cliente**; conflito gera **pedido de transferência** (dono atual ou suporte aprova;
   ninguém vê quem é o outro).
5. Limite de contas ativas por plano garantido no banco; desativar libera vaga.
6. Ao vincular a conta, as perguntas pendentes já são analisadas e respondidas.
7. Leitura no painel não marca como lida no ML.

### Pontos fracos deles (não repetir)
- Regras de bloqueio (trial/plano/permissões) só no navegador; precisam valer no servidor e na RLS.
- Linha inteira do usuário (com hash de senha) enviada ao navegador; senha master padrão pública.
- JWT de sessão enviado para webhooks do n8n chamados direto do navegador; IDs de webhook expostos.
- Orquestração em n8n (sem versionamento/testes): preferimos workers próprios com fila.
