-- Clientes (Sessão 28, 2026-10-19): quem comprou em cada conta do Mercado Livre, para o vendedor conhecer os clientes.
-- Spec: docs/superpowers/specs/2026-10-19-clientes-design.md
--
-- Aditiva e retrocompatível:
--  * 3 tabelas novas (ml_customers, ml_orders, ml_customer_sync) com RLS só de leitura e GRANT explícito
--    (privilégios padrão negados, CEREBRO §6.1f);
--  * funções novas: ingest_ml_orders e claim_customer_sync (só service role) e customers_overview (leitura, RLS);
--  * 1 gatilho novo em ml_accounts (conta nova ganha a linha de sincronização) e 2 índices novos em tabelas existentes
--    (ficha do cliente: perguntas e conversas do mesmo comprador).
--
-- Dados mínimos do comprador (decisão do Breno, 2026-10-19): apelido, nome, sobrenome, cidade/UF e as compras.
-- NADA de e-mail, telefone, CPF/CNPJ ou endereço completo: o Mercado Livre não entrega e-mail nem (fora do ME1) telefone,
-- e o uso dos dados fora da plataforma é proibido.
-- Mesma regra das outras tabelas da v2: o navegador só LÊ (RLS por organização); toda escrita é do servidor.

-- ---------------------------------------------------------------------------------------------- tabelas

-- Um cliente por conta do Mercado Livre + comprador (o mesmo comprador em duas lojas da organização = dois clientes).
create table public.ml_customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  ml_account_id uuid not null references public.ml_accounts (id) on delete cascade,
  buyer_id bigint not null check (buyer_id > 0),
  nickname text check (char_length(nickname) <= 120),
  first_name text check (char_length(first_name) <= 120),
  last_name text check (char_length(last_name) <= 120),
  -- Nome completo para busca e exibição (nulo quando o ML não manda nome).
  full_name text generated always as (
    nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
  ) stored,
  -- Só cidade e UF, da compra mais recente com envio (lidas do envio; o resto do endereço não é guardado).
  city text check (char_length(city) <= 120),
  state text check (state ~ '^[A-Z]{2}$'),
  -- Números das compras válidas (paga, paga em parte, devolução parcial), recalculados a cada venda recebida.
  first_order_at timestamptz,
  last_order_at timestamptz,
  purchases_count integer not null default 0 check (purchases_count >= 0),
  total_spent numeric(14, 2) not null default 0,
  currency_id text check (char_length(currency_id) <= 10),
  -- Cidade/UF a buscar no envio desta venda (a mais recente do cliente com envio).
  location_pending boolean not null default false,
  location_ml_order_id bigint,
  -- Observações internas da loja (só a equipe da organização vê).
  notes text not null default '' check (char_length(notes) <= 2000),
  notes_updated_by uuid references auth.users (id) on delete set null,
  notes_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ml_account_id, buyer_id)
);

comment on table public.ml_customers is
  'Compradores de cada conta do ML (aba Clientes). Dados mínimos: sem e-mail, telefone, documento ou endereço completo.';

create index ml_customers_account_last_idx on public.ml_customers (ml_account_id, last_order_at desc nulls last);
create index ml_customers_account_purchases_idx on public.ml_customers (ml_account_id, purchases_count desc);
create index ml_customers_account_spent_idx on public.ml_customers (ml_account_id, total_spent desc);
create index ml_customers_org_last_idx on public.ml_customers (organization_id, last_order_at desc nulls last);
create index ml_customers_location_idx on public.ml_customers (updated_at) where location_pending;

-- Uma linha por venda do Mercado Livre (várias vendas do mesmo pack = 1 compra).
create table public.ml_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  ml_account_id uuid not null references public.ml_accounts (id) on delete cascade,
  customer_id uuid not null references public.ml_customers (id) on delete cascade,
  ml_order_id bigint not null check (ml_order_id > 0),
  pack_id bigint check (pack_id > 0),
  buyer_id bigint not null check (buyer_id > 0),
  status text not null check (char_length(status) between 1 and 40),
  ordered_at timestamptz,
  closed_at timestamptz,
  -- last_updated do ML: dado mais velho nunca sobrescreve dado mais novo.
  ml_last_updated timestamptz,
  total_amount numeric(14, 2),
  paid_amount numeric(14, 2),
  currency_id text check (char_length(currency_id) <= 10),
  shipment_id bigint,
  mediations_count integer not null default 0 check (mediations_count >= 0),
  -- Até 10 itens: [{ id, title, variation, quantity, unit_price }].
  items jsonb not null default '[]'::jsonb check (
    case when jsonb_typeof(items) = 'array' then jsonb_array_length(items) <= 10 else false end
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ml_account_id, ml_order_id)
);

create index ml_orders_customer_idx on public.ml_orders (customer_id, ordered_at desc nulls last);
create index ml_orders_org_idx on public.ml_orders (organization_id);

-- Sincronização de cada conta: importação dos últimos 12 meses (janelas de ~1 mês, da mais nova para a mais velha) e
-- depois a conferência a cada 10 minutos (vendas novas ou alteradas).
create table public.ml_customer_sync (
  ml_account_id uuid primary key references public.ml_accounts (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  import_since timestamptz,
  window_from timestamptz,
  window_to timestamptz,
  window_offset integer not null default 0 check (window_offset >= 0),
  orders_imported integer not null default 0 check (orders_imported >= 0),
  import_started_at timestamptz,
  import_finished_at timestamptz,
  last_polled_at timestamptz,
  last_error text check (char_length(last_error) <= 500),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ml_customer_sync_org_idx on public.ml_customer_sync (organization_id);

create trigger ml_customers_set_updated_at before update on public.ml_customers
  for each row execute function public.set_updated_at();
create trigger ml_orders_set_updated_at before update on public.ml_orders
  for each row execute function public.set_updated_at();
create trigger ml_customer_sync_set_updated_at before update on public.ml_customer_sync
  for each row execute function public.set_updated_at();

-- Ficha do cliente: perguntas e conversas de pós-venda do mesmo comprador na mesma conta.
create index if not exists ml_questions_account_buyer_idx on public.ml_questions (ml_account_id, buyer_id);
create index if not exists ml_conversations_account_buyer_idx on public.ml_conversations (ml_account_id, buyer_id);

-- ---------------------------------------------------------------------------------------------- sincronização

-- Conta do ML nova ganha a linha de sincronização (importação pendente). Reconectar não cria outra: não reimporta.
create or replace function public.ml_accounts_create_customer_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ml_customer_sync (ml_account_id, organization_id)
  values (new.id, new.organization_id)
  on conflict (ml_account_id) do nothing;
  return new;
end;
$$;

create trigger ml_accounts_create_customer_sync after insert on public.ml_accounts
  for each row execute function public.ml_accounts_create_customer_sync();

-- Contas que já existem: importação pendente. As desconectadas também ganham a linha, mas só sincronizam quando forem
-- reconectadas (claim_customer_sync só pega contas ativas).
insert into public.ml_customer_sync (ml_account_id, organization_id)
select a.id, a.organization_id
  from public.ml_accounts a
on conflict (ml_account_id) do nothing;

-- Situações do ML que contam como compra (espelho de PURCHASE_STATUSES em lib/customers/orders.ts).
create or replace function public.ml_order_is_purchase(p_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_status in ('paid', 'partially_paid', 'partially_refunded'), false);
$$;

-- Lê o lote de vendas enviado pelo servidor (formato de toIngestOrder em lib/customers/orders.ts): descarta linhas sem
-- venda, comprador ou situação, limita os textos e fica com a versão mais nova de cada venda repetida no lote.
create or replace function public.ml_orders_payload(p_orders jsonb)
returns table (
  ml_order_id bigint,
  pack_id bigint,
  buyer_id bigint,
  buyer_nickname text,
  buyer_first_name text,
  buyer_last_name text,
  status text,
  ordered_at timestamptz,
  closed_at timestamptz,
  ml_last_updated timestamptz,
  total_amount numeric,
  paid_amount numeric,
  currency_id text,
  shipment_id bigint,
  mediations_count integer,
  items jsonb
)
language sql
stable
set search_path = ''
as $$
  select distinct on (x.ml_order_id)
    x.ml_order_id,
    case when x.pack_id > 0 then x.pack_id end,
    x.buyer_id,
    left(nullif(btrim(x.buyer_nickname), ''), 120),
    left(nullif(btrim(x.buyer_first_name), ''), 120),
    left(nullif(btrim(x.buyer_last_name), ''), 120),
    left(btrim(x.status), 40),
    x.ordered_at,
    x.closed_at,
    x.ml_last_updated,
    round(x.total_amount, 2),
    round(x.paid_amount, 2),
    left(nullif(btrim(x.currency_id), ''), 10),
    case when x.shipment_id > 0 then x.shipment_id end,
    greatest(coalesce(x.mediations_count, 0), 0),
    case
      when jsonb_typeof(x.items) = 'array' then
        case when jsonb_array_length(x.items) <= 10 then x.items else '[]'::jsonb end
      else '[]'::jsonb
    end
  from jsonb_to_recordset(p_orders) as x(
    ml_order_id bigint,
    pack_id bigint,
    buyer_id bigint,
    buyer_nickname text,
    buyer_first_name text,
    buyer_last_name text,
    status text,
    ordered_at timestamptz,
    closed_at timestamptz,
    ml_last_updated timestamptz,
    total_amount numeric,
    paid_amount numeric,
    currency_id text,
    shipment_id bigint,
    mediations_count integer,
    items jsonb
  )
  where x.ml_order_id > 0
    and x.buyer_id > 0
    and nullif(btrim(x.status), '') is not null
  order by x.ml_order_id, x.ml_last_updated desc nulls last;
$$;

-- Grava um lote de vendas de uma conta (importação, conferência ou notificação orders_v2) e recalcula os clientes do
-- lote. Idempotente: a mesma venda de novo não muda nada; versão mais velha (ml_last_updated) não sobrescreve a nova.
-- Devolve quantas vendas foram gravadas ou atualizadas.
create or replace function public.ingest_ml_orders(p_ml_account_id uuid, p_orders jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_changed integer := 0;
begin
  if p_orders is null or jsonb_typeof(p_orders) <> 'array' then
    raise exception 'INGEST_INVALID_PAYLOAD';
  end if;
  if jsonb_array_length(p_orders) > 200 then
    raise exception 'INGEST_TOO_MANY_ORDERS';
  end if;

  select a.organization_id into v_organization_id from public.ml_accounts a where a.id = p_ml_account_id;
  if v_organization_id is null then
    raise exception 'ML_ACCOUNT_NOT_FOUND';
  end if;

  -- 1) Clientes do lote. Apelido e nome só mudam com uma venda tão ou mais nova que a última conhecida.
  --    Do lote, vale o apelido/nome mais recente que veio preenchido; last_order_at aqui é só a data mais nova do lote
  --    (o passo 3 recalcula com as compras válidas).
  insert into public.ml_customers as c
    (organization_id, ml_account_id, buyer_id, nickname, first_name, last_name, last_order_at)
  select v_organization_id, p_ml_account_id, r.buyer_id,
         (array_agg(r.buyer_nickname order by r.ordered_at desc nulls last) filter (where r.buyer_nickname is not null))[1],
         (array_agg(r.buyer_first_name order by r.ordered_at desc nulls last) filter (where r.buyer_first_name is not null))[1],
         (array_agg(r.buyer_last_name order by r.ordered_at desc nulls last) filter (where r.buyer_last_name is not null))[1],
         max(r.ordered_at)
    from public.ml_orders_payload(p_orders) r
   group by r.buyer_id
  on conflict (ml_account_id, buyer_id) do update
     set nickname = case
           when c.nickname is null
             or coalesce(excluded.last_order_at, '-infinity'::timestamptz) >= coalesce(c.last_order_at, '-infinity'::timestamptz)
           then coalesce(excluded.nickname, c.nickname) else c.nickname end,
         first_name = case
           when c.first_name is null
             or coalesce(excluded.last_order_at, '-infinity'::timestamptz) >= coalesce(c.last_order_at, '-infinity'::timestamptz)
           then coalesce(excluded.first_name, c.first_name) else c.first_name end,
         last_name = case
           when c.last_name is null
             or coalesce(excluded.last_order_at, '-infinity'::timestamptz) >= coalesce(c.last_order_at, '-infinity'::timestamptz)
           then coalesce(excluded.last_name, c.last_name) else c.last_name end;

  -- 2) Vendas. Só atualiza quando a versão recebida é tão ou mais nova que a gravada.
  insert into public.ml_orders as o
    (organization_id, ml_account_id, customer_id, ml_order_id, pack_id, buyer_id, status, ordered_at, closed_at,
     ml_last_updated, total_amount, paid_amount, currency_id, shipment_id, mediations_count, items)
  select v_organization_id, p_ml_account_id, c.id, r.ml_order_id, r.pack_id, r.buyer_id, r.status, r.ordered_at,
         r.closed_at, r.ml_last_updated, r.total_amount, r.paid_amount, r.currency_id, r.shipment_id,
         r.mediations_count, r.items
    from public.ml_orders_payload(p_orders) r
    join public.ml_customers c on c.ml_account_id = p_ml_account_id and c.buyer_id = r.buyer_id
  on conflict (ml_account_id, ml_order_id) do update
     set customer_id = excluded.customer_id,
         pack_id = excluded.pack_id,
         buyer_id = excluded.buyer_id,
         status = excluded.status,
         ordered_at = coalesce(excluded.ordered_at, o.ordered_at),
         closed_at = coalesce(excluded.closed_at, o.closed_at),
         ml_last_updated = excluded.ml_last_updated,
         total_amount = excluded.total_amount,
         paid_amount = excluded.paid_amount,
         currency_id = coalesce(excluded.currency_id, o.currency_id),
         shipment_id = coalesce(excluded.shipment_id, o.shipment_id),
         mediations_count = excluded.mediations_count,
         items = excluded.items
   where coalesce(excluded.ml_last_updated, '-infinity'::timestamptz)
         >= coalesce(o.ml_last_updated, '-infinity'::timestamptz);
  get diagnostics v_changed = row_count;

  -- 3) Números dos clientes do lote (compras contam por pack; só as situações válidas) e a venda de onde vem a cidade.
  with affected as (
    select c.id
      from public.ml_customers c
     where c.ml_account_id = p_ml_account_id
       and c.buyer_id in (select r.buyer_id from public.ml_orders_payload(p_orders) r)
  ),
  stats as (
    select a.id as customer_id,
           count(distinct coalesce(o.pack_id, o.ml_order_id)) filter (where public.ml_order_is_purchase(o.status)) as purchases,
           coalesce(sum(o.total_amount) filter (where public.ml_order_is_purchase(o.status)), 0) as total,
           min(o.ordered_at) filter (where public.ml_order_is_purchase(o.status)) as first_at,
           max(o.ordered_at) filter (where public.ml_order_is_purchase(o.status)) as last_at,
           (array_agg(o.currency_id order by o.ordered_at desc nulls last)
              filter (where public.ml_order_is_purchase(o.status) and o.currency_id is not null))[1] as currency,
           (array_agg(o.ml_order_id order by o.ordered_at desc nulls last, o.ml_order_id desc)
              filter (where public.ml_order_is_purchase(o.status) and o.shipment_id is not null))[1] as location_order
      from affected a
      left join public.ml_orders o on o.customer_id = a.id
     group by a.id
  )
  update public.ml_customers c
     set purchases_count = s.purchases,
         total_spent = s.total,
         first_order_at = s.first_at,
         last_order_at = s.last_at,
         currency_id = coalesce(s.currency, c.currency_id),
         location_ml_order_id = s.location_order,
         location_pending = case
           when s.location_order is null then false
           when s.location_order is distinct from c.location_ml_order_id then true
           else c.location_pending
         end
    from stats s
   where c.id = s.customer_id;

  return v_changed;
end;
$$;

-- Reserva contas para o cron de clientes (evita dois processos na mesma conta).
--  * p_kind = 'import': importação pendente ou em andamento (com a próxima tentativa vencida);
--  * p_kind = 'poll': importação concluída e sem conferência há 10 minutos.
-- Só contas ativas, com token válido e organização com acesso (espelho de computeAccess em lib/access/access.ts).
create or replace function public.claim_customer_sync(
  p_kind text,
  p_limit integer default 10,
  p_lock_seconds integer default 120
)
returns setof public.ml_customer_sync
language sql
security definer
set search_path = ''
as $$
  with due as (
    select s.ml_account_id
      from public.ml_customer_sync s
      join public.ml_accounts a on a.id = s.ml_account_id
      join public.organizations o on o.id = s.organization_id
     where a.status = 'active'
       and a.token_status = 'valid'
       and (s.locked_until is null or s.locked_until < now())
       and s.next_attempt_at <= now()
       and (
         (p_kind = 'import' and s.status in ('pending', 'running'))
         or (p_kind = 'poll' and s.status = 'done'
             and (s.last_polled_at is null or s.last_polled_at < now() - interval '10 minutes'))
       )
       and (
         o.billing_exempt
         or o.subscription_status = 'active'
         or (o.subscription_status in ('canceled', 'past_due') and o.current_period_end > now())
         or (o.subscription_status = 'trialing' and o.trial_ends_at > now())
       )
     order by coalesce(s.last_polled_at, s.next_attempt_at)
     limit greatest(1, least(p_limit, 100))
     for update of s skip locked
  )
  update public.ml_customer_sync s
     set locked_until = now() + make_interval(secs => greatest(30, least(p_lock_seconds, 600))),
         status = case when p_kind = 'import' then 'running' else s.status end,
         attempts = case when p_kind = 'import' then s.attempts + 1 else s.attempts end
    from due
   where s.ml_account_id = due.ml_account_id
  returning s.*;
$$;

-- ---------------------------------------------------------------------------------------------- leitura

-- Números do topo da aba Clientes. security invoker: o RLS garante só a própria organização.
create or replace function public.customers_overview(p_organization_id uuid, p_ml_account_id uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'customers', count(*),
    'returning', count(*) filter (where c.purchases_count >= 2),
    'total_spent', coalesce(sum(c.total_spent), 0),
    'new_30d', count(*) filter (where c.first_order_at >= now() - interval '30 days')
  )
  from public.ml_customers c
  where c.organization_id = p_organization_id
    and (p_ml_account_id is null or c.ml_account_id = p_ml_account_id)
    and c.purchases_count > 0;
$$;

-- ---------------------------------------------------------------------------------------------- permissões

revoke execute on function public.ml_accounts_create_customer_sync() from public, anon, authenticated;
revoke execute on function public.ml_order_is_purchase(text) from public, anon, authenticated;
revoke execute on function public.ml_orders_payload(jsonb) from public, anon, authenticated;
revoke execute on function public.ingest_ml_orders(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.claim_customer_sync(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.customers_overview(uuid, uuid) from public, anon;
grant execute on function public.ingest_ml_orders(uuid, jsonb) to service_role;
grant execute on function public.claim_customer_sync(text, integer, integer) to service_role;
grant execute on function public.customers_overview(uuid, uuid) to authenticated, service_role;

alter table public.ml_customers enable row level security;
alter table public.ml_orders enable row level security;
alter table public.ml_customer_sync enable row level security;

revoke all on table public.ml_customers, public.ml_orders, public.ml_customer_sync from anon, authenticated;
grant select on table public.ml_customers, public.ml_orders, public.ml_customer_sync to authenticated;
grant all on table public.ml_customers, public.ml_orders, public.ml_customer_sync to service_role;

create policy "Membros veem os clientes da organização" on public.ml_customers
  for select to authenticated
  using (organization_id in (select public.current_user_organization_ids()));

create policy "Membros veem as vendas dos clientes da organização" on public.ml_orders
  for select to authenticated
  using (organization_id in (select public.current_user_organization_ids()));

create policy "Membros veem a sincronização de clientes da organização" on public.ml_customer_sync
  for select to authenticated
  using (organization_id in (select public.current_user_organization_ids()));
