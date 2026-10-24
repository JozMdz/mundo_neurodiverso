-- Mundo Neurodiverso · Cuánto le toca a cada psicóloga por sesión.
--
-- Lo que le toca depende de quién da la sesión, no del paciente: si una psicóloga cubre a otra (o a la directora),
-- se le paga lo suyo. Cada psicóloga tiene un monto fijo por sesión (ej. $150) o un porcentaje de lo que se cobra
-- (ej. 50 %). Si no tiene, el corte toma la mitad. Lo que da la directora es íntegro para Dirección.
-- Reemplaza a pacientes.pago_psicologa (sql/pago-psicologa.sql), que ya no se usa.
--
-- Va en su propia tabla para que cada psicóloga lea solo lo suyo (la tabla psicologas la leen todas).
-- Solo Dirección lo pone o lo cambia, desde Equipo en la app.
--
-- Cómo correrlo: Supabase → SQL Editor → New query → pega todo este archivo → Run. Se puede correr varias veces.

create table if not exists public.reparto_psicologas (
  psicologa_id uuid primary key references public.psicologas(id) on delete cascade,
  tipo text not null check (tipo in ('fijo', 'porcentaje')),
  valor numeric not null check (valor >= 0 and (tipo <> 'porcentaje' or valor <= 100)),
  actualizado_en timestamptz not null default now()
);
alter table public.reparto_psicologas enable row level security;

drop policy if exists p_rep_select on public.reparto_psicologas;
drop policy if exists p_rep_write on public.reparto_psicologas;
create policy p_rep_select on public.reparto_psicologas for select to authenticated using (es_direccion() or psicologa_id = auth.uid());
create policy p_rep_write on public.reparto_psicologas for all to authenticated using (es_direccion()) with check (es_direccion());

revoke all on public.reparto_psicologas from anon;
revoke truncate, trigger, references on public.reparto_psicologas from authenticated;
grant select, insert, update, delete on public.reparto_psicologas to authenticated, service_role;

-- Tiempo real: si Dirección lo cambia, la app se actualiza sola
do $$ begin
  alter publication supabase_realtime add table public.reparto_psicologas;
exception when duplicate_object then null; end $$;

select 'listo: reparto_psicologas' as resultado;
