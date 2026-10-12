-- =====================================================================
-- 0016 — Correções da auditoria ESAA-Security RUN-SEC-0003
-- (código novo das migrations 0008–0015, robôs, painel e site)
-- Provas de conceito: security/reports/phase2/evidence/run3-baseline-poc.txt
-- =====================================================================

insert into public.app_config (key, value, description) values
  ('admin_requires_mfa',        'true', 'Painel do suporte só com segundo fator (sessão aal2)'),
  ('waitlist_per_ip_hour',      '5',    'Inscrições por hora vindas do mesmo IP na lista de espera'),
  ('waitlist_per_minute',       '1000', 'Disjuntor global da lista de espera (anti-robô distribuído)'),
  ('waitlist_ip_salt',          to_jsonb(gen_random_uuid()::text), 'Sal do hash de IP da lista de espera (não é segredo de login)'),
  ('retention_waitlist_days',   '365',  'Dias para apagar inscrições antigas da lista de espera'),
  ('retention_waitlist_ip_days','30',   'Dias para apagar o hash de IP das inscrições'),
  ('retention_verification_days','90',  'Dias para apagar pedidos de verificação recusados')
on conflict (key) do update set value = excluded.value, description = excluded.description;

-- ---------------------------------------------------------------------
-- AZ-004 / AU-003 — Painel do suporte exige segundo fator (PoC E3)
-- Antes: login só com senha bastava para banir e ver selfies.
-- is_admin() também protege a policy de leitura de selfies no Storage.
-- ---------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
     and (coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
          or coalesce((public.setting('admin_requires_mfa'))::boolean, true) = false)
$$;

create or replace function public.require_admin() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if not public.is_admin() then
    raise exception 'MFA_REQUIRED' using errcode = '42501',
      hint = 'Entre no painel com o segundo fator (aplicativo autenticador).';
  end if;
  return auth.uid();
end $$;

-- O painel pergunta se a conta é admin antes de pedir o código (sem expor nada)
create function public.admin_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'admin', exists (select 1 from public.admins where user_id = auth.uid()),
    'mfa_ok', public.is_admin())
$$;

-- ---------------------------------------------------------------------
-- BL-001 / FU-006 — Selfie tem que existir e ser enviada DEPOIS do
-- desafio (PoC E4 e E5). Antes: dava para mandar foto antiga da galeria,
-- renomeada, ou um caminho que nem existia.
-- No Supabase o arquivo fica em storage.objects; o teste local cria uma
-- tabela equivalente (to_regclass decide em tempo de execução).
-- ---------------------------------------------------------------------
create or replace function public.submit_verification(p_selfie_path text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public.require_active_user();
  v_req public.verification_requests;
  v_uploaded timestamptz;
begin
  select * into v_req from public.verification_requests
   where user_id = me.id and status = 'aguardando_selfie' for update;
  if not found then
    raise exception 'NO_VERIFICATION_CHALLENGE' using errcode = '22023';
  end if;
  if to_regclass('storage.objects') is not null then
    execute 'select created_at from storage.objects where bucket_id = $1 and name = $2'
       into v_uploaded using 'photos', p_selfie_path;
    if v_uploaded is null then
      raise exception 'SELFIE_NOT_FOUND' using errcode = '22023',
        hint = 'Não encontramos a selfie enviada. Tire a foto de novo.';
    end if;
    if v_uploaded < v_req.created_at then
      raise exception 'SELFIE_TOO_OLD' using errcode = '22023',
        hint = 'A selfie precisa ser tirada agora, depois de ver o pedido.';
    end if;
  end if;
  update public.verification_requests
     set selfie_path = p_selfie_path, status = 'pendente', submitted_at = now()
   where id = v_req.id;
  insert into public.security_alerts (kind, subject_id, data)
  values ('verification_request', me.id, jsonb_build_object('request_id', v_req.id));
  return jsonb_build_object('id', v_req.id, 'status', 'pendente');
end $$;

-- ---------------------------------------------------------------------
-- BL-002 / BL-004 / DA — Lista de espera (PoC E1 e E2)
-- Antes: qualquer pessoa trocava a cidade e o gênero de outra pelo
-- e-mail, e um robô esgotava o limite global e travava o site.
-- Agora: e-mail repetido não altera nada (e a resposta é a mesma, para
-- não revelar quem está na lista), campo-isca contra robôs e limite por
-- IP (guardamos só o hash, apagado em 30 dias).
-- ---------------------------------------------------------------------
alter table public.waitlist add column ip_hash text;
create index waitlist_ip_idx on public.waitlist (ip_hash, created_at) where ip_hash is not null;

create function public.request_ip_hash() returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_headers jsonb;
  v_ip text;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;
  v_ip := btrim(split_part(coalesce(v_headers ->> 'cf-connecting-ip', v_headers ->> 'x-forwarded-for', ''), ',', 1));
  if v_ip = '' then
    return null;
  end if;
  return encode(sha256(convert_to(v_ip || coalesce(public.setting('waitlist_ip_salt') #>> '{}', ''), 'UTF8')), 'hex');
end $$;

drop function public.join_waitlist(text, text, text, text, boolean);

create function public.join_waitlist(p_email text, p_state text, p_city text, p_gender text default null,
                                     p_consent boolean default false, p_website text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_city  text := initcap(btrim(regexp_replace(coalesce(p_city, ''), '\s+', ' ', 'g')));
  v_state text := upper(btrim(coalesce(p_state, '')));
  v_ip    text := public.request_ip_hash();
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

  -- Campo-isca preenchido = robô: responde igual, não grava nada
  if nullif(btrim(coalesce(p_website, '')), '') is not null then
    return jsonb_build_object('ok', true, 'city_total',
      (select count(*) from public.waitlist where state = v_state and city = v_city));
  end if;

  if v_ip is not null and (select count(*) from public.waitlist
       where ip_hash = v_ip and created_at > now() - interval '1 hour')
       >= coalesce((public.setting('waitlist_per_ip_hour'))::int, 5) then
    raise exception 'RATE_LIMITED' using errcode = '53400',
      hint = 'Muitas inscrições desta conexão. Tente de novo mais tarde.';
  end if;
  if (select count(*) from public.waitlist where created_at > now() - interval '1 minute')
       >= coalesce((public.setting('waitlist_per_minute'))::int, 1000) then
    raise exception 'RATE_LIMITED' using errcode = '53400';
  end if;

  insert into public.waitlist (email, state, city, gender, ip_hash)
  values (v_email, v_state, v_city, p_gender::public.gender, v_ip)
  on conflict (lower(email)) do nothing;

  select count(*) into v_count from public.waitlist where state = v_state and city = v_city;
  return jsonb_build_object('ok', true, 'city_total', v_count);
end $$;

-- ---------------------------------------------------------------------
-- FU-001 / FU-004 — Fotos conferidas pelo robô (tipo real do arquivo +
-- Moderation API). Antes: nada olhava o conteúdo das fotos.
-- Foto reprovada sai do perfil; sinal de menor de idade esconde o perfil.
-- ---------------------------------------------------------------------
alter table public.photos
  add column auto_checked_at timestamptz,
  add column auto_scores     jsonb;
create index photos_check_pending_idx on public.photos (created_at) where auto_checked_at is null;

alter table public.security_alerts drop constraint if exists security_alerts_kind_check;
alter table public.security_alerts add constraint security_alerts_kind_check
  check (kind in ('minor_report', 'report_spike', 'auto_hide', 'rate_limit',
                  'sexual_service_report', 'appeal', 'verification_request', 'photo_flagged'));

create function public.photo_check_pending(p_limit integer default 20) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', ph.id, 'user_id', ph.user_id, 'path', ph.storage_path)
                            order by ph.created_at), '[]'::jsonb)
  from (select * from public.photos where auto_checked_at is null
         order by created_at limit least(greatest(p_limit, 1), 50)) ph
$$;

create function public.apply_photo_check(p_photo uuid, p_flagged boolean, p_reason text default null,
                                         p_scores jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ph public.photos;
begin
  select * into ph from public.photos where id = p_photo for update;
  if not found or ph.auto_checked_at is not null then
    return jsonb_build_object('action', 'ignorada');
  end if;
  update public.photos
     set auto_checked_at = now(), auto_scores = p_scores,
         approved = case when p_flagged then false else approved end
   where id = ph.id;
  if not p_flagged then
    return jsonb_build_object('action', 'aprovada');
  end if;
  insert into public.security_alerts (kind, subject_id, data)
  values ('photo_flagged', ph.user_id, jsonb_build_object('photo_id', ph.id, 'reason', p_reason));
  if p_reason = 'menor' then
    update public.profiles set moderation_hidden_at = coalesce(moderation_hidden_at, now())
     where id = ph.user_id and banned_at is null;
    insert into public.reports (reporter_id, reported_id, reason, details, evidence)
    values (null, ph.user_id, 'menor_de_idade', 'Sinal automático na foto do perfil',
            jsonb_build_object('photo_id', ph.id, 'automatic', true));
  end if;
  insert into public.audit_logs (actor_id, action, target_id, data)
  values (null, 'auto_photo_flag', ph.user_id, jsonb_build_object('photo_id', ph.id, 'reason', p_reason));
  return jsonb_build_object('action', 'reprovada', 'reason', p_reason);
end $$;

-- ---------------------------------------------------------------------
-- LM-004 — Canal de notificação dos alertas. O robô manda um resumo
-- (sem conteúdo de conversa) para o webhook do suporte e marca o envio.
-- ---------------------------------------------------------------------
alter table public.security_alerts add column notified_at timestamptz;

create function public.alerts_to_notify(p_limit integer default 50) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
begin
  with picked as (
    select id from public.security_alerts
     where notified_at is null and resolved_at is null
       and kind in ('minor_report', 'sexual_service_report', 'auto_hide', 'appeal', 'photo_flagged', 'report_spike')
     order by created_at
     limit least(greatest(p_limit, 1), 200)
     for update skip locked
  ), upd as (
    update public.security_alerts a set notified_at = now()
      from picked where a.id = picked.id
    returning a.kind, a.created_at
  )
  select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'at', created_at) order by created_at), '[]'::jsonb)
    into v from upd;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- DA-003 — Retenção dos dados novos (lista de espera, hash de IP e
-- pedidos de verificação recusados)
-- ---------------------------------------------------------------------
create or replace function public.purge_expired_data() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_unmatched int; v_passes int; v_audit int; v_reports int; v_alerts int;
  v_wait int; v_ip int; v_verif int;
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

  delete from public.waitlist
   where created_at < now() - make_interval(days => coalesce((public.setting('retention_waitlist_days'))::int, 365));
  get diagnostics v_wait = row_count;

  update public.waitlist set ip_hash = null
   where ip_hash is not null
     and created_at < now() - make_interval(days => coalesce((public.setting('retention_waitlist_ip_days'))::int, 30));
  get diagnostics v_ip = row_count;

  delete from public.verification_requests
   where status = 'recusada'
     and reviewed_at < now() - make_interval(days => coalesce((public.setting('retention_verification_days'))::int, 90));
  get diagnostics v_verif = row_count;

  insert into public.audit_logs (actor_id, action, data)
  values (null, 'retention_purge', jsonb_build_object('matches', v_unmatched, 'passes', v_passes,
          'audit_logs', v_audit, 'reports', v_reports, 'alerts', v_alerts,
          'waitlist', v_wait, 'waitlist_ip', v_ip, 'verification', v_verif));
  return jsonb_build_object('matches', v_unmatched, 'passes', v_passes, 'audit_logs', v_audit,
                            'reports', v_reports, 'alerts', v_alerts,
                            'waitlist', v_wait, 'waitlist_ip', v_ip, 'verification', v_verif);
end $$;

-- ---------------------------------------------------------------------
-- Privilégios
-- ---------------------------------------------------------------------
revoke all on function public.join_waitlist(text, text, text, text, boolean, text) from public;
grant execute on function public.join_waitlist(text, text, text, text, boolean, text) to anon, authenticated;

revoke all on function public.admin_status() from public, anon;
grant execute on function public.admin_status() to authenticated;

revoke all on function
  public.request_ip_hash(),
  public.photo_check_pending(integer),
  public.apply_photo_check(uuid, boolean, text, jsonb),
  public.alerts_to_notify(integer),
  public.purge_expired_data()
from public, anon, authenticated;
