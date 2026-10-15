-- Mundo Neurodiverso · Ajustes a la base después de revisar inventario.sql (15 oct 2026).
--
-- Cómo correrlo: Supabase → SQL Editor → New query → pega todo este archivo → Run.
-- Se puede correr varias veces. Va en una transacción: si algo falla, no se aplica nada.
-- No toca datos.

begin;

-- 1) Tiempo real en todas las tablas que escucha la app. Antes solo avisaban cierres, pacientes y
--    psicólogas: una cita, nota, comentario, cobro o factura nueva no aparecía hasta recargar.
--    Supabase solo manda a cada usuaria los cambios que sus políticas le dejan ver.
do $$
declare t text;
begin
  foreach t in array array['citas', 'notas', 'comentarios', 'pagos', 'facturas', 'cierres', 'pacientes', 'psicologas'] loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- 2) Índices para lo que más se busca: por fecha, por psicóloga y por paciente (también lo usan los permisos).
create index if not exists citas_fecha_idx          on public.citas (fecha);
create index if not exists citas_psicologa_idx      on public.citas (psicologa_id);
create index if not exists citas_paciente_idx       on public.citas (paciente_id);
create index if not exists notas_paciente_idx       on public.notas (paciente_id);
create index if not exists notas_psicologa_idx      on public.notas (psicologa_id);
create index if not exists comentarios_nota_idx     on public.comentarios (nota_id);
create index if not exists pagos_fecha_idx          on public.pagos (fecha);
create index if not exists pagos_psicologa_idx      on public.pagos (psicologa_id);
create index if not exists facturas_solicitada_idx  on public.facturas (solicitada_por);
create index if not exists pacientes_asignada_idx   on public.pacientes (asignada_a);

-- 3) Permisos que la app no usa: vaciar tablas (TRUNCATE ignora las políticas), crear triggers o referencias.
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

commit;
