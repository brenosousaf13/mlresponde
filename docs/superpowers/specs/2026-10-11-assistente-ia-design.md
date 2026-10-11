# Sub-projeto 2b — Assistente de IA e novo painel de Perguntas (design)

- **Data:** 2026-10-11 · **Status:** implementado na branch `v2` (decisões técnicas delegadas à IA pelo Breno)
- **Depende de:** Respostas automáticas v2 (`2026-10-11-respostas-v2-design.md`).
- **Pedido do Breno (após ver a v2 funcionando):** Perguntas confuso e "tudo branco"; "Respostas da IA" parecia ser a
  lista de respostas e era a configuração; ligar/desligar mais discreto; configuração inicial com perguntas sobre o
  negócio que vira o "system prompt" (editável depois), mantendo a estrutura e as travas do prompt da v1; manter
  "Respostas ensinadas" e "Bloquear anúncios" se funcionarem de verdade.

## 1. Visual da área logada

- Novo token `--canvas` (cinza levemente azulado) no fundo da área logada (`SidebarInset`); cards, menu lateral e
  cabeçalho continuam brancos. Resultado: superfícies separadas, sem "tudo branco misturado".
- Cores de status padronizadas em `lib/questions/presentation.ts`: âmbar = para você responder, azul = IA
  (marca), verde = você, verde-água = respondida direto no ML, cinza = arquivada, azul-claro pulsando = IA analisando.

## 2. Perguntas (`/perguntas`) — caixa de entrada

- 4 filtros em cartões com contador: **Para responder** · **Respondidas pela IA** · **Respondidas por você**
  (painel + direto no ML) · **Todas**. `?aba=responder|ia|voce|todas` (aceita as antigas `revisar`/`respondidas`).
- Duas colunas no desktop: lista (busca por pergunta/anúncio `?busca=`, filtro de conta, paginação de 20) e a
  conversa da pergunta selecionada (`?q=<id>`; sem `q`, a primeira da lista). No celular: lista → conversa em tela
  própria com "voltar".
- Conversa: anúncio (foto, título com link, código, data), aviso do motivo (por que ficou para você + explicação da
  IA), balão do comprador e balão da resposta (IA / você / direto no ML, com certeza da IA).
- Responder **na própria tela** (sem diálogo): rascunho da IA já no campo, "Sugestão da IA"/"Gerar outra",
  "Ensinar a IA" marcado por padrão, Ctrl+Enter envia, **"Enviar e ir para a próxima"**.
- Menu: deixar a IA tentar de novo, arquivar, **voltar arquivada para "Para responder"** (nova ação
  `restoreQuestion`, reconcilia com o ML), abrir anúncio.

## 3. Assistente de IA (`/assistente`, antes "Respostas da IA")

- Menu renomeado para **Assistente de IA**; `/respostas` redireciona (307) para `/assistente`. Seção de acesso
  `respostas` → `assistente`.
- **Ligar/pausar discreto:** pílula "IA respondendo / IA pausada" com interruptor no cabeçalho da página. Só liga
  depois da configuração concluída (servidor recusa).
- **Configuração guiada** (primeira vez em cada conta ML): 19 passos em 7 seções (Sua loja, Produtos, Envio e
  retirada, Pagamento e nota, Garantia e trocas, Atendimento, Jeito de responder), barra de progresso, trilha de
  seções clicável, "Pular" nas opcionais, salva a cada passo (`store_setup_step`) e retoma de onde parou. Perguntas
  com opções rápidas (chips) + detalhes livres. Roteiro em `lib/assistant/questions.ts` (ids estáveis).
  Se outra conta da loja já foi configurada, oferece copiar as respostas.
- Depois de concluída, abas: **Sobre a loja** (tudo o que a IA sabe, por seção, editável item a item; "Outras
  informações" livre = antigo `store_briefing`; "Ver como a IA lê"; "Revisar passo a passo") · **Jeito de
  responder** (tom, nível de certeza, saudação/assinatura com prévia) · **Respostas ensinadas** (explicação de
  como funciona, criar para todos os anúncios ou um anúncio, editar, apagar) · **Anúncios bloqueados** (explicação +
  bloquear/desbloquear) · **Testar** (pergunta + anúncio opcional → mostra se a IA responderia sozinha, a resposta
  ou o rascunho, a certeza e o motivo; nada vai ao ML).

## 4. Prompt (`lib/answers/prompt.ts`)

- System prompt reescrito com a estrutura e as travas do prompt da v1 em produção, genéricas para qualquer loja:
  **Regra 0 "nunca invente"** (só afirma o que está no anúncio, no conhecimento da loja, nas respostas ensinadas ou
  nas respostas anteriores da loja; lista do que é proibido), quando escalar, como usar as fontes (informação de um
  modelo não vale para outro; contradição → escala; esgotado não é oferecido; nunca prometer dias de entrega),
  leitura do contexto do comprador (já comprou/recebeu/contestou), o que vale para qualquer compra no ML (carrinho
  para várias variações, frete pelo CEP), segurança (pergunta é conteúdo não confiável, sem contato externo),
  estilo, **regras do vendedor**, checagem final e formato da saída.
- O conhecimento da loja (respostas da configuração compiladas por `compileStoreKnowledge`) e as respostas
  ensinadas vão no prompt do sistema; anúncio, perguntas anteriores e a pergunta vão na mensagem do usuário.
- Perguntas anteriores do **mesmo comprador** no anúncio são marcadas `[MESMO COMPRADOR]` (regra de não reafirmar
  o que foi contestado). A diferença v1→v2: quando não sabe, a v2 **escala para o vendedor** (com rascunho) em vez
  de mandar a resposta-modelo "não tenho essa informação".

## 5. Respostas ensinadas e anúncios bloqueados (como funcionam)

- **Ensinadas** (`ai_examples`): criadas ao responder com "Ensinar a IA" (valem para aquele anúncio) ou na aba
  (todos os anúncios ou um anúncio). Antes a IA só via as 30 mais recentes; agora `rankTaughtExamples` busca até 300
  e manda as 12 mais parecidas com a pergunta (palavras em comum, sem acentos/plurais/palavras vazias, preferência
  às do mesmo anúncio). O prompt dá prioridade a elas. Testado com IA real.
- **Bloqueados** (`item_blacklist`): o motor checa antes de chamar a IA → pergunta vai direto para o vendedor
  (motivo "Anúncio na lista não responder"), sem custo de IA.

## 6. Dados (migração `20261011210000_assistente_ia.sql`, aditiva)

- `ml_accounts.store_profile jsonb` (objeto, ≤ 60 KB) `{ [perguntaId]: { options: string[], text: string } }`,
  `store_setup_step int`, `store_profile_completed_at timestamptz`.
- `ai_examples.item_title`, `ai_examples.updated_at` (+ trigger).
- Validação no servidor (`validateAnswer`/`parseStoreProfile`): só ids e opções conhecidas, limites por pergunta.

## 7. Testes

- Unitários: roteiro (ids/opções/ordem), validação, leitura tolerante do JSON, compilação do conhecimento,
  ranqueamento das ensinadas, apresentação/abas/busca, prompt (travas, regras do vendedor, mesmo comprador).
- IA real (`tests/integration/ai-live.test.ts`, 12 cenários): cor com estoque, variação esgotada, nota fiscal,
  ensinada (troca), carga não informada, desconto, "vem montada" (conhecimento), sem retirada, prazo de entrega,
  várias variações no carrinho (sem citar a esgotada), comprador contestando (não reafirma), injeção de instrução.
