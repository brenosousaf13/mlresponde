-- Perguntas em escala (caixa de entrada com milhares de perguntas por loja).
-- Aditiva: nova função auxiliar, policy de leitura reescrita (mesma regra) e índices novos.
-- ml_questions só existe na v2 (a produção da v1 não é afetada).

-- Organizações do usuário logado. Usada no RLS como conjunto avaliado UMA vez por consulta
-- (antes, is_org_member(organization_id) rodava uma subconsulta para cada linha lida).
create or replace function public.current_user_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.organization_members m
  where m.user_id = (select auth.uid());
$$;

revoke execute on function public.current_user_organization_ids() from public, anon;
grant execute on function public.current_user_organization_ids() to authenticated;

-- Mesma regra de antes (membro da organização vê as perguntas dela), escrita no formato rápido.
alter policy "Membros veem as perguntas da organização" on public.ml_questions
  using (organization_id in (select public.current_user_organization_ids()));

-- Lista da caixa de entrada: ordenada pela data em que o comprador perguntou.
create index if not exists ml_questions_org_asked_idx
  on public.ml_questions (organization_id, question_created_at desc nulls first, created_at desc);

-- Filtro "perguntas deste anúncio" e "anúncios mais perguntados".
create index if not exists ml_questions_org_item_idx
  on public.ml_questions (organization_id, item_id);
