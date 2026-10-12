-- =====================================================================
-- 0009 — Sem verificação: 10 ações por dia (curtir + passar)
-- Verificado grátis 50, Premium 250 (Premium já exige verificação).
-- =====================================================================
insert into public.app_config (key, value, description) values
  ('actions_per_day_unverified', '10', 'Ações por dia sem verificação (curtir + passar)')
on conflict (key) do update set value = excluded.value, description = excluded.description;

create or replace function public.actions_limit(p_user uuid) returns integer
language sql stable security definer set search_path = public as $$
  select case
    when not coalesce((select verified from public.profiles where id = p_user), false)
      then coalesce((public.setting('actions_per_day_unverified'))::int, 10)
    when public.is_premium(p_user)
      then coalesce((public.setting('actions_per_day_premium'))::int, 250)
    else coalesce((public.setting('actions_per_day'))::int, 50)
  end
$$;

revoke all on function public.actions_limit(uuid) from public, anon, authenticated;
