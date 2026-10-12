-- =====================================================================
-- 0008 — "Mostrou a cara, ganhou voz" + moderação com revisão humana
--
-- Regras de produto (decididas em 12/10/2026):
-- * Ações por dia = curtir + passar. Grátis 50, Premium 250.
--   Passar conta: impede quem só "folheia" perfis atrás de @ na bio.
-- * Curtida com mensagem: grátis 5/dia, Premium 100/dia.
-- * Sem verificação: só curte e passa. Não manda nem recebe mensagem
--   com a curtida e, mesmo com match, o chat só abre quando os DOIS
--   estiverem verificados. Assinar o Premium também exige verificação.
-- * Verificação = gesto sorteado + selfie, revisada pelo suporte; vale
--   para sempre depois de aprovada.
-- * Sem prostituição/cobrança: bloqueio de termos típicos na bio, no
--   recado da curtida e no chat; motivo de denúncia próprio, com alerta.
-- * 3 denúncias de contas confiáveis ocultam o perfil (já no 0005).
--   Agora a denúncia guarda a conversa daquele par como evidência, a
--   pessoa ocultada pode se explicar (recurso) e o suporte decide.
-- =====================================================================

insert into public.app_config (key, value, description) values
  ('actions_per_day',               '50',  'Ações por dia no plano grátis (curtir + passar; renova à meia-noite de Brasília)'),
  ('actions_per_day_premium',       '250', 'Ações por dia no Premium (curtir + passar)'),
  ('message_likes_per_day',         '5',   'Curtidas com mensagem por dia (grátis, só verificados)'),
  ('message_likes_per_day_premium', '100', 'Curtidas com mensagem por dia (Premium, só verificados)'),
  ('verification_requests_per_day', '3',   'Tentativas de verificação por dia'),
  ('report_evidence_messages',      '200', 'Mensagens da conversa guardadas como evidência na denúncia')
on conflict (key) do update set value = excluded.value, description = excluded.description;

delete from public.app_config where key in ('free_likes_per_day', 'likes_per_day_premium');

-- Passar agora entra na contagem diária
create index if not exists passes_passer_day_idx on public.passes (passer_id, created_at desc);

-- Novo motivo de denúncia (usado só dentro de funções, então pode ser
-- adicionado na mesma transação)
alter type public.report_reason add value if not exists 'servico_sexual_ou_cobranca';

alter table public.security_alerts drop constraint if exists security_alerts_kind_check;
alter table public.security_alerts add constraint security_alerts_kind_check
  check (kind in ('minor_report', 'report_spike', 'auto_hide', 'rate_limit',
                  'sexual_service_report', 'appeal', 'verification_request'));

-- ---------------------------------------------------------------------
-- Filtro de programa / cobrança
-- Dois níveis: o estrito (bio e recado da curtida) também barra Pix e
-- preço; o do chat só barra termos inequívocos ("dividir no Pix" é normal).
-- Fronteiras de palavra escritas à mão: \M falha depois de letra
-- acentuada em alguns locales.
-- ---------------------------------------------------------------------
create function public.sexual_service_signal(p_text text) returns boolean
language sql immutable as $$
  select coalesce(p_text, '') ~* (
    '(^|[^a-z0-9])('
    || 'acompanhantes?|garot[ao]s? de programa|fa[cç]o programa|fazer programa|programa completo'
    || '|sou gp|atendo (com|em|no|na) (local|motel|hot[eé]is?|domic[ií]lio)|com local pr[oó]prio'
    || '|cach[eê]s?|massagem (t[aâ]ntrica|sensual|nuru)|final feliz'
    || '|vendo (packs?|nudes?|fotos [ií]ntimas|conte[uú]do)|packs? (de )?(fotos|nudes?)'
    || '|only ?fans|conte[uú]do (adulto|\+18|er[oó]tico|[ií]ntimo)'
    || '|sugar ?(daddy|baby|mommy)|valores? (no|na|pelo|por) (pv|privado|direct|dm|inbox|zap|whats)'
    || ')([^a-z0-9]|$)'
  )
$$;

create function public.sexual_service_signal_strict(p_text text) returns boolean
language sql immutable as $$
  select public.sexual_service_signal(p_text)
      or coalesce(p_text, '') ~* '(^|[^a-z0-9])(pix|privacy|mimos?|ajuda financeira)([^a-z0-9]|$)'
      or coalesce(p_text, '') ~* 'r\$ ?[0-9]'
$$;

-- Bio: sem programa/cobrança e sem contato direto (link, e-mail, telefone).
-- @ do Instagram continua permitido; o limite diário de ações é o que
-- impede a "colheita" de perfis.
create function public.bio_allowed(p_text text) returns boolean
language sql immutable as $$
  select p_text is null or not (
       public.sexual_service_signal_strict(p_text)
    or p_text ~* '(https?://|www\.)'
    or p_text ~* '[a-z0-9-]+\.(com|br|net|org|me|io|app|link|ly|gg|xyz|site|online|info)([^a-z0-9]|$)'
    or p_text ~* '[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z]'
    or p_text ~ '([0-9][[:space:]().+-]*){8,}'
  )
$$;

create function public.check_profile_bio() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.bio := nullif(btrim(new.bio), '');
  if not public.bio_allowed(new.bio) then
    raise exception 'BIO_NOT_ALLOWED' using errcode = '22023',
      hint = 'A bio não pode ter telefone, link, e-mail nem oferta de serviço ou cobrança.';
  end if;
  return new;
end $$;

create trigger profiles_bio_check before insert or update of bio on public.profiles
  for each row execute function public.check_profile_bio();

-- ---------------------------------------------------------------------
-- Ações do dia (curtir + passar)
-- ---------------------------------------------------------------------
create function public.actions_used_today(p_user uuid) returns integer
language sql stable security definer set search_path = public as $$
  select ((select count(*) from public.likes  where liker_id  = p_user and created_at >= public.sp_day_start())
        + (select count(*) from public.passes where passer_id = p_user and created_at >= public.sp_day_start()))::int
$$;

create function public.actions_limit(p_user uuid) returns integer
language sql stable security definer set search_path = public as $$
  select case when public.is_premium(p_user)
              then coalesce((public.setting('actions_per_day_premium'))::int, 250)
              else coalesce((public.setting('actions_per_day'))::int, 50) end
$$;

create function public.message_likes_limit(p_user uuid) returns integer
language sql stable security definer set search_path = public as $$
  select case when public.is_premium(p_user)
              then coalesce((public.setting('message_likes_per_day_premium'))::int, 100)
              else coalesce((public.setting('message_likes_per_day'))::int, 5) end
$$;

-- Mantém o nome (o app antigo chama), mas agora vale para todos os
-- planos e conta curtir + passar. Nunca retorna null.
create or replace function public.remaining_likes() returns integer
language plpgsql stable security definer set search_path = public as $$
declare
  me public.profiles := public.require_active_user();
begin
  return greatest(public.actions_limit(me.id) - public.actions_used_today(me.id), 0);
end $$;

-- Tudo que o app precisa para os contadores e travas
create function public.my_limits() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me public.profiles := public.require_active_user();
  v_msg_used int;
begin
  select count(*) into v_msg_used from public.likes
   where liker_id = me.id and message is not null and created_at >= public.sp_day_start();
  return jsonb_build_object(
    'premium',        public.is_premium(me.id),
    'verified',       me.verified,
    'actions_max',    public.actions_limit(me.id),
    'actions_left',   greatest(public.actions_limit(me.id) - public.actions_used_today(me.id), 0),
    'messages_max',   case when me.verified then public.message_likes_limit(me.id) else 0 end,
    'messages_left',  case when me.verified then greatest(public.message_likes_limit(me.id) - v_msg_used, 0) else 0 end
  );
end $$;

-- ---------------------------------------------------------------------
-- swipe_like: verificação para mandar/receber recado + cota de ações
-- ---------------------------------------------------------------------
create or replace function public.swipe_like(p_target uuid, p_message text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me        public.profiles := public.require_active_user();
  v_target  public.profiles;
  v_left    int;
  v_match   uuid;
  v_new     boolean := false;
  v_msg     text;
  v_max     int := coalesce((public.setting('like_message_max_chars'))::int, 100);
  v_a       uuid := least(me.id, p_target);
  v_b       uuid := greatest(me.id, p_target);
begin
  if p_target = me.id then
    raise exception 'INVALID_TARGET' using errcode = '22023';
  end if;

  v_msg := nullif(btrim(regexp_replace(coalesce(p_message, ''), '\s+', ' ', 'g')), '');
  if v_msg is not null then
    if not me.verified then
      raise exception 'VERIFICATION_REQUIRED' using errcode = '42501',
        hint = 'Verifique seu perfil para mandar curtidas com mensagem.';
    end if;
    if char_length(v_msg) > least(v_max, 100) then
      raise exception 'MESSAGE_TOO_LONG' using errcode = '22001',
        hint = 'A mensagem pode ter no máximo 100 caracteres.';
    end if;
    if not public.like_message_allowed(v_msg) or public.sexual_service_signal_strict(v_msg) then
      raise exception 'MESSAGE_NOT_ALLOWED' using errcode = '22023',
        hint = 'Sem links, e-mails, @perfis, telefone, Pix ou cobrança na primeira mensagem.';
    end if;
  end if;

  select * into v_target from public.profiles where id = p_target;
  if not found or v_target.banned_at is not null or not v_target.is_visible
     or v_target.moderation_hidden_at is not null
     or public.is_blocked_pair(me.id, p_target) then
    raise exception 'TARGET_UNAVAILABLE' using errcode = 'P0002';
  end if;
  if v_msg is not null and not v_target.verified then
    raise exception 'TARGET_NOT_VERIFIED' using errcode = '42501',
      hint = 'Essa pessoa ainda não verificou o perfil e não recebe mensagens. Curta normalmente.';
  end if;

  if exists (select 1 from public.likes where liker_id = me.id and likee_id = p_target) then
    select id into v_match from public.matches where user_a = v_a and user_b = v_b and unmatched_at is null;
    return jsonb_build_object('matched', v_match is not null, 'match_id', v_match,
                              'remaining', public.remaining_likes(), 'duplicate', true);
  end if;

  -- Mesmo lock do swipe_pass: curtir e passar disputam a mesma cota
  perform pg_advisory_xact_lock(hashtextextended('actions:' || me.id::text, 0));

  perform public.enforce_rate_limit(me.id, 'like', interval '1 minute',
                                    coalesce((public.setting('likes_per_minute'))::int, 60));

  if v_msg is not null and (select count(*) from public.likes
       where liker_id = me.id and message is not null and created_at >= public.sp_day_start())
       >= public.message_likes_limit(me.id) then
    raise exception 'MESSAGE_LIKE_LIMIT' using errcode = 'P0003',
      hint = 'Você já usou as curtidas com mensagem de hoje. Elas renovam à meia-noite.';
  end if;

  v_left := public.actions_limit(me.id) - public.actions_used_today(me.id);
  if v_left <= 0 then
    raise exception 'ACTION_LIMIT_REACHED' using errcode = 'P0003',
      hint = 'Suas ações de hoje acabaram. Elas renovam à meia-noite.';
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

  -- Match novo entre dois verificados: os recados abrem a conversa
  if v_new and me.verified and v_target.verified then
    insert into public.messages (match_id, sender_id, body)
    select v_match, l.liker_id, l.message
      from public.likes l
      join public.profiles p on p.id = l.liker_id
     where l.message is not null
       and ((l.liker_id = me.id and l.likee_id = p_target) or (l.liker_id = p_target and l.likee_id = me.id))
       and p.banned_at is null and p.moderation_hidden_at is null
     order by l.created_at, l.liker_id;
  end if;

  return jsonb_build_object('matched', v_match is not null, 'match_id', v_match, 'remaining', v_left - 1);
end $$;

-- ---------------------------------------------------------------------
-- swipe_pass: passar também gasta ação
-- ---------------------------------------------------------------------
create or replace function public.swipe_pass(p_target uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public.require_active_user();
begin
  if p_target = me.id then
    raise exception 'INVALID_TARGET' using errcode = '22023';
  end if;
  if exists (select 1 from public.passes where passer_id = me.id and passee_id = p_target) then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('actions:' || me.id::text, 0));
  perform public.enforce_rate_limit(me.id, 'pass', interval '1 minute',
                                    coalesce((public.setting('passes_per_minute'))::int, 120));
  if public.actions_used_today(me.id) >= public.actions_limit(me.id) then
    raise exception 'ACTION_LIMIT_REACHED' using errcode = 'P0003',
      hint = 'Suas ações de hoje acabaram. Elas renovam à meia-noite.';
  end if;
  insert into public.passes (passer_id, passee_id) values (me.id, p_target)
  on conflict do nothing;
end $$;

-- ---------------------------------------------------------------------
-- Chat: só entre dois perfis verificados, sem oferta de programa
-- ---------------------------------------------------------------------
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
  if not (select verified from public.profiles where id = new.sender_id) then
    raise exception 'VERIFICATION_REQUIRED' using errcode = '42501',
      hint = 'Verifique seu perfil para conversar.';
  end if;
  if not (select verified from public.profiles where id = v_other) then
    raise exception 'OTHER_NOT_VERIFIED' using errcode = '42501',
      hint = 'A conversa abre quando a outra pessoa verificar o perfil.';
  end if;
  if public.sexual_service_signal(new.body) then
    raise exception 'MESSAGE_NOT_ALLOWED' using errcode = '22023',
      hint = 'Oferta de programa, conteúdo pago ou cobrança não é permitida no ConMatch.';
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
-- Premium só para verificado (defesa no banco; o app já trava o botão).
-- Vale para qualquer origem: loja, webhook ou cadastro manual.
-- ---------------------------------------------------------------------
create function public.check_entitlement_verified() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.premium_until is not null and new.premium_until > now()
     and not coalesce((select verified from public.profiles where id = new.user_id), false) then
    raise exception 'VERIFICATION_REQUIRED' using errcode = '42501',
      hint = 'Só perfis verificados podem assinar o Premium.';
  end if;
  return new;
end $$;

create trigger entitlements_verified_check before insert or update on public.entitlements
  for each row execute function public.check_entitlement_verified();

-- =====================================================================
-- Verificação de perfil: gesto sorteado + selfie, revisão humana
-- A selfie vai para o bucket privado "photos" na pasta do dono, mas NÃO
-- entra em public.photos, então só o service_role consegue lê-la.
-- =====================================================================
create table public.verification_requests (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  gesture     text not null,
  selfie_path text,
  status      text not null default 'aguardando_selfie'
              check (status in ('aguardando_selfie', 'pendente', 'aprovada', 'recusada')),
  note        text check (char_length(note) <= 500),
  created_at  timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  constraint verification_selfie_owner
    check (selfie_path is null or selfie_path ~ ('^' || user_id::text || '/verificacao-[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$'))
);
create index verification_open_idx on public.verification_requests (status, submitted_at) where status = 'pendente';
create unique index verification_one_open on public.verification_requests (user_id)
  where status in ('aguardando_selfie', 'pendente');
alter table public.verification_requests enable row level security;
-- sem grants: só pelas funções abaixo / service_role

create function public.verification_challenge() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public.require_active_user();
  v_req public.verification_requests;
  v_gestures text[] := array[
    'Faça um joinha com a mão direita ao lado do rosto',
    'Mostre dois dedos (sinal de paz) perto do queixo',
    'Coloque a mão aberta na testa, como quem procura algo ao longe',
    'Aponte o indicador para a bochecha esquerda',
    'Faça um "ok" com a mão perto do olho direito',
    'Mostre três dedos ao lado do rosto'
  ];
begin
  if me.verified then
    raise exception 'ALREADY_VERIFIED' using errcode = '22023';
  end if;
  if not exists (select 1 from public.photos where user_id = me.id) then
    raise exception 'PHOTO_REQUIRED' using errcode = '22023',
      hint = 'Adicione uma foto do rosto no perfil antes de verificar.';
  end if;
  select * into v_req from public.verification_requests
   where user_id = me.id and status in ('aguardando_selfie', 'pendente');
  if found then
    return jsonb_build_object('id', v_req.id, 'gesture', v_req.gesture, 'status', v_req.status);
  end if;
  if (select count(*) from public.verification_requests
       where user_id = me.id and created_at >= public.sp_day_start())
       >= coalesce((public.setting('verification_requests_per_day'))::int, 3) then
    raise exception 'RATE_LIMITED' using errcode = '53400',
      hint = 'Muitas tentativas hoje. Tente de novo amanhã.';
  end if;
  insert into public.verification_requests (user_id, gesture)
  values (me.id, v_gestures[1 + floor(random() * array_length(v_gestures, 1))::int])
  returning * into v_req;
  return jsonb_build_object('id', v_req.id, 'gesture', v_req.gesture, 'status', v_req.status);
end $$;

create function public.submit_verification(p_selfie_path text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public.require_active_user();
  v_req public.verification_requests;
begin
  select * into v_req from public.verification_requests
   where user_id = me.id and status = 'aguardando_selfie' for update;
  if not found then
    raise exception 'NO_VERIFICATION_CHALLENGE' using errcode = '22023';
  end if;
  update public.verification_requests
     set selfie_path = p_selfie_path, status = 'pendente', submitted_at = now()
   where id = v_req.id;
  insert into public.security_alerts (kind, subject_id, data)
  values ('verification_request', me.id, jsonb_build_object('request_id', v_req.id));
  return jsonb_build_object('id', v_req.id, 'status', 'pendente');
end $$;

-- Suporte (service_role): aprova ou recusa. Aprovada uma vez, vale para sempre.
create function public.moderation_review_verification(p_request bigint, p_approve boolean, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_req public.verification_requests;
begin
  select * into v_req from public.verification_requests where id = p_request and status = 'pendente' for update;
  if not found then
    raise exception 'REQUEST_NOT_PENDING' using errcode = '22023';
  end if;
  update public.verification_requests
     set status = case when p_approve then 'aprovada' else 'recusada' end,
         note = p_note, reviewed_at = now()
   where id = p_request;
  if p_approve then
    update public.profiles set verified = true where id = v_req.user_id;
  end if;
  update public.security_alerts set resolved_at = now()
   where kind = 'verification_request' and subject_id = v_req.user_id and resolved_at is null;
  insert into public.audit_logs (actor_id, action, target_id, data)
  values (null, case when p_approve then 'verification_approved' else 'verification_rejected' end,
          v_req.user_id, jsonb_build_object('request_id', p_request, 'note', p_note));
end $$;

-- =====================================================================
-- Denúncia com evidência + recurso + decisão do suporte
-- =====================================================================
alter table public.reports add column evidence jsonb;

create table public.moderation_appeals (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  message     text not null check (char_length(btrim(message)) between 10 and 1000),
  status      text not null default 'aberto' check (status in ('aberto', 'aceito', 'recusado')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index appeals_one_open on public.moderation_appeals (user_id) where status = 'aberto';
alter table public.moderation_appeals enable row level security;
-- sem grants: só pelas funções abaixo / service_role

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
  v_keep       int := coalesce((public.setting('report_evidence_messages'))::int, 200);
  v_trusted    int;
  v_minor      int;
  v_24h        int;
  v_pair_match uuid;
  v_evidence   jsonb;
begin
  if p_target = me.id then
    raise exception 'INVALID_TARGET' using errcode = '22023';
  end if;
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

  -- Evidência: SÓ a conversa entre denunciante e denunciado (nunca outras)
  -- e o recado da curtida, congelados antes do bloqueio desfazer o match.
  select id into v_pair_match from public.matches
   where user_a = least(me.id, p_target) and user_b = greatest(me.id, p_target);
  v_evidence := jsonb_build_object(
    'captured_at', now(),
    'like_message', (select message from public.likes where liker_id = p_target and likee_id = me.id),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('from', case when x.sender_id = me.id then 'denunciante' else 'denunciado' end,
                                          'body', x.body, 'at', x.created_at) order by x.id)
        from (select * from public.messages where match_id = v_pair_match order by id desc limit v_keep) x
    ), '[]'::jsonb)
  );

  insert into public.reports (reporter_id, reported_id, reason, details, match_id, evidence)
  values (me.id, p_target, p_reason, nullif(btrim(p_details), ''), coalesce(p_match, v_pair_match), v_evidence)
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
  elsif p_reason::text = 'servico_sexual_ou_cobranca' then
    insert into public.security_alerts (kind, subject_id, data)
    values ('sexual_service_report', p_target, jsonb_build_object('report_id', v_id));
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

-- O que a própria pessoa vê sobre si (nunca quem denunciou nem o motivo)
create function public.my_moderation_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me public.profiles := public.require_active_user();
begin
  return jsonb_build_object(
    'verified', me.verified,
    'verification', (select jsonb_build_object('status', v.status, 'gesture', v.gesture, 'note', v.note)
                       from public.verification_requests v where v.user_id = me.id
                      order by v.created_at desc limit 1),
    'under_review', me.moderation_hidden_at is not null,
    'under_review_since', me.moderation_hidden_at,
    'appeal', (select jsonb_build_object('status', a.status, 'at', a.created_at)
                 from public.moderation_appeals a where a.user_id = me.id
                order by a.created_at desc limit 1)
  );
end $$;

create function public.submit_appeal(p_message text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public.require_active_user();
begin
  if me.moderation_hidden_at is null then
    raise exception 'NOT_UNDER_REVIEW' using errcode = '22023';
  end if;
  if exists (select 1 from public.moderation_appeals where user_id = me.id and status = 'aberto') then
    raise exception 'APPEAL_ALREADY_OPEN' using errcode = '22023';
  end if;
  insert into public.moderation_appeals (user_id, message) values (me.id, btrim(p_message));
  insert into public.security_alerts (kind, subject_id, data)
  values ('appeal', me.id, jsonb_build_object('at', now()));
end $$;

-- Suporte (service_role): decide com base nas evidências e no recurso
create function public.moderation_resolve(p_user uuid, p_decision text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_decision not in ('restaurar', 'banir') then
    raise exception 'INVALID_DECISION' using errcode = '22023';
  end if;
  if p_decision = 'restaurar' then
    update public.profiles set moderation_hidden_at = null where id = p_user;
  else
    update public.profiles set banned_at = coalesce(banned_at, now()) where id = p_user;
  end if;
  update public.reports
     set status = case when p_decision = 'banir' then 'procedente' else 'improcedente' end::public.report_status,
         resolved_at = now()
   where reported_id = p_user and status in ('aberta', 'em_analise');
  update public.moderation_appeals
     set status = case when p_decision = 'restaurar' then 'aceito' else 'recusado' end, resolved_at = now()
   where user_id = p_user and status = 'aberto';
  update public.security_alerts set resolved_at = now()
   where subject_id = p_user and resolved_at is null
     and kind in ('auto_hide', 'report_spike', 'minor_report', 'sexual_service_report', 'appeal');
  insert into public.audit_logs (actor_id, action, target_id, data)
  values (null, 'moderation_' || p_decision, p_user, jsonb_build_object('note', p_note));
end $$;

-- Portabilidade: + recursos e pedidos de verificação
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
    'appeals',      coalesce((select jsonb_agg(jsonb_build_object('message', message, 'status', status, 'at', created_at))
                              from public.moderation_appeals where user_id = v_uid), '[]'),
    'verification', coalesce((select jsonb_agg(jsonb_build_object('status', status, 'at', created_at, 'reviewed_at', reviewed_at))
                              from public.verification_requests where user_id = v_uid), '[]'),
    'subscription', (select to_jsonb(e) - 'user_id' from public.entitlements e where e.user_id = v_uid)
  );
end $$;

-- ---------------------------------------------------------------------
-- Privilégios
-- ---------------------------------------------------------------------
revoke all on function
  public.my_limits(), public.my_moderation_status(), public.submit_appeal(text),
  public.verification_challenge(), public.submit_verification(text)
from public, anon;
grant execute on function
  public.my_limits(), public.my_moderation_status(), public.submit_appeal(text),
  public.verification_challenge(), public.submit_verification(text)
to authenticated;

-- Internas e de uso exclusivo do suporte (service_role)
revoke all on function
  public.sexual_service_signal(text), public.sexual_service_signal_strict(text), public.bio_allowed(text),
  public.check_profile_bio(), public.check_entitlement_verified(),
  public.actions_used_today(uuid), public.actions_limit(uuid), public.message_likes_limit(uuid),
  public.moderation_review_verification(bigint, boolean, text), public.moderation_resolve(uuid, text, text)
from public, anon, authenticated;
