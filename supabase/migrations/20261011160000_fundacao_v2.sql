-- Fundação da v2 (sub-projeto 1): organizações (clientes do SaaS), membros, perfis e contas do Mercado Livre.
-- Spec: docs/superpowers/specs/2026-10-11-fundacao-design.md
-- Não altera as tabelas da v1 (question_jobs, ml_credentials, knowledge_base, training_examples).
-- Segurança: o navegador (anon/authenticated) só LÊ as próprias linhas; toda escrita é feita pelo servidor
-- com service role, depois de validar sessão e permissão. Tokens do ML ficam criptografados e sem acesso externo.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Minha loja' check (char_length(name) between 1 and 120),
  trial_ends_at timestamptz not null default (now() + interval '7 days'),
  subscription_status text not null default 'trialing'
    check (subscription_status in ('trialing', 'active', 'past_due', 'canceled')),
  plan text,
  current_period_end timestamptz,
  billing_exempt boolean not null default false,
  ml_accounts_limit integer not null default 1 check (ml_accounts_limit >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index organization_members_user_id_idx on public.organization_members (user_id);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  whatsapp text check (whatsapp ~ '^[1-9][0-9]{9,10}$'),
  terms_accepted_at timestamptz,
  terms_version text check (char_length(terms_version) <= 20),
  onboarding_completed_at timestamptz,
  tour_completed_at timestamptz,
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ml_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  ml_user_id bigint not null unique,
  nickname text,
  site_id text,
  status text not null default 'active' check (status in ('active', 'inactive', 'disconnected')),
  token_status text not null default 'valid' check (token_status in ('valid', 'invalid')),
  connected_by uuid references auth.users (id) on delete set null,
  last_refresh_error text,
  last_refresh_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ml_accounts_organization_id_idx on public.ml_accounts (organization_id);

create table public.ml_account_tokens (
  ml_account_id uuid primary key references public.ml_accounts (id) on delete cascade,
  access_token_enc text not null,
  refresh_token_enc text not null,
  expires_at timestamptz not null,
  refresh_lease_until timestamptz,
  updated_at timestamptz not null default now()
);

create trigger organizations_set_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger ml_accounts_set_updated_at before update on public.ml_accounts
  for each row execute function public.set_updated_at();
create trigger ml_account_tokens_set_updated_at before update on public.ml_account_tokens
  for each row execute function public.set_updated_at();

-- Cada novo usuário do Auth ganha perfil, organização própria (teste de 7 dias) e papel de dono.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_terms_version text := left(nullif(trim(new.raw_user_meta_data ->> 'terms_version'), ''), 20);
begin
  insert into public.profiles (id, full_name, terms_accepted_at, terms_version)
  values (
    new.id,
    left(coalesce(trim(new.raw_user_meta_data ->> 'full_name'), ''), 120),
    case when v_terms_version is not null then now() end,
    v_terms_version
  );

  insert into public.organizations default values returning id into v_org_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org_id, new.id, 'owner');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Impede passar do limite de contas ML ativas da organização (definido pelo plano).
create or replace function public.enforce_ml_accounts_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_active integer;
begin
  if new.status <> 'active' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'active' and old.organization_id = new.organization_id then
    return new;
  end if;

  select o.ml_accounts_limit into v_limit
  from public.organizations o
  where o.id = new.organization_id
  for update;

  select count(*) into v_active
  from public.ml_accounts a
  where a.organization_id = new.organization_id
    and a.status = 'active'
    and a.id <> new.id;

  if v_active >= v_limit then
    raise exception 'ML_ACCOUNTS_LIMIT_REACHED'
      using hint = 'Limite de contas do Mercado Livre do plano atingido.';
  end if;

  return new;
end;
$$;

create trigger ml_accounts_enforce_limit
  before insert or update of status, organization_id on public.ml_accounts
  for each row execute function public.enforce_ml_accounts_limit();

-- Usada nas policies: o usuário logado é membro da organização?
create or replace function public.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
  );
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.enforce_ml_accounts_limit() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.is_org_member(uuid) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.profiles enable row level security;
alter table public.ml_accounts enable row level security;
alter table public.ml_account_tokens enable row level security;

revoke all on table
  public.organizations,
  public.organization_members,
  public.profiles,
  public.ml_accounts,
  public.ml_account_tokens
from anon, authenticated;

grant select on table
  public.organizations,
  public.organization_members,
  public.profiles,
  public.ml_accounts
to authenticated;

grant all on table
  public.organizations,
  public.organization_members,
  public.profiles,
  public.ml_accounts,
  public.ml_account_tokens
to service_role;

create policy "Membros veem a própria organização" on public.organizations
  for select to authenticated
  using ((select public.is_org_member(id)));

create policy "Membros veem os membros da organização" on public.organization_members
  for select to authenticated
  using ((select public.is_org_member(organization_id)));

create policy "Usuário vê o próprio perfil" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy "Membros veem as contas ML da organização" on public.ml_accounts
  for select to authenticated
  using ((select public.is_org_member(organization_id)));

-- ml_account_tokens: RLS ligada e nenhuma policy → só o service role acessa.
