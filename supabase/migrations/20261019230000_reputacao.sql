-- Escudo de Reputação, etapa 1 (Sessão 29, 2026-10-19): termômetro, despachos, valor da cor, previsão e alertas.
-- Spec: docs/superpowers/specs/2026-10-19-escudo-reputacao-design.md
--
-- Aditiva: 6 tabelas novas e 1 função nova (claim_reputation_sync, só service role). Nenhuma tabela existente muda:
-- ml_accounts, organizations e ml_orders só são LIDAS. Sem gatilho em tabela existente: a função cria sozinha a linha de
-- sincronização das contas que ainda não têm.
-- Mesma regra das outras tabelas da v2: o navegador só LÊ (RLS por organização) e toda escrita é do servidor. Privilégios
-- padrão negados (CEREBRO §6.1f): GRANT explícito em tudo.

-- ---------------------------------------------------------------------------------------------- tabelas

-- Preferências do Escudo por organização (sem linha = padrão: e-mails ligados).
create table public.reputation_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  email_alerts boolean not null default true,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Rodadas de cada conta do ML: termômetro (30 min), despachos (10 min) e reclamações (5 min).
create table public.reputation_sync (
  ml_account_id uuid primary key references public.ml_accounts (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  next_reputation_at timestamptz not null default now(),
  next_shipments_at timestamptz not null default now(),
  next_claims_at timestamptz not null default now(),
  last_reputation_at timestamptz,
  last_shipments_at timestamptz,
  last_claims_at timestamptz,
  -- Reclamações do período (+30 dias) já buscadas uma vez; depois só as alteradas.
  claims_backfilled_at timestamptz,
  last_error text check (char_length(last_error) <= 500),
  last_error_at timestamptz,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reputation_sync_org_idx on public.reputation_sync (organization_id);

-- Termômetro do ML: 1 linha por dia e outra a cada mudança dos números (signature). Números "efetivos": os reais quando
-- a conta está protegida (excluded.real_*), os mostrados pelo ML nos outros casos. raw = só o seller_reputation do ML.
create table public.reputation_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  ml_account_id uuid not null references public.ml_accounts (id) on delete cascade,
  captured_at timestamptz not null default now(),
  level_id text check (char_length(level_id) <= 40),
  color text not null check (color in ('green', 'light_green', 'yellow', 'orange', 'red', 'none')),
  power_seller_status text check (char_length(power_seller_status) <= 40),
  protected boolean not null default false,
  protection_end_date timestamptz,
  real_color text check (real_color in ('green', 'light_green', 'yellow', 'orange', 'red', 'none')),
  period_days integer check (period_days > 0 and period_days <= 400),
  sales_completed integer not null default 0 check (sales_completed >= 0),
  claims_value integer not null default 0 check (claims_value >= 0),
  claims_rate numeric(9, 6) not null default 0 check (claims_rate >= 0),
  cancellations_value integer not null default 0 check (cancellations_value >= 0),
  cancellations_rate numeric(9, 6) not null default 0 check (cancellations_rate >= 0),
  delayed_value integer not null default 0 check (delayed_value >= 0),
  delayed_rate numeric(9, 6) not null default 0 check (delayed_rate >= 0),
  signature text not null check (char_length(signature) between 1 and 500),
  raw jsonb not null default '{}'::jsonb check (octet_length(raw::text) <= 20000)
);

create index reputation_snapshots_account_idx on public.reputation_snapshots (ml_account_id, captured_at desc);
create index reputation_snapshots_org_idx on public.reputation_snapshots (organization_id);

-- Envios das vendas pagas (lidas de ml_orders): prazo de despacho (SLA) e custo/desconto do frete do vendedor.
--  stage: pending = ainda não conferido; waiting = esperando o vendedor despachar; shipped = despachado (ou entregue);
--         fulfillment = Full (o ML despacha); cancelled = envio cancelado.
create table public.reputation_shipments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  ml_account_id uuid not null references public.ml_accounts (id) on delete cascade,
  shipment_id bigint not null check (shipment_id > 0),
  ml_order_id bigint check (ml_order_id > 0),
  pack_id bigint check (pack_id > 0),
  item_title text check (char_length(item_title) <= 300),
  ordered_at timestamptz,
  stage text not null default 'pending' check (stage in ('pending', 'waiting', 'shipped', 'fulfillment', 'cancelled')),
  logistic_type text check (char_length(logistic_type) <= 40),
  status text check (char_length(status) <= 40),
  substatus text check (char_length(substatus) <= 60),
  sla_status text check (char_length(sla_status) <= 40),
  sla_service text check (char_length(sla_service) <= 40),
  sla_expected_at timestamptz,
  shipped_at timestamptz,
  checked_at timestamptz,
  next_check_at timestamptz not null default now(),
  check_attempts integer not null default 0 check (check_attempts >= 0),
  costs_checked_at timestamptz,
  sender_cost numeric(12, 2),
  sender_discount numeric(12, 2),
  gross_amount numeric(12, 2),
  currency_id text check (char_length(currency_id) <= 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ml_account_id, shipment_id)
);

create index reputation_shipments_check_idx on public.reputation_shipments (ml_account_id, next_check_at)
  where stage in ('pending', 'waiting');
create index reputation_shipments_ordered_idx on public.reputation_shipments (ml_account_id, ordered_at desc);
create index reputation_shipments_costs_idx on public.reputation_shipments (ml_account_id, ordered_at)
  where costs_checked_at is null and stage in ('shipped', 'fulfillment');
create index reputation_shipments_org_idx on public.reputation_shipments (organization_id);

-- Reclamações em que o vendedor é o reclamado (previsão da etapa 1; a etapa 2 acrescenta detalhe, mensagens e IA).
create table public.reputation_claims (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  ml_account_id uuid not null references public.ml_accounts (id) on delete cascade,
  claim_id bigint not null check (claim_id > 0),
  resource text check (char_length(resource) <= 40),
  resource_id bigint,
  type text not null check (char_length(type) between 1 and 40),
  stage text check (char_length(stage) <= 40),
  status text not null check (char_length(status) between 1 and 20),
  reason_id text check (char_length(reason_id) <= 40),
  fulfilled boolean,
  quantity_type text check (char_length(quantity_type) <= 20),
  -- available_actions do vendedor (respondent): [{ action, mandatory, due_date }], até 30.
  seller_actions jsonb not null default '[]'::jsonb check (
    case when jsonb_typeof(seller_actions) = 'array' then jsonb_array_length(seller_actions) <= 30 else false end
  ),
  -- Menor prazo de uma ação obrigatória do vendedor.
  next_due_at timestamptz,
  resolution jsonb,
  ml_created_at timestamptz,
  ml_updated_at timestamptz,
  -- Data da venda (sai da conta da reputação em sale_at + período). source: order = da venda; claim = da reclamação.
  sale_at timestamptz,
  sale_source text check (sale_source in ('order', 'claim')),
  affects_reputation text check (affects_reputation in ('affected', 'not_affected', 'not_applies')),
  has_incentive boolean,
  affects_due_at timestamptz,
  affects_checked_at timestamptz,
  enrich_attempts integer not null default 0 check (enrich_attempts >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ml_account_id, claim_id)
);

create index reputation_claims_account_status_idx on public.reputation_claims (ml_account_id, status, next_due_at);
create index reputation_claims_affected_idx on public.reputation_claims (ml_account_id, sale_at)
  where affects_reputation = 'affected';
create index reputation_claims_enrich_idx on public.reputation_claims (ml_account_id, ml_created_at desc)
  where affects_checked_at is null;
create index reputation_claims_org_idx on public.reputation_claims (organization_id);

-- Alertas do Escudo (uma chave por conta + evento). Resolvem sozinhos quando a situação acaba.
--  email_status: pending = vai por e-mail; sent/skipped/failed = já tratado; null = alerta só do app.
create table public.reputation_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  ml_account_id uuid not null references public.ml_accounts (id) on delete cascade,
  kind text not null check (kind in (
    'shipment_late', 'shipment_at_risk', 'margin_low', 'color_dropped', 'color_recovered',
    'claim_new', 'claim_due_soon', 'claim_exclusion', 'claim_excluded'
  )),
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 200),
  severity text not null check (severity in ('urgent', 'info')),
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '' check (char_length(body) <= 1000),
  data jsonb not null default '{}'::jsonb check (octet_length(data::text) <= 4000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  opened_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  expires_at timestamptz,
  email_status text check (email_status in ('pending', 'sent', 'skipped', 'failed')),
  emailed_at timestamptz,
  email_error text check (char_length(email_error) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ml_account_id, dedupe_key)
);

create index reputation_alerts_open_idx on public.reputation_alerts (organization_id, severity) where status = 'open';
create index reputation_alerts_account_idx on public.reputation_alerts (ml_account_id, status, opened_at desc);
create index reputation_alerts_email_idx on public.reputation_alerts (created_at) where email_status = 'pending';
create index reputation_alerts_emailed_idx on public.reputation_alerts (ml_account_id, kind, emailed_at desc)
  where emailed_at is not null;

create trigger reputation_settings_set_updated_at before update on public.reputation_settings
  for each row execute function public.set_updated_at();
create trigger reputation_sync_set_updated_at before update on public.reputation_sync
  for each row execute function public.set_updated_at();
create trigger reputation_shipments_set_updated_at before update on public.reputation_shipments
  for each row execute function public.set_updated_at();
create trigger reputation_claims_set_updated_at before update on public.reputation_claims
  for each row execute function public.set_updated_at();
create trigger reputation_alerts_set_updated_at before update on public.reputation_alerts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------- rodadas

-- Reserva contas para o cron do Escudo (evita dois processos na mesma conta). Antes, cria a linha de sincronização das
-- contas ativas que ainda não têm (contas novas entram sozinhas, sem gatilho em ml_accounts).
--  * p_ml_account_id nulo: contas com alguma rodada vencida;
--  * p_ml_account_id preenchido ("Atualizar agora"): só essa conta, vencida ou não (se não estiver travada).
-- Só contas ativas, com token válido e organização com acesso (espelho de computeAccess em lib/access/access.ts).
create or replace function public.claim_reputation_sync(
  p_limit integer default 10,
  p_lock_seconds integer default 120,
  p_ml_account_id uuid default null
)
returns setof public.reputation_sync
language sql
security definer
set search_path = ''
as $$
  insert into public.reputation_sync (ml_account_id, organization_id)
  select a.id, a.organization_id
    from public.ml_accounts a
   where a.status = 'active'
     and (p_ml_account_id is null or a.id = p_ml_account_id)
  on conflict (ml_account_id) do nothing;

  with due as (
    select s.ml_account_id
      from public.reputation_sync s
      join public.ml_accounts a on a.id = s.ml_account_id
      join public.organizations o on o.id = a.organization_id
     where a.status = 'active'
       and a.token_status = 'valid'
       and (s.locked_until is null or s.locked_until < now())
       and (
         (p_ml_account_id is null and least(s.next_reputation_at, s.next_shipments_at, s.next_claims_at) <= now())
         or s.ml_account_id = p_ml_account_id
       )
       and (
         o.billing_exempt
         or o.subscription_status = 'active'
         or (o.subscription_status in ('canceled', 'past_due') and o.current_period_end > now())
         or (o.subscription_status = 'trialing' and o.trial_ends_at > now())
       )
     order by least(s.next_reputation_at, s.next_shipments_at, s.next_claims_at)
     limit greatest(1, least(p_limit, 100))
     for update of s skip locked
  )
  update public.reputation_sync s
     set locked_until = now() + make_interval(secs => greatest(30, least(p_lock_seconds, 600)))
    from due
   where s.ml_account_id = due.ml_account_id
  returning s.*;
$$;

-- ---------------------------------------------------------------------------------------------- permissões

revoke execute on function public.claim_reputation_sync(integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.claim_reputation_sync(integer, integer, uuid) to service_role;

alter table public.reputation_settings enable row level security;
alter table public.reputation_sync enable row level security;
alter table public.reputation_snapshots enable row level security;
alter table public.reputation_shipments enable row level security;
alter table public.reputation_claims enable row level security;
alter table public.reputation_alerts enable row level security;

revoke all on table public.reputation_settings, public.reputation_sync, public.reputation_snapshots,
  public.reputation_shipments, public.reputation_claims, public.reputation_alerts from anon, authenticated;
grant select on table public.reputation_settings, public.reputation_sync, public.reputation_snapshots,
  public.reputation_shipments, public.reputation_claims, public.reputation_alerts to authenticated;
grant all on table public.reputation_settings, public.reputation_sync, public.reputation_snapshots,
  public.reputation_shipments, public.reputation_claims, public.reputation_alerts to service_role;

create policy "Membros veem as preferências do Escudo da organização" on public.reputation_settings
  for select to authenticated using (organization_id in (select public.current_user_organization_ids()));
create policy "Membros veem as rodadas do Escudo da organização" on public.reputation_sync
  for select to authenticated using (organization_id in (select public.current_user_organization_ids()));
create policy "Membros veem o termômetro da organização" on public.reputation_snapshots
  for select to authenticated using (organization_id in (select public.current_user_organization_ids()));
create policy "Membros veem os despachos da organização" on public.reputation_shipments
  for select to authenticated using (organization_id in (select public.current_user_organization_ids()));
create policy "Membros veem as reclamações da organização" on public.reputation_claims
  for select to authenticated using (organization_id in (select public.current_user_organization_ids()));
create policy "Membros veem os alertas do Escudo da organização" on public.reputation_alerts
  for select to authenticated using (organization_id in (select public.current_user_organization_ids()));

