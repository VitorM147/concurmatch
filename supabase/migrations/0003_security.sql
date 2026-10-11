-- =====================================================================
-- Row Level Security + grants
-- Princípio: o app só lê o que precisa e escreve via RPC.
-- Escrita direta permitida apenas em: próprio perfil (colunas liberadas),
-- próprias fotos, consentimentos e mensagens (validadas por trigger).
-- =====================================================================

alter table public.app_config        enable row level security;
alter table public.matching_weights  enable row level security;
alter table public.career_areas      enable row level security;
alter table public.competitions      enable row level security;
alter table public.profiles          enable row level security;
alter table public.photos            enable row level security;
alter table public.consents          enable row level security;
alter table public.entitlements      enable row level security;
alter table public.likes             enable row level security;
alter table public.passes            enable row level security;
alter table public.blocks            enable row level security;
alter table public.matches           enable row level security;
alter table public.messages          enable row level security;
alter table public.reports           enable row level security;
alter table public.audit_logs        enable row level security;

-- Limpa privilégios padrão e concede o mínimo
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;

-- Catálogo: leitura pública para o onboarding
grant select on public.career_areas, public.competitions to anon, authenticated;
create policy catalog_areas_read on public.career_areas for select using (true);
create policy catalog_comp_read  on public.competitions for select using (active);

-- Perfil: dono lê e escreve o próprio. Perfis de terceiros só via discover()/my_matches().
grant select, delete on public.profiles to authenticated;
grant insert (id, display_name, birthdate, gender, interested_in, bio, state, city,
              lat_approx, lng_approx, target_state, target_city, area_id, competition_id,
              status, study_period, age_min, age_max, max_distance_km, is_visible)
  on public.profiles to authenticated;
grant update (display_name, bio, interested_in, state, city, lat_approx, lng_approx,
              target_state, target_city, area_id, competition_id, status, study_period,
              age_min, age_max, max_distance_km, is_visible)
  on public.profiles to authenticated;
-- verified, banned_at, birthdate e gender ficam fora do UPDATE do usuário:
-- idade e gênero só mudam via suporte (evita fraude de faixa etária).

create policy profiles_own_select on public.profiles for select using (id = auth.uid());
create policy profiles_own_insert on public.profiles for insert with check (id = auth.uid());
create policy profiles_own_update on public.profiles for update
  using (id = auth.uid() and banned_at is null) with check (id = auth.uid());

-- Fotos: dono gerencia. approved só muda pela moderação.
grant select, delete on public.photos to authenticated;
grant insert (user_id, storage_path, position) on public.photos to authenticated;
grant update (storage_path, position) on public.photos to authenticated;
create policy photos_own_all on public.photos for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Consentimentos: dono registra e lê
grant select, insert on public.consents to authenticated;
create policy consents_own on public.consents for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Assinatura: só leitura do próprio (escrita = service_role / webhook)
grant select on public.entitlements to authenticated;
create policy entitlements_own_read on public.entitlements for select using (user_id = auth.uid());

-- Matches: participantes leem (necessário para o Realtime do chat)
grant select on public.matches to authenticated;
create policy matches_participant_read on public.matches for select
  using (auth.uid() in (user_a, user_b));

-- Mensagens: participantes leem; envio validado por trigger
grant select on public.messages to authenticated;
grant insert (match_id, sender_id, body) on public.messages to authenticated;
create policy messages_participant_read on public.messages for select
  using (exists (select 1 from public.matches m
                 where m.id = match_id and auth.uid() in (m.user_a, m.user_b)));
create policy messages_send on public.messages for insert
  with check (sender_id = auth.uid());

-- likes, passes, blocks, reports, audit_logs, app_config, matching_weights:
-- sem grants para o app. Acesso só via funções SECURITY DEFINER / service_role.

-- RPCs expostas ao app autenticado
grant execute on function
  public.discover(integer),
  public.remaining_likes(),
  public.swipe_like(uuid),
  public.swipe_pass(uuid),
  public.my_matches(),
  public.mark_read(uuid),
  public.unmatch(uuid),
  public.block_user(uuid),
  public.report_user(uuid, public.report_reason, text, uuid),
  public.delete_my_account()
to authenticated;

-- Funções usadas dentro de policies/triggers precisam de execute
grant execute on function public.is_blocked_pair(uuid, uuid) to authenticated;
