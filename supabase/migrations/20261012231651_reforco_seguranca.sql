-- Reforço de segurança da v2 (2026-10-12, Sessão 15).
-- Este projeto Supabase passa a ser a PRODUÇÃO da v2 (a v1 será descontinuada e NUNCA recebe estas migrações).
-- Nada de dados é apagado: só permissões.

-- 1) Tabelas herdadas da v1 (baseline). A v2 não usa nenhuma delas; estão vazias aqui.
--    Antes: anon e authenticated tinham GRANT total e em question_jobs qualquer usuário logado lia/alterava tudo.
revoke all on table
  public.question_jobs,
  public.ml_credentials,
  public.knowledge_base,
  public.training_examples
from anon, authenticated;

drop policy if exists "Autenticados podem ver tudo" on public.question_jobs;

do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'question_jobs'
  ) then
    alter publication supabase_realtime drop table public.question_jobs;
  end if;
end;
$$;

-- 2) Função do gatilho que liga o RLS em tabelas novas: só o próprio banco a usa.
--    (Gatilhos de evento não dependem de EXECUTE do usuário; isso só tira a função da API /rpc.)
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- 3) Padrão seguro para o que for criado daqui em diante (migrações rodam como postgres):
--    tabela, sequência ou função nova NÃO fica acessível para anon/authenticated sem um GRANT explícito.
--    Se esquecer o GRANT, a funcionalidade falha fechada (erro de permissão) em vez de expor dados.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
alter default privileges for role postgres revoke execute on functions from public;