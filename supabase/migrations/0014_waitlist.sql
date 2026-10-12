-- =====================================================================
-- 0014 — Lista de espera do site (conmatch.com.br)
-- O site chama join_waitlist() com a chave pública (anon). Ninguém lê a
-- tabela pelo app; o suporte vê os totais por cidade no painel.
-- =====================================================================

create table public.waitlist (
  id          bigint generated always as identity primary key,
  email       text not null check (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' and char_length(email) <= 254),
  state       char(2) not null check (state ~ '^[A-Z]{2}$'),
  city        text not null check (char_length(city) between 2 and 80),
  gender      public.gender,
  consent_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  invited_at  timestamptz
);
create unique index waitlist_email_idx on public.waitlist (lower(email));
create index waitlist_city_idx on public.waitlist (state, city);
alter table public.waitlist enable row level security;
-- sem grants: só join_waitlist / painel

insert into public.app_config (key, value, description) values
  ('waitlist_per_minute', '120', 'Inscrições por minuto na lista de espera (anti-robô, global)')
on conflict (key) do nothing;

create function public.join_waitlist(p_email text, p_state text, p_city text, p_gender text default null,
                                     p_consent boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_city  text := initcap(btrim(regexp_replace(coalesce(p_city, ''), '\s+', ' ', 'g')));
  v_state text := upper(btrim(coalesce(p_state, '')));
  v_count int;
begin
  if not coalesce(p_consent, false) then
    raise exception 'CONSENT_REQUIRED' using errcode = '42501',
      hint = 'Para entrar na lista, aceite receber o convite por e-mail.';
  end if;
  if v_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' or char_length(v_email) > 254 then
    raise exception 'INVALID_EMAIL' using errcode = '22023';
  end if;
  if v_state !~ '^[A-Z]{2}$' or char_length(v_city) not between 2 and 80 then
    raise exception 'INVALID_CITY' using errcode = '22023';
  end if;
  if p_gender is not null and p_gender not in ('mulher', 'homem', 'nao_binario') then
    raise exception 'INVALID_GENDER' using errcode = '22023';
  end if;
  if (select count(*) from public.waitlist where created_at > now() - interval '1 minute')
       >= coalesce((public.setting('waitlist_per_minute'))::int, 120) then
    raise exception 'RATE_LIMITED' using errcode = '53400';
  end if;

  insert into public.waitlist (email, state, city, gender)
  values (v_email, v_state, v_city, p_gender::public.gender)
  on conflict (lower(email)) do update set state = excluded.state, city = excluded.city,
                                           gender = coalesce(excluded.gender, public.waitlist.gender);

  -- Devolve só o total da cidade (nunca dados de outras pessoas)
  select count(*) into v_count from public.waitlist where state = v_state and city = v_city;
  return jsonb_build_object('ok', true, 'city_total', v_count);
end $$;

-- Painel: totais por cidade e equilíbrio entre mulheres e homens
create function public.admin_waitlist() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object('estado', state, 'cidade', city, 'total', total,
                                        'mulheres', mulheres, 'homens', homens) order by total desc)
    from (select state, city, count(*) total,
                 count(*) filter (where gender = 'mulher') mulheres,
                 count(*) filter (where gender = 'homem') homens
            from public.waitlist group by state, city) s), '[]'::jsonb);
end $$;

-- Painel: números do dia
create function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'perfis',            (select count(*) from public.profiles where banned_at is null),
    'verificados',       (select count(*) from public.profiles where verified and banned_at is null),
    'escondidos',        (select count(*) from public.profiles where moderation_hidden_at is not null and banned_at is null),
    'selfies_pendentes', (select count(*) from public.verification_requests where status = 'pendente'),
    'denuncias_abertas', (select count(*) from public.reports where status in ('aberta', 'em_analise')),
    'lista_de_espera',   (select count(*) from public.waitlist)
  );
end $$;

revoke all on function public.join_waitlist(text, text, text, text, boolean),
                       public.admin_waitlist(), public.admin_stats() from public;
grant execute on function public.join_waitlist(text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.admin_waitlist(), public.admin_stats() to authenticated;
