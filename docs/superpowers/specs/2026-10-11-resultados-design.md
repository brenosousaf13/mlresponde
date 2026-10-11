# Resultados — analytics do vendedor (design)

- **Data:** 2026-10-11 · **Status:** implementado na branch `v2` (decisões técnicas delegadas à IA pelo Breno)
- **Pedido do Breno:** faltava no menu uma opção de analytics para o cliente "ter uma noção melhor dos números e de que a
  IA está de fato resolvendo": quanto tempo ela respondeu mais rápido, quanto ele economizou (números financeiros),
  produtos que mais recebem perguntas, o que mais teve resposta etc. Usar os componentes do shadcn/ui.

## 1. Onde fica

- Menu **Resultados** (`/resultados`, ícone de gráfico), logo abaixo de Perguntas. Seção de acesso `resultados`, com as
  mesmas regras do Painel (precisa de conta ML ativa e assinatura/teste em dia; admin da plataforma passa).
- Filtros na URL: `?periodo=7|30|90` (padrão 30, `ToggleGroup`) e `?conta=<id>` (só aparece com 2+ contas).
- Período = últimos N dias contando hoje, a partir da meia-noite de Brasília (fuso fixo -03:00). Comparação com os N dias
  anteriores (mesmo tamanho).

## 2. O que a tela mostra (de cima para baixo)

1. **Economia estimada** (destaque azul-marinho): R$ economizados no período, horas de atendimento poupadas, dias de
   trabalho equivalentes, **projeção anual/mensal no ritmo atual**, respostas da IA (período e desde o início) e
   respostas fora do horário comercial. Botão **Ajustar cálculo** (diálogo).
2. **4 números** (estilo `section-cards` do shadcn): perguntas recebidas (+% vs. período anterior, quantas aguardam
   você); respondidas pela IA (% do total, variação em pontos de automação); tempo de resposta da IA (mediana, "Nx mais
   rápida" que você, % em até 1 min); **espera evitada** (horas que os compradores esperariam até o próximo expediente
   nas perguntas que a IA respondeu à noite/fim de semana).
3. **Perguntas por dia** (gráfico de barras empilhadas: pela IA / por você / aguardando).
4. **Velocidade de resposta**: mediana IA × você e distribuição (até 1 min, 1–5 min, 5–60 min, 1–24 h, mais de 1 dia).
5. **Quando os compradores perguntam**: mapa de calor dia da semana × hora, com a faixa do horário comercial; % fora do
   horário, noites de dias úteis e fins de semana; horário de pico.
6. **Anúncios com mais perguntas** (top 8): perguntas, % do total, % resolvidas pela IA, aguardando, link para as
   perguntas do anúncio (`/perguntas?aba=todas&anuncio=<código>`) e para o anúncio no ML.
7. **O que os compradores mais perguntam**: assuntos identificados por palavras-chave (frete/prazo, retirada, nota
   fiscal, garantia/troca, preço/pagamento, medidas, compatibilidade, cores/estoque, especificações, outros), com
   exemplo real e dica do que colocar no anúncio. Usa as até 1.000 perguntas mais recentes do período.
8. **Onde a IA pode ajudar mais**: taxa de automação e por que as outras perguntas ficaram com você — "não tinha a
   informação" (IA rodou sem rascunho), "ficou em dúvida" (rascunho com certeza baixa), "não chegou a analisar" (sem
   registro da IA: pausada, anúncio bloqueado ou respondida antes no ML) — cada um com o atalho para o Assistente.

## 3. Fórmulas e premissas

- **Economia** = respostas da IA × minutos por resposta ÷ 60 × custo da hora. Padrão **3 min** e **R$ 20/h** (atendente
  com encargos). Editável por dono/admin; vale para a organização (`organizations.analytics_minutes_per_answer`,
  `analytics_hourly_cost`). Projeções: (economia ÷ dias do período) × 30 e × 365.
- **Tempo de resposta** = `answered_at − question_created_at` (visão do comprador), **mediana**. Só entram perguntas que
  chegaram na hora (até 15 min entre a pergunta e o registro): as antigas importadas ao conectar a conta ficam de fora
  para não "punir" a IA. "Você" = respondidas no painel + direto no ML.
- **Horário comercial** fixo: segunda a sexta, 8h às 18h (Brasília). Espera evitada usa o meio da hora de cada
  pergunta como estimativa.
- Momento da pergunta = `question_created_at` (com `created_at` de reserva).

## 4. Implementação

- Migração aditiva `20261011230000_resultados.sql`: 2 colunas com default em `organizations` + função
  `analytics_overview(org, from, to, conta?)` → JSON com totais do período e do anterior, série diária, distribuição
  de velocidade, mapa de horas, top 8 anúncios, causas e total histórico da IA. `security invoker` (RLS garante a
  organização), `execute` só para `authenticated`. Filtro largo por `created_at` usa o índice `(organization_id,
  created_at)`.
- `lib/results/metrics.ts` (puro, testado): período, leitura do JSON, %, variação, fator de velocidade, economia,
  horário comercial/espera evitada, série diária, distribuição, classificação de assuntos. `lib/results/format.ts`.
- `lib/dal/results.ts` (consulta) · `app/(app)/resultados/{page,actions}.tsx` · `components/resultados/*`.
- UI só com shadcn/ui: Card, Chart (Recharts — adicionado com `npx shadcn add chart`), ToggleGroup, Select, Table,
  Progress, Badge, Dialog, Field, InputGroup, Empty. O mapa de calor é uma grade simples (o shadcn não tem heatmap).

## 5. Limitações e próximos passos

- A economia é **estimativa de tempo**; não mede vendas. Próximo passo de maior valor: **vendas após a resposta** —
  com o tópico `orders_v2` e o `buyer_id` já gravado em `ml_questions`, cruzar quem perguntou e comprou depois (R$ em
  vendas que passaram por uma resposta da IA).
- Assuntos por palavra-chave erram em perguntas ambíguas; pode virar classificação pela IA no futuro.
- Horário comercial fixo; dá para ler o horário configurado pelo vendedor no Assistente quando ele virar campo estruturado.