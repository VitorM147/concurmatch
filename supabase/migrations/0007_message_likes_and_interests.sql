-- =====================================================================
-- 0007 — Curtida com mensagem (botão estrela) e interesses do perfil
--
-- * likes.message: recado opcional de até 100 caracteres junto da curtida.
--   A pessoa curtida vê o recado no card do Descobrir; se der match, o
--   recado vira a primeira mensagem do chat.
-- * Anti-abuso: sem links, e-mails, @perfis ou telefones (evita spam e
--   golpes que tiram a conversa do app), limite diário de recados e a
--   curtida continua contando na cota do plano grátis.
-- * profiles.interests: até 10 interesses de um catálogo fixo (texto livre
--   viraria canal para contato externo e conteúdo impróprio).
-- =====================================================================

insert into public.app_config (key, value, description) values
  ('message_likes_per_day',         '5',  'Curtidas com mensagem por dia (plano gratuito)'),
  ('message_likes_per_day_premium', '20', 'Curtidas com mensagem por dia (Premium)'),
  ('like_message_max_chars',        '100','Tamanho máximo do recado da curtida com mensagem')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Recado da curtida
-- ---------------------------------------------------------------------
alter table public.likes
  add column message text check (message is null or char_length(message) between 1 and 100);

create index likes_message_daily_idx on public.likes (liker_id, created_at desc) where message is not null;

-- Bloqueia o que tira a conversa do app: links, domínios, e-mails, @perfis e telefones.
create function public.like_message_allowed(p_text text) returns boolean
language sql immutable as $$
  select not (
       p_text ~* '(https?://|www\.)'
    or p_text ~* '[a-z0-9-]+\.(com|br|net|org|me|io|app|link|ly|gg|xyz|site|online|info)\M'
    or p_text ~* '[a-z0-9._%+-]+@[a-z0-9.-]+'
    or p_text ~* '(^|\s)@[a-z0-9._]{2,}'
    or p_text ~ '([0-9][[:space:]().+-]*){8,}'
  )
$$;

-- ---------------------------------------------------------------------
-- Interesses do perfil (catálogo fixo; rótulos ficam no app)
-- ---------------------------------------------------------------------
create function public.interest_catalog() returns text[]
language sql immutable as $$
  select array[
    'cafe','academia','corrida','leitura','series','filmes','musica','viagens',
    'culinaria','pets','trilhas','games','praia','idiomas','danca','arte',
    'tecnologia','futebol','yoga','fotografia','vinho','podcasts','meditacao',
    'pedal','teatro','shows','cozinhar','natureza','voluntariado','xadrez'
  ]::text[]
$$;

create function public.valid_interests(p text[]) returns boolean
language sql immutable as $$
  select p is not null
     and coalesce(array_length(p, 1), 0) <= 10
     and p <@ public.interest_catalog()
     and coalesce(array_length(p, 1), 0) = (select count(distinct x) from unnest(p) x)
$$;

alter table public.profiles
  add column interests text[] not null default '{}'
  constraint profiles_interests_valid check (public.valid_interests(interests));

grant insert (interests), update (interests) on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- swipe_like(p_target, p_message): tudo do 0005 + recado
-- ---------------------------------------------------------------------
drop function public.swipe_like(uuid);

create function public.swipe_like(p_target uuid, p_message text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me        public.profiles := public.require_active_user();
  v_target  public.profiles;
  v_left    int;
  v_match   uuid;
  v_new     boolean := false;
  v_msg     text;
  v_msg_max int;
  v_max     int := coalesce((public.setting('like_message_max_chars'))::int, 100);
  v_a       uuid := least(me.id, p_target);
  v_b       uuid := greatest(me.id, p_target);
begin
  if p_target = me.id then
    raise exception 'INVALID_TARGET' using errcode = '22023';
  end if;

  -- Normaliza: quebras de linha viram espaço, espaços repetidos colapsam
  v_msg := nullif(btrim(regexp_replace(coalesce(p_message, ''), '\s+', ' ', 'g')), '');
  if v_msg is not null then
    if char_length(v_msg) > least(v_max, 100) then
      raise exception 'MESSAGE_TOO_LONG' using errcode = '22001',
        hint = 'A mensagem pode ter no máximo 100 caracteres.';
    end if;
    if not public.like_message_allowed(v_msg) then
      raise exception 'MESSAGE_NOT_ALLOWED' using errcode = '22023',
        hint = 'Sem links, e-mails, @perfis ou telefone na primeira mensagem.';
    end if;
  end if;

  select * into v_target from public.profiles where id = p_target;
  if not found or v_target.banned_at is not null or not v_target.is_visible
     or v_target.moderation_hidden_at is not null
     or public.is_blocked_pair(me.id, p_target) then
    raise exception 'TARGET_UNAVAILABLE' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.likes where liker_id = me.id and likee_id = p_target) then
    select id into v_match from public.matches where user_a = v_a and user_b = v_b and unmatched_at is null;
    return jsonb_build_object('matched', v_match is not null, 'match_id', v_match,
                              'remaining', public.remaining_likes(), 'duplicate', true);
  end if;

  -- Serializa as curtidas do MESMO usuário: a contagem e o insert viram atômicos
  perform pg_advisory_xact_lock(hashtextextended('likes:' || me.id::text, 0));

  perform public.enforce_rate_limit(me.id, 'like', interval '1 minute',
                                    coalesce((public.setting('likes_per_minute'))::int, 60));
  if public.is_premium(me.id) then
    perform public.enforce_rate_limit(me.id, 'like', now() - public.sp_day_start(),
                                      coalesce((public.setting('likes_per_day_premium'))::int, 1000));
  end if;

  if v_msg is not null then
    v_msg_max := case when public.is_premium(me.id)
                      then coalesce((public.setting('message_likes_per_day_premium'))::int, 20)
                      else coalesce((public.setting('message_likes_per_day'))::int, 5) end;
    if (select count(*) from public.likes
         where liker_id = me.id and message is not null and created_at >= public.sp_day_start()) >= v_msg_max then
      raise exception 'MESSAGE_LIKE_LIMIT' using errcode = 'P0003',
        hint = 'Você já usou as curtidas com mensagem de hoje. Elas renovam à meia-noite.';
    end if;
  end if;

  v_left := public.remaining_likes();
  if v_left is not null and v_left <= 0 then
    raise exception 'LIKE_LIMIT_REACHED' using errcode = 'P0003',
      hint = 'Limite diário de curtidas atingido. Assine o Premium para curtidas ilimitadas.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_a::text || v_b::text, 0));

  insert into public.likes (liker_id, likee_id, message) values (me.id, p_target, v_msg)
  on conflict do nothing;

  if exists (select 1 from public.likes where liker_id = p_target and likee_id = me.id) then
    insert into public.matches (user_a, user_b) values (v_a, v_b)
    on conflict (user_a, user_b) do nothing
    returning id into v_match;
    v_new := v_match is not null;
    if v_match is null then
      select id into v_match from public.matches where user_a = v_a and user_b = v_b and unmatched_at is null;
    end if;
  end if;

  -- Match novo: os recados das curtidas abrem a conversa (o mais antigo primeiro)
  if v_new then
    insert into public.messages (match_id, sender_id, body)
    select v_match, l.liker_id, l.message
      from public.likes l
      join public.profiles p on p.id = l.liker_id
     where l.message is not null
       and ((l.liker_id = me.id and l.likee_id = p_target) or (l.liker_id = p_target and l.likee_id = me.id))
       and p.banned_at is null and p.moderation_hidden_at is null
     order by l.created_at, l.liker_id;
  end if;

  return jsonb_build_object(
    'matched',   v_match is not null,
    'match_id',  v_match,
    'remaining', case when v_left is null then null else v_left - 1 end
  );
end $$;

-- ---------------------------------------------------------------------
-- discover: + interesses + recado recebido (quem mandou recado aparece primeiro)
-- ---------------------------------------------------------------------
drop function public.discover(integer);

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
  photos          text[],
  interests       text[],
  message_to_me   text
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
      and c.moderation_hidden_at is null
      and c.last_active_at > now() - make_interval(days => v_active_days)
      and c.gender = any(me.interested_in)
      and me.gender = any(c.interested_in)
      and public.age_years(c.birthdate) between me.age_min and me.age_max
      and v_my_age between c.age_min and c.age_max
      and exists (select 1 from public.photos p where p.user_id = c.id and p.approved)
      and not exists (select 1 from public.likes  l where l.liker_id  = me.id and l.likee_id  = c.id)
      and not exists (select 1 from public.passes s where s.passer_id = me.id and s.passee_id = c.id)
      and not public.is_blocked_pair(me.id, c.id)
      and not exists (select 1 from public.matches m
                      where m.user_a = least(me.id, c.id) and m.user_b = greatest(me.id, c.id))
  ),
  located as (
    select cand.*,
      (
        (cand.dist is not null and cand.dist <= me.max_distance_km and cand.dist <= cand.max_distance_km)
        or (cand.dist is null and cand.city = me.city and cand.state = me.state)
      ) as in_radius,
      (
        (me.target_city is not null and cand.target_city = me.target_city and cand.target_state = me.target_state)
        or (me.target_city is not null and cand.city = me.target_city and cand.state = me.target_state)
        or (cand.target_city is not null and cand.target_city = me.city and cand.target_state = me.state)
      ) as by_lotacao,
      (select lk.message from public.likes lk
        where lk.liker_id = cand.id and lk.likee_id = me.id and lk.message is not null) as msg
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
          where p.user_id = l.id and p.approved order by p.position),
    l.interests,
    l.msg
  from located l
  cross join lateral (select public.compatibility(me, p) as v from public.profiles p where p.id = l.id) sc
  left join public.competitions comp on comp.id = l.competition_id
  left join public.career_areas ar on ar.id = l.area_id
  where l.in_radius or l.by_lotacao
  order by (l.msg is not null) desc, (sc.v->>'score')::int desc, l.last_active_at desc
  limit least(greatest(p_limit, 1), 50);
end $$;

-- ---------------------------------------------------------------------
-- Portabilidade: inclui o recado enviado em cada curtida
-- ---------------------------------------------------------------------
create or replace function public.export_my_data() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  return jsonb_build_object(
    'generated_at', now(),
    'profile',      (select to_jsonb(p) - 'banned_at' - 'moderation_hidden_at' from public.profiles p where p.id = v_uid),
    'photos',       coalesce((select jsonb_agg(jsonb_build_object('path', storage_path, 'position', position, 'created_at', created_at))
                              from public.photos where user_id = v_uid), '[]'),
    'consents',     coalesce((select jsonb_agg(to_jsonb(c) - 'user_id') from public.consents c where c.user_id = v_uid), '[]'),
    'likes_given',  coalesce((select jsonb_agg(jsonb_build_object('profile', likee_id, 'at', created_at, 'message', message))
                              from public.likes where liker_id = v_uid), '[]'),
    'passes',       coalesce((select jsonb_agg(jsonb_build_object('profile', passee_id, 'at', created_at)) from public.passes where passer_id = v_uid), '[]'),
    'blocks',       coalesce((select jsonb_agg(jsonb_build_object('profile', blocked_id, 'at', created_at)) from public.blocks where blocker_id = v_uid), '[]'),
    'matches',      coalesce((select jsonb_agg(jsonb_build_object('match_id', id, 'at', created_at, 'unmatched_at', unmatched_at))
                              from public.matches where v_uid in (user_a, user_b)), '[]'),
    'messages_sent',coalesce((select jsonb_agg(jsonb_build_object('match_id', match_id, 'body', body, 'at', created_at))
                              from public.messages where sender_id = v_uid), '[]'),
    'reports_made', coalesce((select jsonb_agg(jsonb_build_object('reason', reason, 'at', created_at, 'status', status))
                              from public.reports where reporter_id = v_uid), '[]'),
    'subscription', (select to_jsonb(e) - 'user_id' from public.entitlements e where e.user_id = v_uid)
  );
end $$;

-- ---------------------------------------------------------------------
-- Privilégios (o 0005 revoga tudo por padrão em funções novas)
-- ---------------------------------------------------------------------
revoke all on function public.swipe_like(uuid, text), public.discover(integer) from public, anon;
grant execute on function public.swipe_like(uuid, text), public.discover(integer) to authenticated;

revoke all on function public.like_message_allowed(text) from public, anon, authenticated;
-- usadas no CHECK de profiles: precisam ser executáveis por quem grava o perfil
revoke all on function public.interest_catalog(), public.valid_interests(text[]) from public, anon;
grant execute on function public.interest_catalog(), public.valid_interests(text[]) to authenticated;
