-- =====================================================================
-- Regras de negócio (Discovery, Compatibility, Like/Match, Chat, Safety)
-- Todas as RPCs são SECURITY DEFINER e validam auth.uid() internamente.
-- O app nunca escreve direto em likes/matches/blocks/reports.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create function public.setting(p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select value from public.app_config where key = p_key
$$;

create function public.age_years(p_birthdate date) returns integer
language sql stable as $$
  select extract(year from age(current_date, p_birthdate))::int
$$;

-- Haversine; null quando faltar coordenada
create function public.distance_km(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric)
returns numeric
language sql immutable as $$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else round((6371 * 2 * asin(sqrt(
      power(sin(radians((lat2 - lat1) / 2)), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) *
      power(sin(radians((lng2 - lng1) / 2)), 2)
    )))::numeric, 1)
  end
$$;

-- Nunca devolvemos distância exata: arredonda para faixas
create function public.distance_label(p_km numeric) returns text
language sql immutable as $$
  select case
    when p_km is null then null
    when p_km < 5   then 'a menos de 5 km'
    when p_km < 100 then 'a ~' || (ceil(p_km / 5) * 5)::int || ' km'
    else 'a ~' || (ceil(p_km / 50) * 50)::int || ' km'
  end
$$;

-- Dia comercial em São Paulo (o limite diário vira à meia-noite de Brasília)
create function public.sp_day_start() returns timestamptz
language sql stable as $$
  select date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
$$;

create function public.is_premium(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select premium_until > now() from public.entitlements where user_id = p_user), false)
$$;

create function public.is_blocked_pair(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  )
$$;

-- Usuário autenticado, com perfil e não banido. Retorna o perfil.
create function public.require_active_user() returns public.profiles
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_me  public.profiles;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  select * into v_me from public.profiles where id = v_uid;
  if not found then
    raise exception 'PROFILE_REQUIRED' using errcode = 'P0001', hint = 'Complete o onboarding.';
  end if;
  if v_me.banned_at is not null then
    raise exception 'ACCOUNT_BANNED' using errcode = '42501';
  end if;
  return v_me;
end $$;

-- ---------------------------------------------------------------------
-- Compatibility Engine (determinístico e explicável)
-- Pesos em public.matching_weights. Retorna score 0–100 + motivos.
-- Em app de namoro a compatibilidade é DESEMPATE, não filtro:
-- os filtros duros são gênero, idade, distância e segurança.
-- ---------------------------------------------------------------------
create function public.compatibility(me public.profiles, c public.profiles)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_total   numeric := 0;
  v_got     numeric := 0;
  v_reasons text[]  := '{}';
  v_dist    numeric;
  w         record;
  f         numeric;
begin
  v_dist := public.distance_km(me.lat_approx, me.lng_approx, c.lat_approx, c.lng_approx);

  for w in select factor, weight from public.matching_weights loop
    f := 0;
    case w.factor
      when 'mesmo_concurso' then
        if me.competition_id is not null and me.competition_id = c.competition_id then
          f := 1; v_reasons := array_append(v_reasons, 'Mesmo concurso'::text);
        end if;
      when 'mesma_area' then
        if me.area_id is not null and me.area_id = c.area_id then
          f := 1;
          if me.competition_id is null or me.competition_id is distinct from c.competition_id then
            v_reasons := array_append(v_reasons, 'Mesma área'::text);
          end if;
        end if;
      when 'mesmo_periodo' then
        if me.study_period is not null and me.study_period = c.study_period then
          f := 1; v_reasons := array_append(v_reasons, 'Estudam no mesmo período'::text);
        elsif me.study_period = 'variado' or c.study_period = 'variado' then
          f := 0.5;
        end if;
      when 'fase_parecida' then
        -- ordem do enum = estágio da jornada; diferença pequena = fase parecida
        if abs(array_position(enum_range(null::public.study_status), me.status)
             - array_position(enum_range(null::public.study_status), c.status)) <= 1 then
          f := 1; v_reasons := array_append(v_reasons, 'Fase parecida'::text);
        end if;
      when 'proximidade' then
        if v_dist is not null then
          f := greatest(0, 1 - v_dist / greatest(me.max_distance_km, 1));
        elsif me.city = c.city and me.state = c.state then
          f := 1;
        end if;
      when 'lotacao' then
        if (me.target_city is not null and me.target_city = c.target_city and me.target_state = c.target_state)
           or (me.target_city = c.city and me.target_state = c.state)
           or (c.target_city = me.city and c.target_state = me.state) then
          f := 1; v_reasons := array_append(v_reasons, 'Mesmo destino de lotação'::text);
        end if;
      else
        f := 0;
    end case;
    v_total := v_total + w.weight;
    v_got   := v_got + w.weight * f;
  end loop;

  return jsonb_build_object(
    'score',   case when v_total = 0 then 0 else round(v_got / v_total * 100)::int end,
    'reasons', to_jsonb(v_reasons)
  );
end $$;

-- ---------------------------------------------------------------------
-- Discovery: candidatos elegíveis, filtrados, pontuados e ordenados
-- ---------------------------------------------------------------------
create function public.discover(p_limit integer default 20)
returns table (
  id              uuid,
  display_name    text,
  age             integer,
  city            text,
  state           char(2),
  bio             text,
  verified        boolean,
  competition     text,
  area            text,
  status          public.study_status,
  study_period    public.study_period,
  distance_label  text,
  lotacao_label   text,
  score           integer,
  reasons         jsonb,
  photos          text[]
)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  me public.profiles := public.require_active_user();
  v_my_age int := public.age_years(me.birthdate);
  v_active_days int := coalesce((public.setting('discovery_active_days'))::int, 30);
begin
  update public.profiles set last_active_at = now() where profiles.id = me.id;

  return query
  with cand as (
    select c.*,
           public.distance_km(me.lat_approx, me.lng_approx, c.lat_approx, c.lng_approx) as dist,
           public.age_years(c.birthdate) as c_age
    from public.profiles c
    where c.id <> me.id
      and c.is_visible
      and c.banned_at is null
      and c.last_active_at > now() - make_interval(days => v_active_days)
      -- interesse mútuo de gênero
      and c.gender = any(me.interested_in)
      and me.gender = any(c.interested_in)
      -- idade nos dois sentidos
      and public.age_years(c.birthdate) between me.age_min and me.age_max
      and v_my_age between c.age_min and c.age_max
      -- precisa ter ao menos 1 foto aprovada
      and exists (select 1 from public.photos p where p.user_id = c.id and p.approved)
      -- já visto / bloqueado / já é match
      and not exists (select 1 from public.likes  l where l.liker_id  = me.id and l.likee_id  = c.id)
      and not exists (select 1 from public.passes s where s.passer_id = me.id and s.passee_id = c.id)
      and not public.is_blocked_pair(me.id, c.id)
      and not exists (select 1 from public.matches m
                      where m.user_a = least(me.id, c.id) and m.user_b = greatest(me.id, c.id))
  ),
  located as (
    select cand.*,
      (
        -- dentro do raio dos DOIS
        (cand.dist is not null and cand.dist <= me.max_distance_km and cand.dist <= cand.max_distance_km)
        -- sem coordenadas: mesma cidade
        or (cand.dist is null and cand.city = me.city and cand.state = me.state)
      ) as in_radius,
      (
        -- Modo Lotação: destino em comum, ou um está onde o outro quer ir
        (me.target_city is not null and cand.target_city = me.target_city and cand.target_state = me.target_state)
        or (me.target_city is not null and cand.city = me.target_city and cand.state = me.target_state)
        or (cand.target_city is not null and cand.target_city = me.city and cand.target_state = me.state)
      ) as by_lotacao
    from cand
  )
  select
    l.id, l.display_name, l.c_age, l.city, l.state, l.bio, l.verified,
    comp.name, ar.name, l.status, l.study_period,
    case when l.in_radius then public.distance_label(l.dist) end,
    case when l.by_lotacao and not l.in_radius then
      'Lotação: ' || coalesce(l.target_city || '/' || l.target_state, l.city || '/' || l.state)
    end,
    (sc.v->>'score')::int,
    sc.v->'reasons',
    array(select p.storage_path from public.photos p
          where p.user_id = l.id and p.approved order by p.position)
  from located l
  cross join lateral (select public.compatibility(me, p) as v from public.profiles p where p.id = l.id) sc
  left join public.competitions comp on comp.id = l.competition_id
  left join public.career_areas ar on ar.id = l.area_id
  where l.in_radius or l.by_lotacao
  order by (sc.v->>'score')::int desc, l.last_active_at desc
  limit least(greatest(p_limit, 1), 50);
end $$;

-- ---------------------------------------------------------------------
-- Likes restantes hoje (null = ilimitado)
-- ---------------------------------------------------------------------
create function public.remaining_likes() returns integer
language plpgsql stable security definer set search_path = public as $$
declare
  me public.profiles := public.require_active_user();
  v_limit int := coalesce((public.setting('free_likes_per_day'))::int, 20);
  v_used  int;
begin
  if public.is_premium(me.id) then
    return null;
  end if;
  select count(*) into v_used from public.likes
   where liker_id = me.id and created_at >= public.sp_day_start();
  return greatest(v_limit - v_used, 0);
end $$;

-- ---------------------------------------------------------------------
-- Like → possível MATCH ("ConMatch")
-- Lock por par evita a corrida em que os dois curtem ao mesmo tempo
-- e nenhum dos dois vê o like do outro.
-- ---------------------------------------------------------------------
create function public.swipe_like(p_target uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me        public.profiles := public.require_active_user();
  v_target  public.profiles;
  v_left    int;
  v_match   uuid;
  v_a       uuid := least(me.id, p_target);
  v_b       uuid := greatest(me.id, p_target);
begin
  if p_target = me.id then
    raise exception 'INVALID_TARGET' using errcode = '22023';
  end if;

  select * into v_target from public.profiles where id = p_target;
  if not found or v_target.banned_at is not null or not v_target.is_visible
     or public.is_blocked_pair(me.id, p_target) then
    raise exception 'TARGET_UNAVAILABLE' using errcode = 'P0002';
  end if;

  -- like repetido é idempotente e não consome cota
  if exists (select 1 from public.likes where liker_id = me.id and likee_id = p_target) then
    select id into v_match from public.matches where user_a = v_a and user_b = v_b and unmatched_at is null;
    return jsonb_build_object('matched', v_match is not null, 'match_id', v_match,
                              'remaining', public.remaining_likes(), 'duplicate', true);
  end if;

  v_left := public.remaining_likes();
  if v_left is not null and v_left <= 0 then
    raise exception 'LIKE_LIMIT_REACHED' using errcode = 'P0003',
      hint = 'Limite diário de curtidas atingido. Assine o Premium para curtidas ilimitadas.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_a::text || v_b::text, 0));

  insert into public.likes (liker_id, likee_id) values (me.id, p_target)
  on conflict do nothing;

  if exists (select 1 from public.likes where liker_id = p_target and likee_id = me.id) then
    insert into public.matches (user_a, user_b) values (v_a, v_b)
    on conflict (user_a, user_b) do nothing
    returning id into v_match;
    if v_match is null then
      select id into v_match from public.matches where user_a = v_a and user_b = v_b and unmatched_at is null;
    end if;
  end if;

  return jsonb_build_object(
    'matched',   v_match is not null,
    'match_id',  v_match,
    'remaining', case when v_left is null then null else v_left - 1 end
  );
end $$;

create function public.swipe_pass(p_target uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public.require_active_user();
begin
  if p_target = me.id then
    raise exception 'INVALID_TARGET' using errcode = '22023';
  end if;
  insert into public.passes (passer_id, passee_id) values (me.id, p_target)
  on conflict do nothing;
end $$;

-- ---------------------------------------------------------------------
-- Matches e conversas
-- ---------------------------------------------------------------------
create function public.my_matches()
returns table (
  match_id      uuid,
  matched_at    timestamptz,
  other_id      uuid,
  display_name  text,
  age           integer,
  city          text,
  state         char(2),
  competition   text,
  photo         text,
  last_message  text,
  last_message_at timestamptz,
  last_sender   uuid,
  unread        integer
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  me public.profiles := public.require_active_user();
begin
  return query
  select m.id, m.created_at, o.id, o.display_name, public.age_years(o.birthdate),
         o.city, o.state, comp.name,
         (select p.storage_path from public.photos p where p.user_id = o.id and p.approved order by p.position limit 1),
         lm.body, lm.created_at, lm.sender_id,
         (select count(*)::int from public.messages x
           where x.match_id = m.id and x.sender_id <> me.id and x.read_at is null)
  from public.matches m
  join public.profiles o on o.id = case when m.user_a = me.id then m.user_b else m.user_a end
  left join public.competitions comp on comp.id = o.competition_id
  left join lateral (
    select body, created_at, sender_id from public.messages
    where messages.match_id = m.id order by id desc limit 1
  ) lm on true
  where (m.user_a = me.id or m.user_b = me.id)
    and m.unmatched_at is null
    and o.banned_at is null
    and not public.is_blocked_pair(me.id, o.id)
  order by coalesce(lm.created_at, m.created_at) desc;
end $$;

create function public.mark_read(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public.require_active_user();
begin
  update public.messages set read_at = now()
   where match_id = p_match and sender_id <> me.id and read_at is null
     and exists (select 1 from public.matches m where m.id = p_match and (m.user_a = me.id or m.user_b = me.id));
end $$;

create function public.unmatch(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public.require_active_user();
begin
  update public.matches set unmatched_at = now(), unmatched_by = me.id
   where id = p_match and (user_a = me.id or user_b = me.id) and unmatched_at is null;
  if not found then
    raise exception 'MATCH_NOT_FOUND' using errcode = 'P0002';
  end if;
end $$;

-- Validação de mensagem no servidor (vale até para service_role)
create function public.validate_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m public.matches;
  v_other uuid;
  v_per_min int := coalesce((public.setting('messages_per_minute'))::int, 30);
begin
  select * into m from public.matches where id = new.match_id;
  if not found or m.unmatched_at is not null then
    raise exception 'MATCH_INACTIVE' using errcode = '42501';
  end if;
  if new.sender_id not in (m.user_a, m.user_b) then
    raise exception 'NOT_A_PARTICIPANT' using errcode = '42501';
  end if;
  v_other := case when m.user_a = new.sender_id then m.user_b else m.user_a end;
  if public.is_blocked_pair(new.sender_id, v_other) then
    raise exception 'BLOCKED' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = new.sender_id and banned_at is not null) then
    raise exception 'ACCOUNT_BANNED' using errcode = '42501';
  end if;
  if (select count(*) from public.messages
       where sender_id = new.sender_id and created_at > now() - interval '1 minute') >= v_per_min then
    raise exception 'RATE_LIMITED' using errcode = '53400',
      hint = 'Muitas mensagens em pouco tempo. Aguarde um instante.';
  end if;
  new.body := btrim(new.body);
  new.created_at := now();
  new.read_at := null;
  return new;
end $$;

create trigger messages_validate before insert on public.messages
  for each row execute function public.validate_message();

-- ---------------------------------------------------------------------
-- Segurança: bloquear e denunciar
-- ---------------------------------------------------------------------
create function public.block_user(p_target uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public.require_active_user();
begin
  if p_target = me.id then
    raise exception 'INVALID_TARGET' using errcode = '22023';
  end if;
  insert into public.blocks (blocker_id, blocked_id) values (me.id, p_target)
  on conflict do nothing;
  update public.matches set unmatched_at = coalesce(unmatched_at, now()), unmatched_by = coalesce(unmatched_by, me.id)
   where user_a = least(me.id, p_target) and user_b = greatest(me.id, p_target);
  insert into public.audit_logs (actor_id, action, target_id) values (me.id, 'block', p_target);
end $$;

-- Denúncia sempre bloqueia junto (quem denuncia não deve continuar vendo a pessoa)
create function public.report_user(
  p_target uuid, p_reason public.report_reason, p_details text default null, p_match uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public.require_active_user();
  v_id uuid;
  v_recent int;
  v_auto_hide int := coalesce((public.setting('auto_hide_after_reports'))::int, 3);
begin
  if p_target = me.id then
    raise exception 'INVALID_TARGET' using errcode = '22023';
  end if;
  select count(*) into v_recent from public.reports
   where reporter_id = me.id and created_at > now() - interval '1 day';
  if v_recent >= 10 then
    raise exception 'RATE_LIMITED' using errcode = '53400';
  end if;

  insert into public.reports (reporter_id, reported_id, reason, details, match_id)
  values (me.id, p_target, p_reason, nullif(btrim(p_details), ''), p_match)
  returning id into v_id;

  perform public.block_user(p_target);

  -- Proteção automática: N denunciantes distintos ocultam o perfil até revisão HUMANA.
  -- Menor de idade oculta na primeira denúncia. Banimento é sempre decisão humana.
  if p_reason = 'menor_de_idade'
     or (select count(distinct reporter_id) from public.reports
          where reported_id = p_target and status in ('aberta', 'em_analise')) >= v_auto_hide then
    update public.profiles set is_visible = false where id = p_target;
    insert into public.audit_logs (actor_id, action, target_id, data)
    values (null, 'auto_hide', p_target, jsonb_build_object('report_id', v_id, 'reason', p_reason));
  end if;

  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- LGPD: exclusão de conta (apaga tudo em cascata a partir de auth.users)
-- Denúncias contra o usuário somem junto; as feitas por ele ficam anônimas.
-- Fotos no Storage são apagadas pela Edge Function / job (ver docs).
-- ---------------------------------------------------------------------
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  insert into public.audit_logs (actor_id, action) values (null, 'account_deleted');
  delete from auth.users where id = v_uid;
end $$;
