-- Mundo Neurodiverso · Reglas que la base de datos hace cumplir por sí misma.
--
-- La app ya oculta estos botones, pero cualquiera con sesión puede saltarse la pantalla desde
-- el navegador. Con esto, Supabase rechaza el cambio aunque llegue directo.
--
-- Cómo correrlo: Supabase → SQL Editor → New query → pega todo este archivo → Run.
-- Se puede correr varias veces. Va en una transacción: si algo falla, no se aplica nada.
-- Solo limita a las usuarias de la app (rol authenticated). Desde el SQL Editor o el
-- Table Editor de Supabase se puede seguir corrigiendo cualquier dato.

begin;

-- Estas reglas usan es_direccion(), la misma función de tus políticas. Si no existe, se detiene aquí.
select 'public.es_direccion()'::regprocedure;

-- 1) Roles: solo Dirección edita la tabla de psicólogas, incluido quién es Dirección.
drop policy if exists p_psico_update on public.psicologas;
create policy p_psico_update on public.psicologas
  for update to authenticated
  using (es_direccion())
  with check (es_direccion());

-- Los triggers empiezan con a0_ para correr antes que cualquier otro trigger de la tabla.

-- 2) Notas: la revisión, la autoría, el paciente y la fecha solo los cambia Dirección.
--    Cada psicóloga edita únicamente el texto de sus notas; si cambia una nota ya revisada,
--    vuelve a "por revisar". No se borra una nota con comentarios de otra persona.
create or replace function public.proteger_notas() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user not in ('authenticated', 'anon') or es_direccion() then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    new.revisada := false;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if exists (select 1 from comentarios c where c.nota_id = old.id and c.autor_id is distinct from auth.uid()) then
      raise exception 'Esta nota tiene comentarios de otra persona: no se puede eliminar.';
    end if;
    return old;
  end if;
  if (to_jsonb(new) - 'texto' - 'vista_psic') is distinct from (to_jsonb(old) - 'texto' - 'vista_psic') then
    raise exception 'Solo Dirección puede cambiar eso de una nota.';
  end if;
  if new.texto is distinct from old.texto then
    if old.psicologa_id is distinct from auth.uid() then
      raise exception 'Solo puedes editar tus propias notas.';
    end if;
    new.revisada := false;
  end if;
  return new;
end $$;
drop trigger if exists a0_proteger_notas on public.notas;
create trigger a0_proteger_notas before insert or update or delete on public.notas
  for each row execute function public.proteger_notas();

-- 3) Cobros: solo Dirección valida. Un cobro validado ya no se cambia ni se borra;
--    de uno sin validar, la psicóloga solo cambia paciente, monto y método.
create or replace function public.proteger_pagos() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user not in ('authenticated', 'anon') or es_direccion() then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    new.validado := false;
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
drop trigger if exists a0_proteger_pagos on public.pagos;
create trigger a0_proteger_pagos before insert or update or delete on public.pagos
  for each row execute function public.proteger_pagos();

-- 4) Facturas: el estado (emitida, entregada) y sus fechas solo los cambia Dirección.
--    Mientras sigue "solicitada", quien la pidió puede corregir paciente y monto, o borrarla.
create or replace function public.proteger_facturas() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user not in ('authenticated', 'anon') or es_direccion() then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    new.estado := 'solicitada';
    new.fecha_emitida := null;
    new.fecha_entregada := null;
    return new;
  end if;
  if old.estado is distinct from 'solicitada' then
    raise exception 'Dirección ya emitió esta factura: pide el cambio a Dirección.';
  end if;
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'paciente_id' - 'monto') is distinct from (to_jsonb(old) - 'paciente_id' - 'monto') then
    raise exception 'Solo Dirección cambia el estado de una factura.';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists a0_proteger_facturas on public.facturas;
create trigger a0_proteger_facturas before insert or update or delete on public.facturas
  for each row execute function public.proteger_facturas();

commit;
