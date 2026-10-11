-- =====================================================================
-- 0005 — Hardening pós-auditoria ESAA-Security (RUN-SEC-0001)
-- Cada bloco cita o check do playbook que motivou a correção.
-- Migrations são append-only: nada aqui edita 0001–0004, só substitui
-- funções (create or replace) e adiciona colunas, tabelas e constraints.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Configurações novas (centralizadas, alteráveis sem deploy)
-- ---------------------------------------------------------------------
insert into public.app_config (key, value, description) values
  ('trusted_reporter_min_age_hours', '24',   'Idade mínima da conta (h) para a denúncia contar na ocultação automática'),
  ('minor_report_threshold',         '2',    'Denunciantes confiáveis de "menor de idade" para ocultar na hora (1 se o denunciante for verificado)'),
  ('report_spike_threshold',         '3',    'Denúncias recebidas em 24h que geram alerta de segurança'),
  ('passes_per_minute',              '120',  'Anti-raspagem: passes por minuto'),
  ('passes_per_day',                 '2000', 'Anti-raspagem: passes por dia'),
  ('likes_per_minute',               '60',   'Anti-automação: curtidas por minuto (inclusive Premium)'),
  ('likes_per_day_premium',          '1000', 'Teto diário de curtidas do Premium (anti-bot)'),
  ('retention_unmatched_days',       '180',  'Dias para apagar conversas de matches desfeitos (sem denúncia aberta)'),
  ('retention_passes_days',          '365',  'Dias para apagar registros de "passar"'),
  ('retention_audit_years',          '5',    'Anos de retenção de audit_logs e denúncias resolvidas')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- AZ-002 / FU-006 — Foto só pode apontar para a pasta do próprio dono.
-- Antes: era possível cadastrar o storage_path da foto de outra pessoa
-- e exibi-la como sua (catfish com foto real de terceiro).
-- ---------------------------------------------------------------------
alter table public.photos add constraint photos_path_owner
  check (storage_path ~ ('^' || user_id::text || '/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$'));

-- ---------------------------------------------------------------------
-- BL-001 — Ocultação pela moderação em coluna própria, fora do alcance
-- do usuário. Antes: auto-hide usava is_visible, que o próprio usuário
-- podia religar no app.
-- ---------------------------------------------------------------------
alter table public.profiles add column moderation_hidden_at timestamptz;
create index profiles_moderation_idx on public.profiles (moderation_hidden_at) where moderation_hidden_at is not null;
-- (sem grant de UPDATE nessa coluna: ver 0003, grants são por coluna)

-- ---------------------------------------------------------------------
-- LM-004 — Fila de alertas de segurança (consumida pelo painel/webhook)
-- ---------------------------------------------------------------------
create table public.security_alerts (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind in ('minor_report', 'report_spike', 'auto_hide', 'rate_limit')),
  subject_id  uuid references public.profiles(id) on delete cascade,
  data        jsonb,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index security_alerts_open_idx on public.security_alerts (created_at) where resolved_at is null;
alter table public.security_alerts enable row level security;
-- sem grants: só service_role / funções do sistema

-- ---------------------------------------------------------------------
-- DA-005 — Consentimento LGPD exigido pelo servidor, não só pelo app.
-- Gênero/interesse (orientação) é dado sensível (LGPD art. 11).
-- ---------------------------------------------------------------------
create function public.require_consents() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(distinct kind) from public.consents
       where user_id = new.id and kind in ('termos', 'privacidade', 'dados_sensiveis')) < 3 then
    raise exception 'CONSENT_REQUIRED' using errcode = '42501',
      hint = 'Aceite os termos, a política de privacidade e o uso de dados sensíveis antes de criar o perfil.';
  end if;
  return new;
end $$;

create trigger profiles_require_consents before insert on public.profiles
  for each row execute function public.require_consents();

-- ---------------------------------------------------------------------
-- AP-001 / BL-002 — Rate limit genérico baseado em contagem
-- ---------------------------------------------------------------------
create function public.enforce_rate_limit(p_user uuid, p_action text, p_window interval, p_max int)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  if p_action = 'pass' then
    select count(*) into v_count from public.passes where passer_id = p_user and created_at > now() - p_window;
  elsif p_action = 'like' then
    select count(*) into v_count from public.likes where liker_id = p_user and created_at > now() - p_window;
  else
    raise exception 'UNKNOWN_ACTION';
  end if;
  if v_count >= p_max then
    raise exception 'RATE_LIMITED' using errcode = '53400',
      hint = 'Muitas ações em pouco tempo. Aguarde um instante.';
  end if;
  -- O alerta é gravado na ação que ATINGE o teto: a transação que levanta
  -- RATE_LIMITED sofre rollback e não conseguiria persistir nada.
  if v_count = p_max - 1 then
    insert into public.security_alerts (kind, subject_id, data)
    select 'rate_limit', p_user, jsonb_build_object('action', p_action, 'window', p_window::text, 'max', p_max)
    where not exists (select 1 from public.security_alerts
                      where kind = 'rate_limit' and subject_id = p_user and created_at > now() - interval '1 hour');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Discovery: igual ao 0002 + exclui perfis ocultados pela moderação
-- ---------------------------------------------------------------------
create or replace function public.discover(p_limit integer default 20)
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
-- Like: + lock por usuário (BL-003: o limite de 20 não pode ser furado
-- com chamadas em paralelo), + rate limit (BL-002), + alvo ocultado
-- ---------------------------------------------------------------------
create or replace function public.swipe_like(p_target uuid) returns jsonb
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

-- AP-001 — passar também tem limite (impede varrer todos os perfis da região)
create or replace function public.swipe_pass(p_target uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public.require_active_user();
begin
  if p_target = me.id then
    raise exception 'INVALID_TARGET' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('passes:' || me.id::text, 0));
  perform public.enforce_rate_limit(me.id, 'pass', interval '1 minute',
                                    coalesce((public.setting('passes_per_minute'))::int, 120));
  perform public.enforce_rate_limit(me.id, 'pass', interval '1 day',
                                    coalesce((public.setting('passes_per_day'))::int, 2000));
  insert into public.passes (passer_id, passee_id) values (me.id, p_target)
  on conflict do nothing;
end $$;

-- ---------------------------------------------------------------------
-- Matches: + paginação fixa (AP-006) + esconde quem está em revisão
-- ---------------------------------------------------------------------
create or replace function public.my_matches()
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
    and o.moderation_hidden_at is null
    and not public.is_blocked_pair(me.id, o.id)
  order by coalesce(lm.created_at, m.created_at) desc
  limit 200;
end $$;

-- Mensagens: quem está em revisão da moderação não envia
create or replace function public.validate_message() returns trigger
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
  if exists (select 1 from public.profiles where id = new.sender_id
             and (banned_at is not null or moderation_hidden_at is not null)) then
    raise exception 'ACCOUNT_UNDER_REVIEW' using errcode = '42501';
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

-- ---------------------------------------------------------------------
-- BL-004 — Denúncia não vira arma.
-- Antes: 1 denúncia de "menor de idade" de qualquer conta (até criada
-- naquele minuto) ocultava qualquer perfil. Agora só denunciantes
-- confiáveis contam para a ocultação automática; toda denúncia continua
-- bloqueando o par e gera alerta para revisão humana.
-- ---------------------------------------------------------------------
create function public.is_trusted_reporter(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles pr
    where pr.id = p_user
      and pr.banned_at is null
      and pr.moderation_hidden_at is null
      and pr.created_at <= now() - make_interval(hours => coalesce((public.setting('trusted_reporter_min_age_hours'))::int, 24))
      and exists (select 1 from public.photos ph where ph.user_id = pr.id and ph.approved)
  )
$$;

create or replace function public.report_user(
  p_target uuid, p_reason public.report_reason, p_details text default null, p_match uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public.require_active_user();
  v_id uuid;
  v_recent int;
  v_auto_hide  int := coalesce((public.setting('auto_hide_after_reports'))::int, 3);
  v_minor_need int := coalesce((public.setting('minor_report_threshold'))::int, 2);
  v_spike      int := coalesce((public.setting('report_spike_threshold'))::int, 3);
  v_trusted    int;
  v_minor      int;
  v_24h        int;
begin
  if p_target = me.id then
    raise exception 'INVALID_TARGET' using errcode = '22023';
  end if;
  -- AZ-002: o match anexado precisa ser entre denunciante e denunciado
  if p_match is not null and not exists (
       select 1 from public.matches
       where id = p_match and user_a = least(me.id, p_target) and user_b = greatest(me.id, p_target)) then
    raise exception 'INVALID_MATCH' using errcode = '22023';
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

  select count(distinct r.reporter_id) filter (where public.is_trusted_reporter(r.reporter_id)),
         count(distinct r.reporter_id) filter (where r.reason = 'menor_de_idade' and public.is_trusted_reporter(r.reporter_id)),
         count(*) filter (where r.created_at > now() - interval '24 hours')
    into v_trusted, v_minor, v_24h
    from public.reports r
   where r.reported_id = p_target and r.status in ('aberta', 'em_analise');

  if p_reason = 'menor_de_idade' then
    insert into public.security_alerts (kind, subject_id, data)
    values ('minor_report', p_target, jsonb_build_object('report_id', v_id, 'trusted_reporters', v_minor));
  elsif v_24h >= v_spike then
    insert into public.security_alerts (kind, subject_id, data)
    values ('report_spike', p_target, jsonb_build_object('report_id', v_id, 'reports_24h', v_24h));
  end if;

  if v_trusted >= v_auto_hide
     or v_minor >= v_minor_need
     or (p_reason = 'menor_de_idade' and me.verified and public.is_trusted_reporter(me.id)) then
    update public.profiles set moderation_hidden_at = coalesce(moderation_hidden_at, now()) where id = p_target;
    insert into public.audit_logs (actor_id, action, target_id, data)
    values (null, 'auto_hide', p_target, jsonb_build_object('report_id', v_id, 'reason', p_reason,
            'trusted_reporters', v_trusted, 'minor_reporters', v_minor));
    insert into public.security_alerts (kind, subject_id, data)
    values ('auto_hide', p_target, jsonb_build_object('report_id', v_id));
  end if;

  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- DA-005 — Portabilidade (LGPD art. 18, V): o titular baixa os próprios dados
-- ---------------------------------------------------------------------
create function public.export_my_data() returns jsonb
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
    'likes_given',  coalesce((select jsonb_agg(jsonb_build_object('profile', likee_id, 'at', created_at)) from public.likes where liker_id = v_uid), '[]'),
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
-- DA-003 — Política de retenção executável (agendada no 0006 via pg_cron)
-- ---------------------------------------------------------------------
create function public.purge_expired_data() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_unmatched int; v_passes int; v_audit int; v_reports int; v_alerts int;
begin
  delete from public.matches m
   where m.unmatched_at < now() - make_interval(days => coalesce((public.setting('retention_unmatched_days'))::int, 180))
     and not exists (select 1 from public.reports r where r.match_id = m.id and r.status in ('aberta', 'em_analise'));
  get diagnostics v_unmatched = row_count;

  delete from public.passes
   where created_at < now() - make_interval(days => coalesce((public.setting('retention_passes_days'))::int, 365));
  get diagnostics v_passes = row_count;

  delete from public.audit_logs
   where created_at < now() - make_interval(years => coalesce((public.setting('retention_audit_years'))::int, 5));
  get diagnostics v_audit = row_count;

  delete from public.reports
   where status in ('procedente', 'improcedente')
     and resolved_at < now() - make_interval(years => coalesce((public.setting('retention_audit_years'))::int, 5));
  get diagnostics v_reports = row_count;

  delete from public.security_alerts where resolved_at < now() - interval '1 year';
  get diagnostics v_alerts = row_count;

  insert into public.audit_logs (actor_id, action, data)
  values (null, 'retention_purge', jsonb_build_object('matches', v_unmatched, 'passes', v_passes,
          'audit_logs', v_audit, 'reports', v_reports, 'alerts', v_alerts));
  return jsonb_build_object('matches', v_unmatched, 'passes', v_passes, 'audit_logs', v_audit,
                            'reports', v_reports, 'alerts', v_alerts);
end $$;

-- ---------------------------------------------------------------------
-- AZ-005 — Menor privilégio
-- ---------------------------------------------------------------------
-- is_blocked_pair estava exposto: qualquer usuário descobria se A bloqueou B.
revoke execute on function public.is_blocked_pair(uuid, uuid) from authenticated;

-- Funções novas: nada exposto por padrão
revoke all on function
  public.require_consents(),
  public.enforce_rate_limit(uuid, text, interval, int),
  public.is_trusted_reporter(uuid),
  public.purge_expired_data()
from public, anon, authenticated;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

-- Tabelas/funções criadas em migrations futuras não herdam acesso do app
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;
