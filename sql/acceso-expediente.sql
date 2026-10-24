-- Mundo Neurodiverso · Quién ve todo el historial de un paciente.
--
-- La psicóloga asignada ve todas las notas del paciente. Si otra lo cubre (tiene una cita con él), ve sus datos y
-- escribe y ve sus propias notas, pero no el historial, a menos que Dirección le dé acceso desde el expediente.
-- Antes, con tener una cita con el paciente ya veía todas sus notas.
--
-- Cómo correrlo: Supabase → SQL Editor → New query → pega todo este archivo → Run. Se puede correr varias veces.

create table if not exists public.accesos_expediente (
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  psicologa_id uuid not null references public.psicologas(id) on delete cascade,
  otorgado_por uuid references public.psicologas(id) default auth.uid(),
  creado_en timestamptz not null default now(),
  primary key (paciente_id, psicologa_id)
);
alter table public.accesos_expediente enable row level security;

drop policy if exists p_acc_select on public.accesos_expediente;
drop policy if exists p_acc_write on public.accesos_expediente;
create policy p_acc_select on public.accesos_expediente for select to authenticated using (es_direccion() or psicologa_id = auth.uid());
create policy p_acc_write on public.accesos_expediente for all to authenticated using (es_direccion()) with check (es_direccion());

revoke all on public.accesos_expediente from anon;
revoke truncate, trigger, references on public.accesos_expediente from authenticated;
grant select, insert, update, delete on public.accesos_expediente to authenticated, service_role;

-- Pacientes cuyo historial ve la usuaria (notas y sus comentarios): asignados a ella o con acceso de Dirección.
-- Sus propias notas las ve siempre (p_nota_select: psicologa_id = auth.uid()).
create or replace function public.mi_paciente(pid uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.pacientes p where p.id = pid and p.asignada_a = auth.uid())
      or exists (select 1 from public.accesos_expediente a where a.paciente_id = pid and a.psicologa_id = auth.uid());
$$;

do $$ begin
  alter publication supabase_realtime add table public.accesos_expediente;
exception when duplicate_object then null; end $$;

select 'listo: accesos_expediente y mi_paciente' as resultado;
