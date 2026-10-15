-- 0019 — Operações duráveis do beta: fotos, alertas e exclusão de conta.
-- Implantar as funções atualizadas junto desta migration (ver docs/BETA.md).
alter table public.photos alter column approved set default false;
-- Fotos anteriores que nunca foram analisadas voltam à fila; não as publica por omissão.
update public.photos set approved = false where auto_checked_at is null;

create table public.file_cleanup_jobs (
  path text primary key,
  created_at timestamptz not null default now()
);
alter table public.file_cleanup_jobs enable row level security;

create function public.can_upload_photo_path(p_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and split_part(p_path, '/', 1) = auth.uid()::text
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.banned_at is null)
    and not exists (select 1 from public.photos ph where ph.storage_path = p_path)
    and not exists (select 1 from public.verification_requests v where v.selfie_path = p_path)
    and not exists (select 1 from public.file_cleanup_jobs j where j.path = p_path)
$$;

create function public.reset_photo_review() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.file_cleanup_jobs j where j.path = new.storage_path) then
    raise exception 'PHOTO_PATH_RETIRED';
  end if;
  if tg_op = 'INSERT' then return new; end if;
  if old.storage_path is distinct from new.storage_path then
    new.approved := false; new.auto_checked_at := null; new.auto_scores := null;
  end if;
  return new;
end $$;
create trigger photo_content_changed before insert or update of storage_path on public.photos
  for each row execute function public.reset_photo_review();

create function public.enqueue_removed_photo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' or old.storage_path is distinct from new.storage_path then
    insert into public.file_cleanup_jobs(path) values (old.storage_path) on conflict do nothing;
    -- Uma verificação anterior não autentica o rosto de uma foto substituída.
    update public.profiles set verified = false where id = old.user_id;
    update public.verification_requests set status = 'recusada', reviewed_at = now(),
      note = 'As fotos do perfil mudaram. Faça uma nova verificação.'
      where user_id = old.user_id and status in ('pendente', 'aguardando_selfie');
  end if;
  return null;
end $$;
create trigger photo_file_cleanup after delete or update of storage_path on public.photos
  for each row execute function public.enqueue_removed_photo();

create function public.enqueue_reviewed_selfie() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.selfie_path is not null and (tg_op = 'DELETE' or new.status in ('aprovada', 'recusada')) then
    insert into public.file_cleanup_jobs(path) values (old.selfie_path) on conflict do nothing;
  end if;
  return null;
end $$;
create trigger selfie_file_cleanup after delete or update of status on public.verification_requests
  for each row execute function public.enqueue_reviewed_selfie();

create function public.replace_my_photo(p_path text, p_position smallint) returns void
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public.require_active_user();
begin
  insert into public.photos(user_id, storage_path, position) values (me.id, p_path, p_position)
  on conflict (user_id, position) do update set storage_path = excluded.storage_path;
end $$;

-- Preserve o comportamento de ocultação/alertas de 0016, aprovando explicitamente
-- quando a análise for positiva. Uma tentativa repetida não reverte uma decisão.
create or replace function public.apply_photo_check(p_photo uuid, p_flagged boolean, p_reason text default null,
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
         approved = not p_flagged
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

create function public.admin_pending_photos() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return coalesce((select jsonb_agg(to_jsonb(q)) from (
    select ph.id, ph.user_id, ph.storage_path as path, ph.created_at, p.display_name as name
      from public.photos ph join public.profiles p on p.id = ph.user_id
     where ph.auto_checked_at is null and p.banned_at is null
     order by ph.created_at limit 100
  ) q), '[]'::jsonb);
end $$;
create function public.admin_review_photo(p_photo uuid, p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare admin_id uuid := public.require_admin(); ph public.photos;
begin
  if p_note is null or char_length(btrim(p_note)) < 3 then raise exception 'NOTE_REQUIRED'; end if;
  select * into ph from public.photos where id = p_photo for update;
  if not found or ph.auto_checked_at is not null then raise exception 'PHOTO_ALREADY_REVIEWED'; end if;
  perform public.apply_photo_check(p_photo, not p_approve, case when not p_approve then 'revisao_manual' end,
    jsonb_build_object('manual', true));
  insert into public.audit_logs(actor_id, action, target_id, data)
    values (admin_id, 'admin_photo_review', ph.user_id, jsonb_build_object('photo_id', ph.id, 'approved', p_approve, 'note', btrim(p_note)));
end $$;

-- Alertas: reserva temporária, envio externo e confirmação explícita.
alter table public.security_alerts add column delivery_token uuid,
  add column delivery_until timestamptz,
  add column delivery_attempts integer not null default 0,
  add column next_delivery_at timestamptz;
create or replace function public.alerts_to_notify(p_limit integer default 50) returns jsonb
language plpgsql security definer set search_path = public as $$
declare token uuid := gen_random_uuid(); result jsonb;
begin
  with picked as (
    select id from public.security_alerts
     where notified_at is null and resolved_at is null
       and (delivery_until is null or delivery_until < now())
       and (next_delivery_at is null or next_delivery_at <= now())
       and kind in ('minor_report', 'sexual_service_report', 'auto_hide', 'appeal', 'photo_flagged', 'report_spike')
     order by created_at limit least(greatest(p_limit, 1), 200) for update skip locked
  ), claimed as (
    update public.security_alerts a set delivery_token = token, delivery_until = now() + interval '5 minutes'
      from picked where a.id = picked.id returning a.id, a.kind, a.created_at
  ) select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'at', created_at, 'token', token)), '[]'::jsonb)
    into result from claimed;
  return result;
end $$;
create function public.ack_alert_delivery(p_ids bigint[], p_token uuid, p_delivered boolean) returns void
language sql security definer set search_path = public as $$
  update public.security_alerts set
    notified_at = case when p_delivered then now() else notified_at end,
    delivery_attempts = delivery_attempts + 1,
    next_delivery_at = case when p_delivered then null else now() + interval '5 minutes' end,
    delivery_token = null, delivery_until = null
  where id = any(p_ids) and delivery_token = p_token and notified_at is null
$$;

-- A solicitação é atômica. Oculta e bloqueia ações imediatamente, sem apagar a
-- identidade antes de o Storage confirmar a remoção dos arquivos.
create table public.account_deletion_jobs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  claim_token uuid, claim_until timestamptz, next_attempt_at timestamptz,
  attempts integer not null default 0
);
alter table public.account_deletion_jobs enable row level security;
create function public.request_account_deletion() returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  insert into public.account_deletion_jobs(user_id) values (uid) on conflict do nothing;
  if not found then return; end if;
  update public.profiles set is_visible = false, banned_at = coalesce(banned_at, now()),
    moderation_hidden_at = coalesce(moderation_hidden_at, now()) where id = uid;
  insert into public.audit_logs(actor_id, action) values (null, 'account_deletion_requested');
end $$;
-- Clientes antigos também passam pela fila durável.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
begin perform public.request_account_deletion(); end $$;

create function public.deletion_jobs_pending(p_limit integer default 3) returns jsonb
language plpgsql security definer set search_path = public as $$
declare token uuid := gen_random_uuid(); result jsonb;
begin
  with picked as (
    select user_id from public.account_deletion_jobs
     where (claim_until is null or claim_until < now()) and (next_attempt_at is null or next_attempt_at <= now())
     order by requested_at limit least(greatest(p_limit, 1), 10) for update skip locked
  ), claimed as (
    update public.account_deletion_jobs j set claim_token = token, claim_until = now() + interval '5 minutes'
      from picked where j.user_id = picked.user_id returning j.user_id
  ) select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'token', token)), '[]'::jsonb) into result from claimed;
  return result;
end $$;
create function public.retry_account_deletion(p_user uuid, p_token uuid) returns void
language sql security definer set search_path = public as $$
  update public.account_deletion_jobs set claim_token = null, claim_until = null,
    attempts = attempts + 1, next_attempt_at = now() + interval '5 minutes'
   where user_id = p_user and claim_token = p_token
$$;
create function public.file_cleanup_pending(p_limit integer default 100) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(path), '[]'::jsonb) from (
    select j.path from public.file_cleanup_jobs j
     where not exists (select 1 from public.photos p where p.storage_path = j.path)
       and not exists (select 1 from public.verification_requests v where v.selfie_path = j.path and v.status in ('pendente', 'aguardando_selfie'))
     order by j.created_at limit least(greatest(p_limit, 1), 100)
  ) jobs
$$;
create function public.ack_file_cleanup(p_paths text[]) returns void
language sql security definer set search_path = public as $$
  delete from public.file_cleanup_jobs where path = any(p_paths)
$$;

revoke all on function public.reset_photo_review(), public.enqueue_removed_photo(), public.enqueue_reviewed_selfie(),
  public.ack_alert_delivery(bigint[], uuid, boolean), public.deletion_jobs_pending(integer),
  public.retry_account_deletion(uuid, uuid), public.file_cleanup_pending(integer), public.ack_file_cleanup(text[])
from public, anon, authenticated;
revoke all on function public.replace_my_photo(text, smallint), public.admin_pending_photos(),
  public.admin_review_photo(uuid, boolean, text), public.request_account_deletion(), public.can_upload_photo_path(text) from public, anon;
grant execute on function public.replace_my_photo(text, smallint), public.admin_pending_photos(),
  public.admin_review_photo(uuid, boolean, text), public.request_account_deletion(), public.can_upload_photo_path(text) to authenticated;
