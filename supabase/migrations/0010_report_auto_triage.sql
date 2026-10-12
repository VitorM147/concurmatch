-- =====================================================================
-- 0010 — Triagem automática de denúncias (Moderation API da OpenAI)
--
-- Um robô (Edge Function report-triage, a cada minuto) lê o que a pessoa
-- denunciada escreveu (conversa guardada na denúncia, recado da curtida e
-- bio), pede a nota à Moderation API e chama apply_report_triage().
--
--   grave          → perfil escondido na hora (ameaça, assédio sexual,
--                    oferta de programa...). Fica na fila para banir.
--   moderada       → denúncia segue aberta e conta para as 3 (regra do 0005).
--   sem_evidencia  → nada de errado na conversa: arquivada sozinha, não
--                    conta para esconder ninguém.
--   sem_conversa   → não há texto para julgar (ex.: perfil falso visto no
--                    Descobrir): segue a regra das 3 denúncias.
--
-- Perfil falso contra quem já é verificado é arquivado; quem é escondido
-- por "perfil falso" volta sozinho ao verificar o rosto.
-- Banimento continua sendo decisão humana, mas sem pressa: quem tem
-- evidência grave já está escondido e não conversa.
-- A verificação por selfie continua manual por enquanto.
-- =====================================================================

alter table public.reports
  add column auto_severity   text check (auto_severity in ('grave', 'moderada', 'sem_evidencia', 'sem_conversa')),
  add column auto_scores     jsonb,
  add column auto_checked_at timestamptz;

create index reports_triage_pending_idx on public.reports (created_at)
  where auto_checked_at is null and status in ('aberta', 'em_analise');

-- Motivos que dá para julgar pela conversa
create function public.report_reason_is_conversational(p public.report_reason) returns boolean
language sql immutable as $$
  select p::text in ('assedio', 'conteudo_sexual', 'discurso_de_odio', 'spam_golpe', 'servico_sexual_ou_cobranca')
$$;

-- O que o robô precisa analisar: só o que a pessoa DENUNCIADA escreveu
create function public.report_triage_pending(p_limit integer default 20) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'created_at'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', r.id,
      'reason', r.reason,
      'created_at', r.created_at,
      'texts', to_jsonb(array_remove(
        array(select m->>'body' from jsonb_array_elements(coalesce(r.evidence->'messages', '[]'::jsonb)) m
               where m->>'from' = 'denunciado')
        || array[r.evidence->>'like_message', p.bio], null))
    ) as x
    from public.reports r
    join public.profiles p on p.id = r.reported_id
    where r.auto_checked_at is null and r.status in ('aberta', 'em_analise')
    order by r.created_at
    limit least(greatest(p_limit, 1), 100)
  ) q
$$;

-- Restaura quem foi escondido e não tem mais nenhuma denúncia aberta
create function public.auto_restore_if_clear(p_user uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles
                  where id = p_user and moderation_hidden_at is not null and banned_at is null) then
    return false;
  end if;
  if exists (select 1 from public.reports where reported_id = p_user and status in ('aberta', 'em_analise')) then
    return false;
  end if;
  update public.profiles set moderation_hidden_at = null where id = p_user;
  update public.moderation_appeals set status = 'aceito', resolved_at = now()
   where user_id = p_user and status = 'aberto';
  update public.security_alerts set resolved_at = now()
   where subject_id = p_user and resolved_at is null and kind in ('auto_hide', 'report_spike', 'appeal');
  insert into public.audit_logs (actor_id, action, target_id, data)
  values (null, 'auto_restore', p_user, jsonb_build_object('motivo', 'nenhuma denúncia aberta'));
  return true;
end $$;

create function public.apply_report_triage(p_report uuid, p_severity text, p_scores jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.reports;
  v_sev text := p_severity;
  v_action text := 'mantida';
  v_texts text[];
begin
  if p_severity not in ('grave', 'moderada', 'sem_evidencia', 'sem_conversa') then
    raise exception 'INVALID_SEVERITY' using errcode = '22023';
  end if;
  select * into r from public.reports where id = p_report for update;
  if not found then
    raise exception 'REPORT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if r.auto_checked_at is not null or r.status not in ('aberta', 'em_analise') then
    return jsonb_build_object('action', 'ignorada');
  end if;

  -- O filtro de programa/cobrança do próprio banco vale mais que a nota
  v_texts := array_remove(
    array(select m->>'body' from jsonb_array_elements(coalesce(r.evidence->'messages', '[]'::jsonb)) m
           where m->>'from' = 'denunciado')
    || array[r.evidence->>'like_message', (select bio from public.profiles where id = r.reported_id)], null);
  if exists (select 1 from unnest(v_texts) t where public.sexual_service_signal_strict(t)) then
    v_sev := 'grave';
  end if;

  update public.reports
     set auto_severity = v_sev, auto_scores = p_scores, auto_checked_at = now()
   where id = r.id;

  if v_sev = 'grave' then
    update public.profiles set moderation_hidden_at = coalesce(moderation_hidden_at, now())
     where id = r.reported_id and banned_at is null;
    insert into public.security_alerts (kind, subject_id, data)
    values ('auto_hide', r.reported_id, jsonb_build_object('report_id', r.id, 'severity', v_sev));
    v_action := 'escondido';
  elsif v_sev = 'sem_evidencia' and public.report_reason_is_conversational(r.reason) then
    update public.reports set status = 'improcedente', resolved_at = now() where id = r.id;
    v_action := 'arquivada';
  elsif r.reason = 'perfil_falso' and (select verified from public.profiles where id = r.reported_id) then
    update public.reports set status = 'improcedente', resolved_at = now() where id = r.id;
    v_action := 'arquivada';
  end if;

  insert into public.audit_logs (actor_id, action, target_id, data)
  values (null, 'auto_triage', r.reported_id,
          jsonb_build_object('report_id', r.id, 'severity', v_sev, 'action', v_action));

  if v_action = 'arquivada' and public.auto_restore_if_clear(r.reported_id) then
    v_action := 'arquivada_e_restaurado';
  end if;
  return jsonb_build_object('action', v_action, 'severity', v_sev);
end $$;

-- Verificou o rosto: denúncias de "perfil falso" caem e o perfil volta se
-- não sobrar nada aberto.
create or replace function public.moderation_review_verification(p_request bigint, p_approve boolean, p_note text default null)
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
    update public.reports set status = 'improcedente', resolved_at = now()
     where reported_id = v_req.user_id and reason = 'perfil_falso' and status in ('aberta', 'em_analise');
    perform public.auto_restore_if_clear(v_req.user_id);
  end if;
  update public.security_alerts set resolved_at = now()
   where kind = 'verification_request' and subject_id = v_req.user_id and resolved_at is null;
  insert into public.audit_logs (actor_id, action, target_id, data)
  values (null, case when p_approve then 'verification_approved' else 'verification_rejected' end,
          v_req.user_id, jsonb_build_object('request_id', p_request, 'note', p_note));
end $$;

-- O que sobra para uma pessoa: banir (ou não) quem a máquina escondeu,
-- menor de idade, recursos e selfies. Mais grave primeiro.
create function public.moderation_queue() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(q order by q->>'prioridade', q->>'desde'), '[]'::jsonb) from (
    select jsonb_build_object(
      'tipo', 'perfil',
      'user_id', p.id,
      'nome', p.display_name,
      'desde', p.moderation_hidden_at,
      'prioridade', case
        when bool_or(r.reason = 'menor_de_idade') then '1-menor'
        when bool_or(r.auto_severity = 'grave') then '2-grave'
        when exists (select 1 from public.moderation_appeals a where a.user_id = p.id and a.status = 'aberto') then '3-recurso'
        else '4-denuncias' end,
      'denuncias', count(r.id),
      'motivos', jsonb_agg(distinct r.reason),
      'gravidade', jsonb_agg(distinct r.auto_severity) filter (where r.auto_severity is not null),
      'recurso', (select a.message from public.moderation_appeals a where a.user_id = p.id and a.status = 'aberto' limit 1)
    ) q
    from public.profiles p
    join public.reports r on r.reported_id = p.id and r.status in ('aberta', 'em_analise')
    where p.banned_at is null
      and (p.moderation_hidden_at is not null or r.reason = 'menor_de_idade')
    group by p.id
    union all
    select jsonb_build_object('tipo', 'selfie', 'user_id', v.user_id, 'request_id', v.id,
                              'desde', v.submitted_at, 'prioridade', '5-selfie', 'gesto', v.gesture)
    from public.verification_requests v where v.status = 'pendente'
  ) s
$$;

revoke all on function
  public.report_reason_is_conversational(public.report_reason),
  public.report_triage_pending(integer),
  public.auto_restore_if_clear(uuid),
  public.apply_report_triage(uuid, text, jsonb),
  public.moderation_queue(),
  public.moderation_review_verification(bigint, boolean, text)
from public, anon, authenticated;
