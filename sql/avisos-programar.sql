-- Mundo Neurodiverso · Corre la función "avisar" cada 5 minutos.
--
-- Córrelo DESPUÉS de crear la función "avisar" en Edge Functions y guardar sus Secrets.
-- De 7:00 a 23:55 hora de México (13:00 a 05:55 UTC); la función decide qué toca según el horario.
-- La llave que lleva es la "anon" pública (la misma de index.html), no la service_role.
--
-- Cómo correrlo: Supabase → SQL Editor → New query → pega todo este archivo → Run. Se puede correr varias veces.
-- Para apagar los avisos: select cron.unschedule('avisar');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('avisar') where exists (select 1 from cron.job where jobname = 'avisar');
select cron.schedule('avisar', '*/5 13-23,0-5 * * *', $$
  select net.http_post(
    url := 'https://vovniymxjkqvfqqblyeu.supabase.co/functions/v1/avisar',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZvdm5peW14amtxdmZxcWJseWV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4MTE0MjQsImV4cCI6MjEwMTM4NzQyNH0.PxKj8-rFBbMUdFBuR43s8ycKLhAwkIN7SDLWXa3u8T0"}'::jsonb,
    body := '{}'::jsonb
  );
$$);
