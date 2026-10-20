-- Recuperador, etapa 1 (Sessão 30, 2026-10-20): revisão de devoluções com 1 toque e Raio-X do dinheiro (só devoluções).
-- Spec: docs/superpowers/specs/2026-10-20-recuperador-design.md
--
-- Aditiva: 5 tabelas novas, 2 funções novas (claim_recovery_sync, só service role) e dois CHECKs recriados com os mesmos
-- valores de antes + os novos (reputation_alerts.kind e ai_usage_events.feature). Nenhuma tabela existente muda:
-- ml_accounts, organizations, reputation_claims e reputation_sync só são LIDAS.
-- Mesma regra das outras tabelas da v2: o navegador só LÊ (RLS por organização) e toda escrita é do servidor. Privilégios
-- padrão negados (CEREBRO §6.1f): GRANT explícito em tudo.

-- ---------------------------------------------------------------------------------------------- tabelas

-- Rodadas de cada conta do ML (devoluções, a cada 5 minutos). Linha criada por claim_recovery_sync (sem gatilho).
create table public.recovery_sync (
  ml_account_id uuid primary key references public.ml_accounts (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  next_returns_at timestamptz not null default now(),
  last_returns_at timestamptz,
  last_error text check (char_length(last_error) <= 500),
  last_error_at timestamptz,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recovery_sync_org_idx on public.recovery_sync (organization_id);

-- Progresso do Raio-X (últimos 90 dias) por conta. waiting = esperando o Escudo terminar de carregar as reclamações.
create table public.recovery_scans (
  ml_account_id uuid primary key references public.ml_accounts (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting', 'running', 'done')),
  window_days integer not null default 90 check (window_days between 1 and 400),
  returns_total integer not null default 0 check (returns_total >= 0),
  returns_done integer not null default 0 check (returns_done >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recovery_scans_org_idx on public.recovery_scans (organization_id);

-- Uma linha por devolução (reclamação do tipo "returns" de reputation_claims). phase:
--   waiting = a caminho / em preparação · needs_review = chegou ao vendedor e o ML liberou a revisão · reviewed = o vendedor
--   já revisou · at_warehouse = indo para (ou no) armazém do ML, que revisa primeiro · closed = encerrada · other = sem
--   devolução no ML (a reclamação não tem return).
create table public.recovery_returns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  ml_account_id uuid not null references public.ml_accounts (id) on delete cascade,
  claim_row_id uuid not null references public.reputation_claims (id) on delete cascade,
  claim_id bigint not null check (claim_id > 0),
  return_id bigint check (return_id is null or return_id > 0),
  phase text not null check (phase in ('waiting', 'needs_review', 'reviewed', 'at_warehouse', 'closed', 'other')),
  claim_status text not null check (char_length(claim_status) between 1 and 20),
  return_status text check (char_length(return_status) <= 30),
  return_subtype text check (char_length(return_subtype) <= 40),
  status_money text check (char_length(status_money) <= 30),
  refund_at text check (char_length(refund_at) <= 30),
  shipment_status text check (char_length(shipment_status) <= 30),
  -- Destino do pacote: warehouse (armazém do ML) | seller_address (volta ao vendedor) | outro.
  destination text check (char_length(destination) <= 40),
  -- Carrinho com vários pedidos: a revisão vale para o carrinho inteiro.
  is_cart boolean not null default false,
  -- [{ order_id, item_id, return_quantity, total_quantity }] (sem dados do comprador).
  orders jsonb not null default '[]'::jsonb check (
    case when jsonb_typeof(orders) = 'array' then jsonb_array_length(orders) <= 50 else false end
  ),
  -- O ML liberou "o produto chegou certinho" / "chegou com problema" para o vendedor.
  can_review_ok boolean not null default false,
  can_review_fail boolean not null default false,
  -- Prazo do vendedor (detail.due_date da reclamação, quando é a vez dele).
  deadline_at timestamptz,
  -- Revisões do armazém e do vendedor (/returns/{id}/reviews), normalizadas: [{ order_id, method, stage, status,
  -- product_condition, product_destination, reason_id, benefited, seller_status, seller_reason, updated_at }].
  reviews jsonb not null default '[]'::jsonb check (
    case when jsonb_typeof(reviews) = 'array' then jsonb_array_length(reviews) <= 50 else false end
  ),
  order_id bigint,
  item_title text check (char_length(item_title) <= 200),
  sale_at timestamptz,
  amount numeric(14, 2) check (amount is null or amount >= 0),
  currency_id text check (char_length(currency_id) <= 10),
  claim_created_at timestamptz,
  -- reputation_claims.ml_updated_at no momento da leitura (mudou na busca = ler a devolução de novo).
  claim_updated_at timestamptz,
  ml_closed_at timestamptz,
  -- Revisão enviada pela maanu (a pedido do dono/administrador).
  review_kind text check (review_kind in ('ok', 'fail')),
  review_submitted_at timestamptz,
  review_submitted_by uuid references auth.users (id) on delete set null,
  -- "Recuperado pela maanu": revisão com problema enviada pela maanu e o ML ressarciu o vendedor.
  recovered_at timestamptz,
  recovered_amount numeric(14, 2) check (recovered_amount is null or recovered_amount >= 0),
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ml_account_id, claim_id)
);

create index recovery_returns_phase_idx on public.recovery_returns (ml_account_id, phase, deadline_at);
create index recovery_returns_created_idx on public.recovery_returns (ml_account_id, claim_created_at desc);
create index recovery_returns_org_idx on public.recovery_returns (organization_id);
create index recovery_returns_claim_idx on public.recovery_returns (claim_row_id);
create index recovery_returns_recovered_idx on public.recovery_returns (organization_id, recovered_at)
  where recovered_at is not null;

-- Achados do Raio-X (cada um com texto pronto na tela; a maanu não executa nada por eles).
create table public.recovery_findings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  ml_account_id uuid not null references public.ml_accounts (id) on delete cascade,
  return_row_id uuid references public.recovery_returns (id) on delete cascade,
  kind text not null check (kind in ('return_unsaleable_unreimbursed', 'return_reimbursed')),
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 200),
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  amount numeric(14, 2) check (amount is null or amount >= 0),
  currency_id text check (char_length(currency_id) <= 10),
  -- Evidência compacta (sem dados pessoais): { claim_id, order_id, item_title, product_condition, ... }.
  evidence jsonb not null default '{}'::jsonb check (octet_length(evidence::text) <= 8000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  detected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ml_account_id, dedupe_key)
);

create index recovery_findings_account_idx on public.recovery_findings (ml_account_id, status, kind);
create index recovery_findings_org_idx on public.recovery_findings (organization_id);
create index recovery_findings_return_idx on public.recovery_findings (return_row_id);

-- Tudo o que a maanu enviou ao ML numa devolução, a pedido do dono/administrador (quem, quando, o quê e a resposta do
-- ML). IMUTÁVEL: o gatilho recusa UPDATE, DELETE e TRUNCATE até para o service role. Sem chave estrangeira, para nunca
-- travar a exclusão de uma conta.
create table public.recovery_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  ml_account_id uuid not null,
  return_row_id uuid not null,
  claim_row_id uuid not null,
  claim_id bigint not null check (claim_id > 0),
  return_id bigint check (return_id is null or return_id > 0),
  action text not null check (action in ('return_review_ok', 'return_review_fail')),
  details jsonb not null default '{}'::jsonb check (octet_length(details::text) <= 12000),
  status text not null check (status in ('success', 'failed')),
  ml_status integer,
  ml_response jsonb check (ml_response is null or octet_length(ml_response::text) <= 8000),
  error text check (char_length(error) <= 500),
  performed_by uuid not null,
  performed_at timestamptz not null default now()
);

create index recovery_actions_return_idx on public.recovery_actions (return_row_id, performed_at desc);
create index recovery_actions_claim_idx on public.recovery_actions (claim_row_id, performed_at desc);
create index recovery_actions_org_idx on public.recovery_actions (organization_id, performed_at desc);

create or replace function public.recovery_actions_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'RECOVERY_ACTIONS_IMMUTABLE';
end;
$$;

create trigger recovery_actions_no_update before update or delete on public.recovery_actions
  for each row execute function public.recovery_actions_immutable();
create trigger recovery_actions_no_truncate before truncate on public.recovery_actions
  for each statement execute function public.recovery_actions_immutable();

create trigger recovery_sync_set_updated_at before update on public.recovery_sync
  for each row execute function public.set_updated_at();
create trigger recovery_scans_set_updated_at before update on public.recovery_scans
  for each row execute function public.set_updated_at();
create trigger recovery_returns_set_updated_at before update on public.recovery_returns
  for each row execute function public.set_updated_at();
create trigger recovery_findings_set_updated_at before update on public.recovery_findings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------- alertas e uso da IA

-- Os alertas do Recuperador usam a tabela e o e-mail do Escudo (reputation_alerts). Mesmos valores de antes + 3 novos.
alter table public.reputation_alerts drop constraint if exists reputation_alerts_kind_check;
alter table public.reputation_alerts add constraint reputation_alerts_kind_check check (kind in (
  'shipment_late', 'shipment_at_risk', 'margin_low', 'color_dropped', 'color_recovered',
  'claim_new', 'claim_due_soon', 'claim_exclusion', 'claim_excluded',
  'return_review_due', 'return_review_closing', 'return_recovered'
));

alter table public.ai_usage_events drop constraint if exists ai_usage_events_feature_check;
alter table public.ai_usage_events add constraint ai_usage_events_feature_check check (feature in (
  'question_answer', 'question_suggestion', 'assistant_test',
  'after_sale_answer', 'after_sale_suggestion', 'after_sale_test',
  'key_check',
  'listing_improvement',
  'reputation_claim_analysis',
  'recovery_return_message'
));

-- ---------------------------------------------------------------------------------------------- rodadas

-- Reserva contas para o cron do Recuperador (evita dois processos na mesma conta). Antes, cria a linha de sincronização
-- das contas ativas que ainda não têm.
--  * p_ml_account_id nulo: contas com a rodada vencida;
--  * p_ml_account_id preenchido ("Atualizar agora"): só essa conta, vencida ou não (se não estiver travada).
-- Só contas ativas, com token válido e organização com acesso (espelho de computeAccess em lib/access/access.ts).
create or replace function public.claim_recovery_sync(
  p_limit integer default 10,
  p_lock_seconds integer default 120,
  p_ml_account_id uuid default null
)
returns setof public.recovery_sync
language sql
security definer
set search_path = ''
as $$
  insert into public.recovery_sync (ml_account_id, organization_id)
  select a.id, a.organization_id
    from public.ml_accounts a
   where a.status = 'active'
     and (p_ml_account_id is null or a.id = p_ml_account_id)
  on conflict (ml_account_id) do nothing;

  with due as (
    select s.ml_account_id
      from public.recovery_sync s
      join public.ml_accounts a on a.id = s.ml_account_id
      join public.organizations o on o.id = a.organization_id
     where a.status = 'active'
       and a.token_status = 'valid'
       and (s.locked_until is null or s.locked_until < now())
       and (
         (p_ml_account_id is null and s.next_returns_at <= now())
         or s.ml_account_id = p_ml_account_id
       )
       and (
         o.billing_exempt
         or o.subscription_status = 'active'
         or (o.subscription_status in ('canceled', 'past_due') and o.current_period_end > now())
         or (o.subscription_status = 'trialing' and o.trial_ends_at > now())
       )
     order by s.next_returns_at
     limit greatest(1, least(p_limit, 100))
     for update of s skip locked
  )
  update public.recovery_sync s
     set locked_until = now() + make_interval(secs => greatest(30, least(p_lock_seconds, 600)))
    from due
   where s.ml_account_id = due.ml_account_id
  returning s.*;
$$;

-- ---------------------------------------------------------------------------------------------- permissões

revoke execute on function public.recovery_actions_immutable() from public, anon, authenticated;
revoke execute on function public.claim_recovery_sync(integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.claim_recovery_sync(integer, integer, uuid) to service_role;

alter table public.recovery_sync enable row level security;
alter table public.recovery_scans enable row level security;
alter table public.recovery_returns enable row level security;
alter table public.recovery_findings enable row level security;
alter table public.recovery_actions enable row level security;

revoke all on table public.recovery_sync, public.recovery_scans, public.recovery_returns, public.recovery_findings,
  public.recovery_actions from anon, authenticated;
grant select on table public.recovery_sync, public.recovery_scans, public.recovery_returns, public.recovery_findings,
  public.recovery_actions to authenticated;
grant all on table public.recovery_sync, public.recovery_scans, public.recovery_returns, public.recovery_findings
  to service_role;
grant select, insert on table public.recovery_actions to service_role;

create policy "Membros veem as rodadas do Recuperador da organização" on public.recovery_sync
  for select to authenticated using (organization_id in (select public.current_user_organization_ids()));
create policy "Membros veem o Raio-X da organização" on public.recovery_scans
  for select to authenticated using (organization_id in (select public.current_user_organization_ids()));
create policy "Membros veem as devoluções da organização" on public.recovery_returns
  for select to authenticated using (organization_id in (select public.current_user_organization_ids()));
create policy "Membros veem os achados do Recuperador da organização" on public.recovery_findings
  for select to authenticated using (organization_id in (select public.current_user_organization_ids()));
create policy "Membros veem o histórico de revisões da organização" on public.recovery_actions
  for select to authenticated using (organization_id in (select public.current_user_organization_ids()));