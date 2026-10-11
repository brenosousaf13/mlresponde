-- Meli Fácil · Inventário do schema do banco (SOMENTE LEITURA)
-- Uso: colar no SQL Editor do Supabase e rodar. Não altera nada: só consulta o catálogo do Postgres.
-- Devolve 1 linha / 1 coluna (schema_inventory) com um JSON. Não inclui dados de clientes.
-- Strings com cara de segredo (JWT, sb_secret_, sk-, tokens do ML) são mascaradas no resultado.

with
tbls as (
  select c.oid, c.relname as name, c.relkind,
         c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced,
         obj_description(c.oid, 'pg_class') as comment
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'v', 'm', 'f')
    and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
),
cols as (
  select a.attrelid as oid,
         json_agg(json_build_object(
           'name', a.attname,
           'type', format_type(a.atttypid, a.atttypmod),
           'not_null', a.attnotnull,
           'default', pg_get_expr(ad.adbin, ad.adrelid),
           'identity', nullif(a.attidentity::text, ''),
           'generated', nullif(a.attgenerated::text, '')
         ) order by a.attnum) as columns
  from pg_attribute a
  left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
  where a.attnum > 0 and not a.attisdropped and a.attrelid in (select oid from tbls)
  group by a.attrelid
),
cons as (
  select co.conrelid as oid,
         json_agg(json_build_object('name', co.conname, 'type', co.contype, 'def', pg_get_constraintdef(co.oid))
                  order by co.conname) as constraints
  from pg_constraint co
  where co.conrelid in (select oid from tbls)
  group by co.conrelid
),
idx as (
  select i.indrelid as oid,
         json_agg(pg_get_indexdef(i.indexrelid) order by pg_get_indexdef(i.indexrelid)) as indexes
  from pg_index i
  where i.indrelid in (select oid from tbls)
  group by i.indrelid
),
trg as (
  select t.tgrelid as oid,
         json_agg(pg_get_triggerdef(t.oid) order by t.tgname) as triggers
  from pg_trigger t
  where not t.tgisinternal and t.tgrelid in (select oid from tbls)
  group by t.tgrelid
),
pol as (
  select p.tablename,
         json_agg(json_build_object(
           'name', p.policyname, 'cmd', p.cmd, 'roles', p.roles,
           'permissive', p.permissive, 'using', p.qual, 'with_check', p.with_check
         ) order by p.policyname) as policies
  from pg_policies p
  where p.schemaname = 'public'
  group by p.tablename
),
tables_json as (
  select json_agg(json_build_object(
    'name', t.name,
    'kind', t.relkind,
    'comment', t.comment,
    'rls_enabled', t.rls_enabled,
    'rls_forced', t.rls_forced,
    'approx_rows', s.n_live_tup,
    'total_size', pg_size_pretty(pg_total_relation_size(t.oid)),
    'columns', c.columns,
    'constraints', k.constraints,
    'indexes', i.indexes,
    'triggers', tr.triggers,
    'policies', p.policies,
    'privileges', json_build_object(
      'anon', json_build_object(
        'select', has_table_privilege('anon', t.oid, 'SELECT'),
        'insert', has_table_privilege('anon', t.oid, 'INSERT'),
        'update', has_table_privilege('anon', t.oid, 'UPDATE'),
        'delete', has_table_privilege('anon', t.oid, 'DELETE')),
      'authenticated', json_build_object(
        'select', has_table_privilege('authenticated', t.oid, 'SELECT'),
        'insert', has_table_privilege('authenticated', t.oid, 'INSERT'),
        'update', has_table_privilege('authenticated', t.oid, 'UPDATE'),
        'delete', has_table_privilege('authenticated', t.oid, 'DELETE'))
    ),
    'view_definition', case when t.relkind in ('v', 'm') then pg_get_viewdef(t.oid) end
  ) order by t.name) as v
  from tbls t
  left join cols c on c.oid = t.oid
  left join cons k on k.oid = t.oid
  left join idx i on i.oid = t.oid
  left join trg tr on tr.oid = t.oid
  left join pol p on p.tablename = t.name
  left join pg_stat_user_tables s on s.relid = t.oid
),
funcs_json as (
  select json_agg(json_build_object(
    'name', p.proname,
    'kind', p.prokind,
    'args', pg_get_function_identity_arguments(p.oid),
    'returns', pg_get_function_result(p.oid),
    'language', l.lanname,
    'security_definer', p.prosecdef,
    'definition', case when p.prokind in ('f', 'p') then pg_get_functiondef(p.oid) end
  ) order by p.proname) as v
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang
  where n.nspname = 'public'
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
),
enums_json as (
  select json_agg(json_build_object(
    'name', ty.typname,
    'values', (select json_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid = ty.oid)
  ) order by ty.typname) as v
  from pg_type ty
  join pg_namespace n on n.oid = ty.typnamespace
  where n.nspname = 'public' and ty.typtype = 'e'
),
auth_triggers_json as (
  select json_agg(pg_get_triggerdef(t.oid) order by t.tgname) as v
  from pg_trigger t
  where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal
),
realtime_json as (
  select json_agg(pt.schemaname || '.' || pt.tablename order by pt.schemaname, pt.tablename) as v
  from pg_publication_tables pt
  where pt.pubname = 'supabase_realtime'
),
extensions_json as (
  select json_agg(json_build_object('name', x.extname, 'version', x.extversion, 'schema', x.extnamespace::regnamespace::text)
                  order by x.extname) as v
  from pg_extension x
),
schemas_json as (
  select json_agg(ns.nspname order by ns.nspname) as v
  from pg_namespace ns
  where ns.nspname not like 'pg\_%' and ns.nspname <> 'information_schema'
),
auth_users_json as (
  select json_build_object(
    'total', count(*),
    'email_confirmed', count(u.email_confirmed_at),
    'first_created', min(u.created_at),
    'last_created', max(u.created_at),
    'last_sign_in', max(u.last_sign_in_at),
    'providers', (select json_agg(distinct idt.provider) from auth.identities idt)
  ) as v
  from auth.users u
),
buckets_json as (
  select json_agg(json_build_object(
    'name', b.name,
    'public', b.public,
    'objects', (select count(*) from storage.objects o where o.bucket_id = b.id)
  ) order by b.name) as v
  from storage.buckets b
)
select regexp_replace(regexp_replace(regexp_replace(regexp_replace(
  json_build_object(
    'generated_at', now(),
    'postgres_version', version(),
    'schemas', (select v from schemas_json),
    'extensions', (select v from extensions_json),
    'tables', (select v from tables_json),
    'functions', (select v from funcs_json),
    'enums', (select v from enums_json),
    'auth_users_triggers', (select v from auth_triggers_json),
    'realtime_publication', (select v from realtime_json),
    'auth_users', (select v from auth_users_json),
    'storage_buckets', (select v from buckets_json)
  )::text,
  'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}', '[REDACTED_JWT]', 'g'),
  'sb_secret_[A-Za-z0-9_-]+', '[REDACTED_SB_SECRET]', 'g'),
  'sk-[A-Za-z0-9_-]{20,}', '[REDACTED_API_KEY]', 'g'),
  '(APP_USR|TG)-[A-Za-z0-9-]{20,}', '[REDACTED_ML_TOKEN]', 'g') as schema_inventory;
