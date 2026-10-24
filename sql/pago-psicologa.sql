-- Mundo Neurodiverso · Cuánto le toca a la psicóloga por cada sesión de un paciente.
--
-- YA NO SE USA: lo que le toca ahora va por psicóloga, sea de quien sea el paciente (sql/reparto.sql).
-- La columna se queda para no perder lo que ya estaba capturado.
--
-- Lo captura Dirección al dar de alta o editar al paciente, junto con lo que se le cobra (tarifa).
-- El corte de Cobros lo usa para calcular cuánto se le paga a cada psicóloga. Si se deja vacío,
-- el corte usa la mitad de la tarifa. Solo Dirección puede crear o editar pacientes (p_pac_insert, p_pac_update).
--
-- Cómo correrlo: Supabase → SQL Editor → New query → pega todo este archivo → Run. Se puede correr varias veces.

alter table public.pacientes add column if not exists pago_psicologa numeric check (pago_psicologa >= 0);
