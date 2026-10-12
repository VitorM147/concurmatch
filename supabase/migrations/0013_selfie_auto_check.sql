-- =====================================================================
-- 0013 — Verificação de selfie automática (AWS Rekognition)
--
-- O "gesto" vira um desafio de rosto que a máquina consegue conferir
-- (sorrir, ficar sério, abrir a boca, virar o rosto). A Edge Function
-- selfie-check (DetectFaces + CompareFaces) decide e chama
-- apply_verification_result():
--   aprovar → verificado na hora (e denúncias de perfil falso caem)
--   recusar → a pessoa tenta de novo com a orientação recebida;
--             na 3ª recusa em 24h o caso vai para uma pessoa
--   revisar → fica para uma pessoa (ex.: idade aparente abaixo de 18)
-- Sem as chaves da AWS configuradas, tudo continua como antes: a selfie
-- aparece no painel do suporte.
-- =====================================================================

alter table public.verification_requests
  add column challenge_code  text,
  add column auto_result     jsonb,
  add column auto_checked_at timestamptz,
  add column needs_human     boolean not null default false;

create index verification_auto_pending_idx on public.verification_requests (submitted_at)
  where status = 'pendente' and auto_checked_at is null and not needs_human;

-- Desafios que o DetectFaces consegue conferir (o robô usa os mesmos códigos)
create function public.verification_challenges() returns table (code text, label text)
language sql immutable as $$
  values
    ('sorriso_lado',   'Sorria mostrando os dentes e vire o rosto um pouco para o lado'),
    ('sorriso_frente', 'Sorria mostrando os dentes, olhando reto para a câmera'),
    ('serio_lado',     'Fique sério, de boca fechada, e vire o rosto um pouco para o lado'),
    ('boca_aberta',    'Abra a boca, como quem fala "á", olhando para a câmera'),
    ('serio_cima',     'Fique sério e levante um pouco o queixo')
$$;

create or replace function public.verification_challenge() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public.require_active_user();
  v_req public.verification_requests;
  v_code text;
  v_label text;
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
  select c.code, c.label into v_code, v_label
    from public.verification_challenges() c order by random() limit 1;
  insert into public.verification_requests (user_id, gesture, challenge_code)
  values (me.id, v_label, v_code)
  returning * into v_req;
  return jsonb_build_object('id', v_req.id, 'gesture', v_req.gesture, 'status', v_req.status);
end $$;

-- O que o robô precisa: selfie, desafio e as fotos do perfil
create function public.verification_auto_pending(p_limit integer default 10) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', v.id, 'user_id', v.user_id, 'challenge', v.challenge_code, 'label', v.gesture,
           'selfie', v.selfie_path,
           'photos', to_jsonb(array(select ph.storage_path from public.photos ph
                                     where ph.user_id = v.user_id and ph.approved
                                     order by ph.position limit 3)))
         order by v.submitted_at), '[]'::jsonb)
  from (select * from public.verification_requests
         where status = 'pendente' and auto_checked_at is null and not needs_human
           and selfie_path is not null
         order by submitted_at limit least(greatest(p_limit, 1), 50)) v
$$;

create function public.apply_verification_result(p_request bigint, p_decision text, p_note text default null,
                                                  p_result jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_req public.verification_requests;
  v_decision text := p_decision;
  v_recent int;
begin
  if p_decision not in ('aprovar', 'recusar', 'revisar') then
    raise exception 'INVALID_DECISION' using errcode = '22023';
  end if;
  select * into v_req from public.verification_requests
   where id = p_request and status = 'pendente' for update;
  if not found or v_req.auto_checked_at is not null then
    return jsonb_build_object('decision', 'ignorada');
  end if;

  -- 3ª recusa automática em 24h: chama uma pessoa em vez de recusar de novo
  if v_decision = 'recusar' then
    select count(*) into v_recent from public.verification_requests
     where user_id = v_req.user_id and status = 'recusada' and auto_checked_at is not null
       and reviewed_at > now() - interval '24 hours';
    if v_recent >= 2 then
      v_decision := 'revisar';
    end if;
  end if;

  update public.verification_requests
     set auto_result = p_result, auto_checked_at = now(), needs_human = (v_decision = 'revisar')
   where id = p_request;

  if v_decision = 'aprovar' then
    perform public.moderation_review_verification(p_request, true, p_note);
  elsif v_decision = 'recusar' then
    perform public.moderation_review_verification(p_request, false, p_note);
  end if;
  insert into public.audit_logs (actor_id, action, target_id, data)
  values (null, 'auto_verification', v_req.user_id,
          jsonb_build_object('request_id', p_request, 'decision', v_decision, 'note', p_note));
  return jsonb_build_object('decision', v_decision);
end $$;

revoke all on function
  public.verification_challenges(), public.verification_auto_pending(integer),
  public.apply_verification_result(bigint, text, text, jsonb)
from public, anon, authenticated;
