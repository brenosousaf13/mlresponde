# Modo "responder sempre" e leitura completa do anúncio — design

Data: 2026-10-11 · Branch: `v2` · Sessão 10 · Migração: `20261011235500_modo_responder_sempre.sql`

## Pedido do Breno

1. Alguns clientes preferem rapidez a uma resposta completa. Uma chave para a IA **sempre** responder: o que ela não souber
   recebe uma mensagem do tipo "não tenho informações suficientes", que o cliente pode personalizar.
2. Garantir que a IA lê o anúncio inteiro (descrição, ficha técnica, variações etc.) para responder com base nele.

## 1. Modo "responder sempre"

### Dados (aditivo, retrocompatível)

- `ml_accounts.answer_mode text not null default 'careful'` (`careful | always`). O padrão mantém o comportamento atual.
- `ml_accounts.fallback_answer text not null default ''` (≤ 1000). Vazio = mensagem do sistema
  (`DEFAULT_FALLBACK_ANSWER` em `lib/answers/decision.ts`). Se o vendedor salvar o texto igual ao do sistema, grava vazio
  (assim uma melhoria futura do texto padrão chega a ele).
- `ml_questions.fallback_reason text null` (`ai_escalated | low_confidence | unsafe_answer | answer_too_long`). Preenchido =
  a resposta enviada foi a mensagem padrão; guarda por quê. O rascunho, a certeza e o motivo da IA continuam em `ai_*`.

### Decisão (`decideAnswer`)

- A resposta da própria IA só sai se passar nas mesmas travas de sempre: `action=answer`, texto não vazio, certeza ≥ nível
  escolhido, sem contato externo, ≤ 2000 caracteres com saudação e assinatura.
- Se não passar: modo `careful` → `needs_review` (como antes); modo `always` → envia saudação + mensagem padrão + assinatura,
  com `fallbackReason`. Com os limites dos campos (200 + 1000 + 200) sempre cabe; por segurança, se não couber vai só o corpo.
- Continuam indo para o vendedor em qualquer modo: anúncio bloqueado, respostas pausadas, conta desativada, assinatura
  inativa e erro de processamento (depois das 5 tentativas). Essas nem chegam à IA.

### Prompt (`buildSystemPrompt`, `mode`)

- A Regra 0, a segurança, a leitura de contexto e a checagem final são as mesmas nos dois modos.
- Modo `always` troca a seção "Quando usar escalate" por "MODO RESPONDER SEMPRE":
  - ninguém revisa antes do envio;
  - informação ausente, contraditória, orçamento/encomenda sem regra → `escalate` com `answer` vazio (o sistema manda a
    mensagem padrão; a IA nunca escreve um palpite nem o "não sei");
  - negociação sem regra → "o preço e as condições são os do anúncio, pagamento pelo Mercado Livre";
  - problema com pedido / reclamação / comprador contestando → desculpas + "Minhas compras", sem reafirmar o contestado;
  - pedido de contato → "o atendimento é feito por aqui", sem repetir o nome do app/rede pedido (senão o filtro de contato
    troca pela mensagem padrão);
  - essas respostas de procedimento não afirmam nada do produto e contam como comprovadas.
- A "Sugestão da IA" na caixa de entrada usa sempre o modo cuidadoso (é um rascunho que o vendedor revisa).

### Telas

- **Assistente → Jeito de responder:** card "Quando a IA não souber a resposta" com a chave **Responder sempre**. Ligada,
  mostra a mensagem padrão (editável, "Usar a sugerida", contador), a prévia com saudação/assinatura e o aviso do que a IA
  faz em desconto/reclamação. O card de certeza explica o efeito em cada modo. Validação no servidor: ≤ 1000 caracteres e
  sem contato externo (saudação e assinatura ganharam a mesma checagem).
- **Configuração guiada:** novo passo "O que fazer quando a IA não souber a resposta?" entre saudação/assinatura e o nível
  de certeza (20 passos no total).
- **Cabeçalho:** a pílula "IA respondendo" ganha o selo discreto "sempre".
- **Testar:** usa o modo da conta. Três desfechos: responderia sozinha (verde), **com a mensagem padrão** (violeta, com o
  motivo e o rascunho que não foi enviado, se houver) ou deixaria para você (âmbar).
- **Perguntas:** tom violeta "Respondida com a mensagem padrão" (lista: "Mensagem padrão"). Na aba "Respondidas pela IA",
  filtro **Só mensagem padrão** (`?aba=ia&padrao=1`, com contador). No detalhe: aviso com o motivo e **Ensinar a IA** ali
  mesmo (`teachFromQuestion`): cria (ou atualiza) a resposta ensinada ligada à pergunta (`source_question_id`), só deste
  anúncio ou de todos. O comprador já foi respondido; a resposta ensinada vale para as próximas perguntas parecidas.

## 2. Leitura completa do anúncio

O que a IA recebe em `<ANUNCIO>` (`summarizeItem`, `lib/mercadolivre/item.ts`), na ordem:

1. Código do anúncio, título, preço (com "em promoção; antes R$ X" quando há `original_price`), condição, situação.
2. Estoque (sem variações) e envio (frete grátis, tipo logístico ou `mode` próprio, retirada).
3. **Condições de venda:** todas as `sale_terms` com valor (tipo e tempo de garantia, **prazo de fabricação**
   `MANUFACTURING_TIME`, quantidade máxima…); garantia antiga do campo `warranty` quando não há termo de garantia.
4. **Ficha técnica:** até 150 atributos; atributos com vários valores juntam todos (`values[].name`, ex.: modelos
   compatíveis); escondidos os internos `SIZE_GRID_ID`, `SIZE_GRID_ROW_ID`, `SELLER_SKU`, `ITEM_CONDITION`.
5. **Variações:** até 100, com nome do atributo ("Cor: Azul; Tamanho: M — com estoque"), ESGOTADA marcada e preço próprio.
6. **Tabela de medidas** (`GET /catalog/charts/{SIZE_GRID_ID}`), até 40 linhas, leitura defensiva.
7. **Produto de catálogo** (`GET /products/{catalog_product_id}`): resumo e características principais.
8. **Descrição completa** (até 20.000 caracteres; acima disso guarda 70% do começo e 30% do fim, com marcador). Usa
   `plain_text`; se vier só `text` (HTML de anúncio antigo), converte para texto. Sem descrição: avisa a IA.

Buscas (`fetchItemContext` em `lib/mercadolivre/questions.ts`): `GET /items/{id}?include_attributes=all` + descrição em
paralelo; depois catálogo e medidas em paralelo.

- Descrição: 404 = sem descrição; outros 4xx (exceto 429) = segue sem ela, com aviso no log; **5xx, 429 e rede sobem o erro**
  e a fila tenta de novo. Antes o erro era engolido e a IA respondia sem ter lido a descrição.
- Catálogo e medidas são complementos: qualquer falha vira "sem esse dado".
- O prompt manda procurar em **todas** as partes do anúncio (principalmente descrição e ficha) antes de concluir que algo
  não existe.
- **Testar** mostra, recolhível, **"O que a IA leu deste anúncio"**: o texto exato que ela recebeu.
- `parseItemId`: em links de catálogo (`/p/MLB…`) o código depois de `/p/` é do produto; vale o `item_id`/`wid` do link.

## Testes

- Unitários: `tests/unit/always-mode.test.ts` (decisão nos dois modos, mensagem padrão, prompt, tom e filtro da caixa de
  entrada, links de catálogo) e `tests/unit/item-reading.test.ts` (promoção, condições de venda, vários valores, atributos
  escondidos, variações, medidas, catálogo, descrição longa e em HTML, limite de variações).
- IA real (`tests/integration/ai-live.test.ts`, 22 cenários): informação só na descrição, só na ficha, prazo de fabricação,
  tabela de medidas, atributo com vários valores; modo sempre: informação ausente → mensagem padrão, estoque → resposta
  normal, desconto → condições do anúncio, reclamação → desculpas + Minhas compras (sem "90%"), contato → resposta segura.

## Limites conhecidos

- A API do ML exige token até para anúncios públicos: a leitura foi testada com dados no formato da documentação, não com um
  anúncio real (falta uma conta ML conectada na staging).
- Anúncios no modelo "preço por variação" (User Products, cada variação um anúncio) não trazem as variações irmãs; a IA lê
  os atributos do próprio anúncio.
- Resultados conta as mensagens padrão como respostas da IA (não separa ainda).
