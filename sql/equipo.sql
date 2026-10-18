-- Equipo y pacientes: psicólogas dadas de baja y fecha de nacimiento.
-- Se corre una vez en Supabase → SQL Editor. No borra ni cambia datos existentes.

-- Psicóloga dada de baja desde la app (función "equipo"): no puede entrar y deja de aparecer para agendar.
-- Sus pacientes, notas y cobros se quedan.
alter table public.psicologas add column if not exists activa boolean not null default true;

-- Fecha de nacimiento del paciente: la edad se calcula sola. "edad" se queda para los que no la tengan.
alter table public.pacientes add column if not exists fecha_nacimiento date
  check (fecha_nacimiento is null or (fecha_nacimiento > date '1900-01-01'));

select 'listo: psicologas.activa y pacientes.fecha_nacimiento' as resultado;
