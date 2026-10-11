-- Dados de cobrança do cliente do SaaS: CPF ou CNPJ + nome/razão social + endereço (1 por organização).
-- Spec: docs/superpowers/specs/2026-10-11-dados-cobranca-design.md
-- Aditiva: tabela nova, sem mexer nas tabelas existentes (nem nas da v1).
-- Regras:
--   * o CPF/CNPJ é ÚNICO na plataforma (um documento = uma conta);
--   * depois de gravado, o CPF/CNPJ (e o tipo) NÃO pode ser alterado — nem pelo service role. Correção só pelo
--     suporte, em SQL: begin; set local app.allow_billing_document_change = 'on'; update ...; commit;
--   * o navegador só LÊ, e só o dono/administrador da organização; toda escrita é feita pelo servidor.

-- Valida CPF (11 dígitos) e CNPJ (numérico ou alfanumérico: 12 posições A–Z/0–9 + 2 dígitos verificadores).
-- Módulo 11 com o valor de cada caractere = código ASCII − 48 (regra da Receita para o CNPJ alfanumérico).
create or replace function public.is_valid_tax_document(p_type text, p_document text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_sum integer;
  v_digit integer;
  v_weights_1 constant integer[] := array[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  v_weights_2 constant integer[] := array[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
begin
  if p_document is null then
    return false;
  end if;

  if p_type = 'cpf' then
    if p_document !~ '^[0-9]{11}$' or p_document = repeat(left(p_document, 1), 11) then
      return false;
    end if;
    v_sum := 0;
    for i in 1..9 loop
      v_sum := v_sum + (ascii(substr(p_document, i, 1)) - 48) * (11 - i);
    end loop;
    v_digit := case when v_sum % 11 < 2 then 0 else 11 - v_sum % 11 end;
    if v_digit <> ascii(substr(p_document, 10, 1)) - 48 then
      return false;
    end if;
    v_sum := 0;
    for i in 1..10 loop
      v_sum := v_sum + (ascii(substr(p_document, i, 1)) - 48) * (12 - i);
    end loop;
    v_digit := case when v_sum % 11 < 2 then 0 else 11 - v_sum % 11 end;
    return v_digit = ascii(substr(p_document, 11, 1)) - 48;
  end if;

  if p_type = 'cnpj' then
    if p_document !~ '^[0-9A-Z]{12}[0-9]{2}$' or p_document = repeat(left(p_document, 1), 14) then
      return false;
    end if;
    v_sum := 0;
    for i in 1..12 loop
      v_sum := v_sum + (ascii(substr(p_document, i, 1)) - 48) * v_weights_1[i];
    end loop;
    v_digit := case when v_sum % 11 < 2 then 0 else 11 - v_sum % 11 end;
    if v_digit <> ascii(substr(p_document, 13, 1)) - 48 then
      return false;
    end if;
    v_sum := 0;
    for i in 1..13 loop
      v_sum := v_sum + (ascii(substr(p_document, i, 1)) - 48) * v_weights_2[i];
    end loop;
    v_digit := case when v_sum % 11 < 2 then 0 else 11 - v_sum % 11 end;
    return v_digit = ascii(substr(p_document, 14, 1)) - 48;
  end if;

  return false;
end;
$$;

create table public.billing_profiles (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  document_type text not null check (document_type in ('cpf', 'cnpj')),
  document text not null,
  legal_name text not null check (char_length(legal_name) between 2 and 150),
  postal_code text not null check (postal_code ~ '^[0-9]{8}$'),
  street text not null check (char_length(street) between 2 and 150),
  address_number text not null check (char_length(address_number) between 1 and 20),
  complement text check (char_length(complement) <= 80),
  district text not null check (char_length(district) between 1 and 80),
  city text not null check (char_length(city) between 2 and 80),
  state text not null check (state in (
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
    'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
  )),
  registered_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_profiles_document_valid check (public.is_valid_tax_document(document_type, document)),
  constraint billing_profiles_document_key unique (document)
);

comment on table public.billing_profiles is
  'Dados de cobrança (CPF/CNPJ + endereço) de cada organização. Documento único e imutável depois de gravado.';

-- O CPF/CNPJ não muda depois de cadastrado (nem a organização dona da linha).
create or replace function public.protect_billing_document()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'BILLING_PROFILE_ORGANIZATION_LOCKED';
  end if;
  if (new.document is distinct from old.document or new.document_type is distinct from old.document_type)
     and coalesce(current_setting('app.allow_billing_document_change', true), '') <> 'on' then
    raise exception 'BILLING_DOCUMENT_LOCKED'
      using hint = 'O CPF/CNPJ não pode ser alterado depois de cadastrado.';
  end if;
  return new;
end;
$$;

create trigger billing_profiles_protect_document before update on public.billing_profiles
  for each row execute function public.protect_billing_document();
create trigger billing_profiles_set_updated_at before update on public.billing_profiles
  for each row execute function public.set_updated_at();

-- Organizações que o usuário logado administra (dono ou administrador). Conjunto avaliado uma vez por consulta.
create or replace function public.current_user_managed_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.organization_members m
  where m.user_id = (select auth.uid())
    and m.role in ('owner', 'admin');
$$;

revoke execute on function public.protect_billing_document() from public, anon, authenticated;
revoke execute on function public.is_valid_tax_document(text, text) from public, anon;
grant execute on function public.is_valid_tax_document(text, text) to authenticated, service_role;
revoke execute on function public.current_user_managed_organization_ids() from public, anon;
grant execute on function public.current_user_managed_organization_ids() to authenticated;

alter table public.billing_profiles enable row level security;

revoke all on table public.billing_profiles from anon, authenticated;
grant select on table public.billing_profiles to authenticated;
grant all on table public.billing_profiles to service_role;

-- Dado pessoal (LGPD): só quem administra a organização vê. Membros comuns não.
create policy "Dono e administradores veem os dados de cobrança" on public.billing_profiles
  for select to authenticated
  using (organization_id in (select public.current_user_managed_organization_ids()));
