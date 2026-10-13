# Chaves de IA no painel do administrador (Sessão 17, 2026-10-12)

## Pedido
O Breno quer cadastrar e trocar as chaves da OpenAI pelo painel do administrador, sem depender só da variável de ambiente
`OPENAI_API_KEY` (que exige novo deploy a cada troca), e perguntou se isso é seguro.

## Decisão
Sim, desde que a chave fique **criptografada pelo servidor** com uma chave-mestra que **não** está no banco, e que o painel só
**grave** (nunca mostre) a chave. A variável `OPENAI_API_KEY` continua como último recurso.

| Onde | O que fica |
|---|---|
| Vercel (`AI_KEYS_ENCRYPTION_KEY`, sensível) | Chave-mestra (32 bytes base64). Separada da `ML_TOKEN_ENCRYPTION_KEY`. |
| Supabase (`ai_provider_keys`) | Chave criptografada (AES-256-GCM, dado associado = id da linha), final (`sk-proj-…a1b2`), impressão digital (HMAC com subchave HKDF da mestra), situação, testes. |

Vazar só o banco não expõe chave; vazar só a Vercel não expõe as do painel. Perder a chave-mestra = cadastrar as chaves de
novo (sem perda de dados: a OpenAI emite chaves novas).

## Como a IA escolhe a chave (`lib/ai/key-store.ts`)
1. A chave **em uso** do painel (no máximo 1, índice único parcial), aberta com a chave-mestra.
2. Sem ela (nenhuma em uso, banco fora, chave-mestra ausente/diferente): `OPENAI_API_KEY`.
3. Sem nenhuma: `MissingOpenAIKeyError` (registrada em `ai_usage_events`; a fila tenta de novo).

A escolha fica 1 minuto na memória de cada servidor (trocar no painel limpa a do servidor que trocou; os demais em até 1 min).

## Reserva e troca automática
- Situações: `active` (em uso), `standby` (reserva), `disabled`.
- `trackedCompletion` (`lib/ai/usage.ts`): se a OpenAI devolver **401** com chave do painel, chama `ai_key_report_invalid`
  (desativa a chave, a reserva mais nova entra), relê a chave e **repete a chamada uma vez**. Outros erros (429, 5xx) não
  trocam nada: o limite de uso é do projeto/organização, não da chave.
- Trava contra cascata: no máximo **1 troca automática a cada 10 minutos** (instabilidade de login da OpenAI não queima
  todas as reservas). A troca vai para o histórico como "por sistema".

## Painel (`/admin/chaves-ia`)
- "Qual chave a IA usa": painel → reservas → variável, com a atual destacada.
- Tabela: nome, final da chave, situação, último teste, chamadas/custo de 30 dias, último uso (de `ai_usage_events.ai_key_id`).
- Cadastrar: nome + chave (campo de senha) + "Usar esta chave agora". O servidor limpa o que vem colado, recusa `sk-admin-`,
  confere repetição pela impressão digital, **testa de verdade** (resposta mínima no mesmo modelo/parâmetros, ~US$ 0,000004,
  registrada como `key_check`) e só então criptografa e grava. A chave nunca volta para a tela.
- Ações: testar agora, testar e usar, testar e deixar como reserva, desativar (a reserva assume) e remover (só fora de uso).
- Tudo no histórico (`ai_key.*`), filtro "Chaves de IA" na Auditoria.

## Banco
Migrações `20261013012212_chaves_ia.sql` e `20261013015035_chaves_ia_trava.sql`. Tabela sem acesso para anon/authenticated
(RLS sem policy), service role só com SELECT; escrita só pelas funções `admin_add_ai_key`, `admin_set_ai_key_status`,
`admin_record_ai_key_check`, `admin_delete_ai_key` (todas com `admin_assert`) e `ai_key_report_invalid` (só service role).
`admin_list_ai_keys` nunca devolve o conteúdo criptografado. `ai_usage_events` ganhou `ai_key_id` e `key_source`
(`panel|env`) e a função `key_check`. Testes: `supabase/tests/ai_keys_rls.sql` e `tests/unit/ai-keys.test.ts`.

## Fora do escopo
Outros provedores (a coluna `provider` já existe), trocar o modelo pelo painel, girar a chave-mestra com recriptografia
automática, troca automática por falta de crédito (429 `insufficient_quota`).
