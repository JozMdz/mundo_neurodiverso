-- Mundo Neurodiverso · Cierres con el detalle de qué quedó pendiente y la revisión de Dirección.
--
-- Cuando una psicóloga sale con notas o cobros sin registrar, el cierre guarda qué citas fueron (detalle:
-- [{cita, pac, nota, cobro}]). Dirección lo comprueba y lo marca como revisado; ya no aparece en la lista.
-- Dirección solo puede marcar la revisión: no puede cambiar lo que dejó la psicóloga.
--
-- Cómo correrlo: Supabase → SQL Editor → New query → pega todo este archivo → Run. Se puede correr varias veces.

begin;

alter table public.cierres add column if not exists detalle jsonb not null default '[]'::jsonb;
alter table public.cierres add column if not exists revisado_por uuid references public.psicologas(id);
alter table public.cierres add column if not exists revisado_en timestamptz;

drop policy if exists p_cie_update on public.cierres;
create policy p_cie_update on public.cierres for update to authenticated using (es_direccion()) with check (es_direccion());

create or replace function public.proteger_cierres() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.revisado_por := null;
    new.revisado_en := null;
    return new;
  end if;
  if (to_jsonb(new) - 'revisado_por' - 'revisado_en') is distinct from (to_jsonb(old) - 'revisado_por' - 'revisado_en') then
    raise exception 'De un cierre solo se marca si ya se revisó.';
  end if;
  new.revisado_por := case when new.revisado_por is not null then auth.uid() end;
  new.revisado_en := case when new.revisado_por is not null then now() end;
  return new;
end $$;
drop trigger if exists a0_proteger_cierres on public.cierres;
create trigger a0_proteger_cierres before insert or update on public.cierres
  for each row execute function public.proteger_cierres();

commit;
