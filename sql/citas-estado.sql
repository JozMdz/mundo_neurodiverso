-- Mundo Neurodiverso · Estado de las citas: no asistió y cancelada.
--
-- Una cita que ya pasó cuenta como atendida (pide nota y cobro). La psicóloga puede marcar "no asistió"
-- en sus propias citas; queda por confirmar hasta que Dirección lo corrobore. Dirección también cancela
-- citas, y lo que marca queda confirmado. Se guarda quién marcó, cuándo y quién confirmó.
--
-- Cómo correrlo: Supabase → SQL Editor → New query → pega todo este archivo → Run.
-- Se puede correr varias veces. Va en una transacción: si algo falla, no se aplica nada.

begin;

alter table public.citas add column if not exists estado text not null default 'programada';
alter table public.citas add column if not exists marcada_por uuid references public.psicologas(id);
alter table public.citas add column if not exists marcada_en timestamptz;
alter table public.citas add column if not exists confirmada_por uuid references public.psicologas(id);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'citas_estado_check') then
    alter table public.citas add constraint citas_estado_check check (estado in ('programada', 'no_asistio', 'cancelada'));
  end if;
end $$;

-- La psicóloga puede tocar sus citas solo para marcar si asistió; el trigger limita qué puede cambiar
drop policy if exists p_cita_marcar on public.citas;
create policy p_cita_marcar on public.citas for update to authenticated
  using (psicologa_id = auth.uid()) with check (psicologa_id = auth.uid());

create or replace function public.proteger_citas() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.estado is distinct from old.estado then
    new.marcada_por := auth.uid();
    new.marcada_en := now();
    -- Lo que marca Dirección queda confirmado; lo que marca una psicóloga espera a Dirección
    new.confirmada_por := case when es_direccion() and new.estado <> 'programada' then auth.uid() end;
  elsif new.confirmada_por is distinct from old.confirmada_por then
    if not es_direccion() then
      raise exception 'Solo Dirección confirma inasistencias.';
    end if;
    new.confirmada_por := case when new.confirmada_por is not null then auth.uid() end;
  end if;
  if es_direccion() then
    return new;
  end if;
  if old.confirmada_por is not null then
    raise exception 'Dirección ya confirmó esta cita: pídele el cambio.';
  end if;
  if new.estado not in ('programada', 'no_asistio') then
    raise exception 'Solo Dirección cancela citas.';
  end if;
  -- Una cita de otro día que aún no llega no se puede marcar (hora de la Ciudad de México)
  if new.estado = 'no_asistio' and old.estado <> 'no_asistio'
     and old.fecha > (now() at time zone 'America/Mexico_City')::date then
    raise exception 'Esa cita todavía no llega: márcala el día de la cita.';
  end if;
  if (to_jsonb(new) - 'estado' - 'marcada_por' - 'marcada_en' - 'confirmada_por')
     is distinct from (to_jsonb(old) - 'estado' - 'marcada_por' - 'marcada_en' - 'confirmada_por') then
    raise exception 'De una cita solo puedes marcar si asistió.';
  end if;
  return new;
end $$;
drop trigger if exists a0_proteger_citas on public.citas;
create trigger a0_proteger_citas before update on public.citas
  for each row execute function public.proteger_citas();

commit;
