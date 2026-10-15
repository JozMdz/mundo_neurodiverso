-- Mundo Neurodiverso · Estructura completa de la base en Supabase (sin datos).
--
-- Reconstruida el 15 oct 2026 con sql/inventario.sql y sql/revisar.sql; ya incluye sql/seguridad.sql,
-- sql/ajustes.sql y sql/citas-estado.sql. Sirve de referencia y para recrear la base en un proyecto nuevo de Supabase
-- (SQL Editor → pega todo → Run). Si cambias la base, actualiza este archivo para que siga siendo fiel.

begin;

-- ================= Tablas =================
create table public.psicologas (
  id uuid primary key references auth.users(id) on delete cascade,   -- la misma id de su cuenta
  nombre text not null,
  color text not null default '#8B3D9E',
  es_direccion boolean not null default false,
  telefono text,
  cedula text,
  creado_en timestamptz not null default now(),
  atiende boolean not null default true                              -- false: cuenta de soporte, no da consulta
);
create table public.pacientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  edad integer,
  tutor text,
  telefono text,
  motivo text,
  tarifa numeric not null default 0,
  asignada_a uuid references public.psicologas(id),
  creado_en timestamptz not null default now(),
  activo boolean not null default true                               -- false: archivado
);
create table public.citas (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  hora time not null,
  duracion integer not null default 60,
  psicologa_id uuid not null references public.psicologas(id),
  paciente_id uuid not null references public.pacientes(id),
  creado_en timestamptz not null default now(),
  estado text not null default 'programada' check (estado in ('programada', 'no_asistio', 'cancelada')),
  marcada_por uuid references public.psicologas(id),                -- quién marcó el estado y cuándo
  marcada_en timestamptz,
  confirmada_por uuid references public.psicologas(id)              -- Dirección que lo confirmó; null = por confirmar
);
create table public.notas (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes(id),
  psicologa_id uuid not null references public.psicologas(id),
  fecha date not null default current_date,
  hora time not null default (now())::time,
  texto text not null,
  revisada boolean not null default false,
  creado_en timestamptz not null default now(),
  vista_psic boolean not null default true                           -- false: mensaje nuevo para la psicóloga
);
create table public.comentarios (
  id uuid primary key default gen_random_uuid(),
  nota_id uuid not null references public.notas(id) on delete cascade,
  autor_id uuid not null references public.psicologas(id),
  texto text not null,
  editado boolean not null default false,
  creado_en timestamptz not null default now()
);
create table public.pagos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  hora time not null default (now())::time,
  paciente_id uuid not null references public.pacientes(id),
  psicologa_id uuid not null references public.psicologas(id),
  monto numeric not null,
  metodo text not null check (metodo in ('efectivo', 'transferencia', 'tarjeta')),
  validado boolean not null default false,
  creado_en timestamptz not null default now()
);
create table public.facturas (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes(id),
  monto numeric not null,
  estado text not null default 'solicitada' check (estado in ('solicitada', 'emitida', 'entregada')),
  solicitada_por uuid references public.psicologas(id),
  fecha_solicitada date not null default current_date,
  fecha_emitida date,
  fecha_entregada date,
  creado_en timestamptz not null default now()
);
create table public.cierres (
  id uuid primary key default gen_random_uuid(),
  psicologa_id uuid not null references public.psicologas(id),
  fecha date not null default current_date,
  hora time not null default (now())::time,
  notas_pendientes integer not null default 0,
  cobros_pendientes integer not null default 0,
  creado_en timestamptz not null default now()
);

-- ================= Índices =================
create index citas_fecha_idx          on public.citas (fecha);
create index citas_psicologa_idx      on public.citas (psicologa_id);
create index citas_paciente_idx       on public.citas (paciente_id);
create index notas_paciente_idx       on public.notas (paciente_id);
create index notas_psicologa_idx      on public.notas (psicologa_id);
create index comentarios_nota_idx     on public.comentarios (nota_id);
create index pagos_fecha_idx          on public.pagos (fecha);
create index pagos_psicologa_idx      on public.pagos (psicologa_id);
create index facturas_solicitada_idx  on public.facturas (solicitada_por);
create index pacientes_asignada_idx   on public.pacientes (asignada_a);

-- ================= Funciones =================
create function public.es_direccion() returns boolean
language sql stable security definer set search_path to 'public' as $$
  select coalesce((select es_direccion from public.psicologas where id = auth.uid()), false);
$$;

-- Pacientes de la usuaria: asignados a ella o con alguna cita con ella
create function public.mi_paciente(pid uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.pacientes p where p.id = pid and p.asignada_a = auth.uid())
      or exists (select 1 from public.citas c where c.paciente_id = pid and c.psicologa_id = auth.uid());
$$;

-- Nota escrita por Dirección: le aparece como mensaje nuevo a la psicóloga
create function public.marcar_nota_nueva() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if exists (select 1 from public.psicologas where id = new.psicologa_id and es_direccion) then
    new.vista_psic := false;
  end if;
  return new;
end; $$;

-- Comentario de Dirección: mensaje nuevo para la psicóloga. Comentario de la psicóloga: la nota vuelve a "por revisar".
create function public.marcar_nota_por_revisar() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if exists (select 1 from public.psicologas where id = new.autor_id and es_direccion) then
    update public.notas set vista_psic = false where id = new.nota_id;
  else
    update public.notas set revisada = false where id = new.nota_id;
  end if;
  return new;
end; $$;

-- Protecciones anteriores a sql/seguridad.sql: ignoran el cambio en silencio
create function public.proteger_revisada() returns trigger language plpgsql as $$
begin
  if new.revisada = true and old.revisada = false and not public.es_direccion() then
    new.revisada := old.revisada;
  end if;
  return new;
end; $$;
create function public.proteger_texto() returns trigger language plpgsql as $$
begin
  if new.texto is distinct from old.texto and old.psicologa_id <> auth.uid() and not public.es_direccion() then
    new.texto := old.texto;
  end if;
  return new;
end; $$;
create function public.proteger_validado() returns trigger language plpgsql as $$
begin
  if (new.validado is distinct from old.validado) and not public.es_direccion() then
    new.validado := old.validado;
  end if;
  return new;
end; $$;

-- De sql/seguridad.sql: rechazan el cambio con un mensaje. Solo limitan a las usuarias de la app.
create function public.proteger_notas() returns trigger
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

create function public.proteger_pagos() returns trigger
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

create function public.proteger_facturas() returns trigger
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

-- De sql/citas-estado.sql: la psicóloga solo marca si asistió a sus citas; Dirección confirma y cancela
create function public.proteger_citas() returns trigger
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

-- ================= Triggers =================
-- Los a0_ corren antes que los demás de su tabla (orden alfabético).
create trigger tr_comentario_revisar after insert on public.comentarios for each row execute function marcar_nota_por_revisar();
create trigger a0_proteger_notas before insert or delete or update on public.notas for each row execute function proteger_notas();
create trigger tr_nota_nueva before insert on public.notas for each row execute function marcar_nota_nueva();
create trigger tr_revisada before update on public.notas for each row execute function proteger_revisada();
create trigger tr_texto before update on public.notas for each row execute function proteger_texto();
create trigger a0_proteger_pagos before insert or delete or update on public.pagos for each row execute function proteger_pagos();
create trigger tr_validado before update on public.pagos for each row execute function proteger_validado();
create trigger a0_proteger_facturas before insert or delete or update on public.facturas for each row execute function proteger_facturas();
create trigger a0_proteger_citas before update on public.citas for each row execute function proteger_citas();

-- ================= Seguridad por renglón (RLS) =================
alter table public.psicologas  enable row level security;
alter table public.pacientes   enable row level security;
alter table public.citas       enable row level security;
alter table public.notas       enable row level security;
alter table public.comentarios enable row level security;
alter table public.pagos       enable row level security;
alter table public.facturas    enable row level security;
alter table public.cierres     enable row level security;

create policy p_psico_select on public.psicologas for select to authenticated using (true);
create policy p_psico_insert on public.psicologas for insert to authenticated with check (es_direccion());
create policy p_psico_update on public.psicologas for update to authenticated using (es_direccion()) with check (es_direccion());

create policy p_pac_select on public.pacientes for select to authenticated using (es_direccion() or asignada_a = auth.uid()
  or exists (select 1 from public.citas c where c.paciente_id = pacientes.id and c.psicologa_id = auth.uid())
  or exists (select 1 from public.notas n where n.paciente_id = pacientes.id and n.psicologa_id = auth.uid()));
create policy p_pac_insert on public.pacientes for insert to authenticated with check (es_direccion());
create policy p_pac_update on public.pacientes for update to authenticated using (es_direccion());

create policy p_cita_select on public.citas for select to authenticated using (es_direccion() or psicologa_id = auth.uid());
create policy p_cita_write on public.citas for all to authenticated using (es_direccion()) with check (es_direccion());
create policy p_cita_marcar on public.citas for update to authenticated using (psicologa_id = auth.uid()) with check (psicologa_id = auth.uid());

create policy p_nota_select on public.notas for select to authenticated using (es_direccion() or psicologa_id = auth.uid() or mi_paciente(paciente_id));
create policy p_nota_insert on public.notas for insert to authenticated with check (psicologa_id = auth.uid() or es_direccion());
create policy p_nota_update on public.notas for update to authenticated using (es_direccion() or psicologa_id = auth.uid() or mi_paciente(paciente_id));
create policy p_nota_delete on public.notas for delete to authenticated using (psicologa_id = auth.uid() or es_direccion());

create policy p_com_select on public.comentarios for select to authenticated using (exists (select 1 from public.notas n
  where n.id = comentarios.nota_id and (es_direccion() or n.psicologa_id = auth.uid() or mi_paciente(n.paciente_id))));
create policy p_com_insert on public.comentarios for insert to authenticated with check (autor_id = auth.uid());
create policy p_com_update on public.comentarios for update to authenticated using (autor_id = auth.uid());
create policy p_com_delete on public.comentarios for delete to authenticated using (autor_id = auth.uid());

create policy p_pago_select on public.pagos for select to authenticated using (es_direccion() or psicologa_id = auth.uid());
create policy p_pago_insert on public.pagos for insert to authenticated with check (psicologa_id = auth.uid() or es_direccion());
create policy p_pago_update on public.pagos for update to authenticated using (es_direccion() or psicologa_id = auth.uid());
create policy p_pago_delete on public.pagos for delete to authenticated using (es_direccion() or psicologa_id = auth.uid());

create policy p_fac_select on public.facturas for select to authenticated using (es_direccion() or solicitada_por = auth.uid());
create policy p_fac_insert on public.facturas for insert to authenticated with check (solicitada_por = auth.uid() or es_direccion());
create policy p_fac_update on public.facturas for update to authenticated using (es_direccion() or solicitada_por = auth.uid());
create policy p_fac_delete on public.facturas for delete to authenticated using (es_direccion() or solicitada_por = auth.uid());

create policy p_cie_select on public.cierres for select to authenticated using (es_direccion());
create policy p_cie_insert on public.cierres for insert to authenticated with check (psicologa_id = auth.uid());

-- ================= Permisos =================
-- Sin sesión no se puede nada; con sesión, lo que dejen las políticas.
revoke all on all tables in schema public from anon;
revoke truncate, trigger, references on all tables in schema public from authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ================= Tiempo real =================
alter publication supabase_realtime add table public.psicologas, public.pacientes, public.citas, public.notas,
  public.comentarios, public.pagos, public.facturas, public.cierres;

commit;
