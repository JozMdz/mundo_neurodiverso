-- Mundo Neurodiverso · Permisos de la cuenta del servidor (service_role) para la función "avisar".
--
-- La función lee la agenda con la llave de servidor, que vive solo en Supabase. Esa cuenta se salta las políticas
-- de seguridad, pero igual necesita permiso sobre las tablas; sin esto la función responde "permission denied".
-- La app nunca usa esta cuenta.
--
-- Cómo correrlo: Supabase → SQL Editor → New query → pega todo este archivo → Run. Se puede correr varias veces.

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
