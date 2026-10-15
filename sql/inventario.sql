-- Mundo Neurodiverso · Inventario de la base. Solo lee: no cambia nada.
-- Muestra estructura, permisos, conteos y el resumen de psicólogas.
-- No muestra datos de pacientes, notas ni cobros.
-- Supabase → SQL Editor → New query → pega esto → Run. Da un solo resultado.

with tablas as (
  select c.oid, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
)
select '1 columna' as que, table_name::text as tabla,
       lpad(ordinal_position::text, 2, '0') || ' ' || column_name || ' ' || data_type
       || case when is_nullable = 'NO' then ' not null' else '' end
       || coalesce(' default ' || column_default, '') as detalle
  from information_schema.columns where table_schema = 'public'
union all
select '2 restricción', conrelid::regclass::text, conname || ': ' || pg_get_constraintdef(oid)
  from pg_constraint where connamespace = 'public'::regnamespace
union all
select '3 índice', tablename::text, indexdef from pg_indexes where schemaname = 'public'
union all
select '4 trigger', tgrelid::regclass::text, pg_get_triggerdef(oid)
  from pg_trigger where not tgisinternal and tgrelid in (select oid from tablas)
union all
select '5 permiso', table_name::text, grantee || ': ' || string_agg(privilege_type, ', ' order by privilege_type)
  from information_schema.role_table_grants
 where table_schema = 'public' and grantee in ('anon', 'authenticated')
 group by table_name, grantee
union all
select '6 tiempo real', tablename::text, pubname::text from pg_publication_tables where schemaname = 'public'
union all
select '7 extensión', extname::text, extversion from pg_extension
union all
select '8 filas', relname::text,
       (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', relname), false, true, '')))[1]::text
  from tablas
union all
select '9 psicóloga', s.nombre,
       'dirección: ' || coalesce(to_jsonb(s) ->> 'es_direccion', '?')
       || ' · atiende: ' || coalesce(to_jsonb(s) ->> 'atiende', '?')
       || ' · tiene cuenta: ' || case when exists (select 1 from auth.users u where u.id = s.id) then 'sí' else 'no' end
       || ' · pacientes activos asignados: '
       || (select count(*) from public.pacientes p where p.asignada_a = s.id and coalesce((to_jsonb(p) ->> 'activo')::boolean, true))
  from public.psicologas s
union all
select '9 pacientes sin psicóloga asignada', '', count(*)::text from public.pacientes where asignada_a is null
union all
select '9 cuentas sin perfil de psicóloga', '', count(*)::text
  from auth.users u where not exists (select 1 from public.psicologas s where s.id = u.id)
order by 1, 2, 3;
