-- =====================================================================
-- 0012 — Painel do suporte + compromisso com as regras da comunidade
--
-- * public.admins: quem pode usar o painel (apps/admin). Entra por SQL:
--     insert into public.admins (user_id) values ('<uuid do usuário>');
-- * Funções admin_*: o painel usa o login normal do Supabase; cada função
--   confere is_admin() e registra quem decidiu em audit_logs.
-- * Cadastro exige o aceite das regras da comunidade (4º consentimento).
-- =====================================================================

create table public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
-- sem grants: ninguém lê nem altera pelo app

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;

create function public.require_admin() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  return auth.uid();
end $$;

-- Fila do que precisa de decisão humana (mais grave primeiro)
create function public.admin_queue() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return public.moderation_queue();
end $$;

-- Tudo de um caso, para decidir com contexto
create function public.admin_case(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p public.profiles;
begin
  perform public.require_admin();
  select * into p from public.profiles where id = p_user;
  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'profile', jsonb_build_object(
      'id', p.id, 'nome', p.display_name, 'idade', public.age_years(p.birthdate),
      'cidade', p.city || '/' || p.state, 'bio', p.bio, 'verificado', p.verified,
      'escondido_desde', p.moderation_hidden_at, 'banido_em', p.banned_at, 'criado_em', p.created_at),
    'fotos', coalesce((select jsonb_agg(jsonb_build_object('path', ph.storage_path, 'aprovada', ph.approved) order by ph.position)
                         from public.photos ph where ph.user_id = p.id), '[]'),
    'denuncias', coalesce((select jsonb_agg(jsonb_build_object(
                             'id', r.id, 'motivo', r.reason, 'detalhes', r.details, 'em', r.created_at,
                             'status', r.status, 'gravidade', r.auto_severity,
                             'sinais', r.auto_scores->'reasons', 'evidencia', r.evidence) order by r.created_at desc)
                             from public.reports r where r.reported_id = p.id), '[]'),
    'recursos', coalesce((select jsonb_agg(jsonb_build_object('mensagem', a.message, 'status', a.status, 'em', a.created_at)
                                order by a.created_at desc)
                            from public.moderation_appeals a where a.user_id = p.id), '[]'),
    'verificacao', (select jsonb_build_object('id', v.id, 'gesto', v.gesture, 'selfie', v.selfie_path,
                                              'status', v.status, 'nota', v.note, 'enviada_em', v.submitted_at)
                      from public.verification_requests v where v.user_id = p.id
                     order by v.created_at desc limit 1)
  );
end $$;

create function public.admin_resolve(p_user uuid, p_decision text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.require_admin();
begin
  if p_note is null or char_length(btrim(p_note)) < 3 then
    raise exception 'NOTE_REQUIRED' using errcode = '22023', hint = 'Escreva o motivo da decisão.';
  end if;
  perform public.moderation_resolve(p_user, p_decision, p_note);
  insert into public.audit_logs (actor_id, action, target_id, data)
  values (v_admin, 'admin_' || p_decision, p_user, jsonb_build_object('note', p_note));
end $$;

create function public.admin_review_selfie(p_request bigint, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.require_admin();
  v_user uuid;
begin
  select user_id into v_user from public.verification_requests where id = p_request;
  perform public.moderation_review_verification(p_request, p_approve, p_note);
  insert into public.audit_logs (actor_id, action, target_id, data)
  values (v_admin, case when p_approve then 'admin_selfie_approved' else 'admin_selfie_rejected' end,
          v_user, jsonb_build_object('request_id', p_request, 'note', p_note));
end $$;

-- ---------------------------------------------------------------------
-- Compromisso com as regras da comunidade
-- ---------------------------------------------------------------------
alter table public.consents drop constraint if exists consents_kind_check;
alter table public.consents add constraint consents_kind_check
  check (kind in ('termos', 'privacidade', 'dados_sensiveis', 'regras_comunidade'));

create or replace function public.require_consents() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(distinct kind) from public.consents
       where user_id = new.id
         and kind in ('termos', 'privacidade', 'dados_sensiveis', 'regras_comunidade')) < 4 then
    raise exception 'CONSENT_REQUIRED' using errcode = '42501',
      hint = 'Aceite os termos, a política de privacidade, o uso de dados sensíveis e as regras da comunidade.';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Privilégios
-- ---------------------------------------------------------------------
revoke all on function
  public.is_admin(), public.require_admin(), public.admin_queue(), public.admin_case(uuid),
  public.admin_resolve(uuid, text, text), public.admin_review_selfie(bigint, boolean, text)
from public, anon;
-- is_admin também é usada pela policy do Storage (0015)
grant execute on function
  public.is_admin(), public.admin_queue(), public.admin_case(uuid),
  public.admin_resolve(uuid, text, text), public.admin_review_selfie(bigint, boolean, text)
to authenticated;
revoke all on function public.require_admin() from authenticated;
