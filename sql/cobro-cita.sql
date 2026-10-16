-- Mundo Neurodiverso · El cobro va ligado a la cita, y todo se valida (también lo de la directora).
--
-- pagos.cita_id: el cobro de una sesión apunta a su cita (uno por cita). La psicóloga solo puede ligar cobros a sus
-- propias citas. Marcar "no asistió" ya no queda confirmado solo, aunque lo marque Dirección: la directora valida
-- todo al final del día (cobros con validado y no asistió con confirmada_por).
--
-- Cómo correrlo: Supabase → SQL Editor → New query → pega todo este archivo → Run. Se puede correr varias veces.

begin;

alter table public.pagos add column if not exists cita_id uuid references public.citas(id) on delete set null;
create unique index if not exists pagos_cita_unica on public.pagos (cita_id) where cita_id is not null;

create or replace function public.proteger_pagos() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user not in ('authenticated', 'anon') or es_direccion() then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    new.validado := false;
    if new.cita_id is not null and not exists (select 1 from citas where id = new.cita_id and psicologa_id = auth.uid()) then
      raise exception 'Solo puedes registrar el cobro de tus propias citas.';
    end if;
    return new;
  end if;
  if old.validado then
    raise exception 'Este cobro ya fue validado por Dirección: no se puede cambiar ni eliminar.';
  end if;
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'paciente_id' - 'monto' - 'metodo') is distinct from (to_jsonb(old) - 'paciente_id' - 'monto' - 'metodo') then
    raise exception 'De tus cobros solo puedes cambiar paciente, monto y método.';
  end if;
  return coalesce(new, old);
end $$;

-- Igual que en sql/citas-estado.sql, pero lo que marca Dirección también queda por confirmar
create or replace function public.proteger_citas() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.estado is distinct from old.estado then
    new.marcada_por := auth.uid();
    new.marcada_en := now();
    new.confirmada_por := null;
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

commit;
