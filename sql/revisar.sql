-- Mundo Neurodiverso · Revisión de seguridad. Solo lee la configuración, no datos de pacientes.
-- Supabase → SQL Editor → New query → pega esto → Run. Da un solo resultado.

select 'rls activado' as que, c.relname as donde, c.relrowsecurity::text as detalle
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
union all
select 'trigger', c.relname, t.tgname
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and not t.tgisinternal
union all
select 'política', tablename || ' ' || cmd, policyname || ': ' || coalesce(qual, '') || ' | ' || coalesce(with_check, '')
  from pg_policies where schemaname = 'public'
union all
select 'función', p.proname, pg_get_functiondef(p.oid)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prokind = 'f'
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
order by 1, 2;
