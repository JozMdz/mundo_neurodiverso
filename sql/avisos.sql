-- Mundo Neurodiverso · Avisos al teléfono (notificaciones push).
--
-- push_subs: los teléfonos que activaron avisos y de quién son. avisos_enviados: qué aviso ya se mandó, para no
-- repetirlo. Nadie las lee desde la app: solo la función "avisar" (con service_role) y estas dos funciones, que
-- registran o quitan el teléfono de quien tiene la sesión. Un teléfono es de la última cuenta que lo registró.
--
-- Cómo correrlo: Supabase → SQL Editor → New query → pega todo este archivo → Run. Se puede correr varias veces.

begin;

create table if not exists public.push_subs (
  endpoint text primary key,
  psicologa_id uuid not null references public.psicologas(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  creado_en timestamptz not null default now()
);
create table if not exists public.avisos_enviados (
  clave text primary key,
  enviado_en timestamptz not null default now()
);
alter table public.push_subs enable row level security;
alter table public.avisos_enviados enable row level security;
revoke all on public.push_subs, public.avisos_enviados from anon, authenticated;

-- Solo servicios de avisos conocidos (Apple, Google, Mozilla, Microsoft)
create or replace function public.guardar_suscripcion(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from psicologas where id = auth.uid()) then
    raise exception 'Necesitas iniciar sesión.';
  end if;
  if p_endpoint !~ '^https://(fcm\.googleapis\.com|web\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com)/'
     or length(p_endpoint) > 1000 or length(p_p256dh) > 200 or length(p_auth) > 100 then
    raise exception 'Este teléfono no tiene un servicio de avisos conocido.';
  end if;
  insert into push_subs (endpoint, psicologa_id, p256dh, auth) values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set psicologa_id = excluded.psicologa_id, p256dh = excluded.p256dh,
    auth = excluded.auth, creado_en = now();
end $$;

create or replace function public.borrar_suscripcion(p_endpoint text) returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from push_subs where endpoint = p_endpoint and psicologa_id = auth.uid();
$$;

revoke execute on function public.guardar_suscripcion(text, text, text), public.borrar_suscripcion(text) from public, anon;
grant execute on function public.guardar_suscripcion(text, text, text), public.borrar_suscripcion(text) to authenticated;

commit;
