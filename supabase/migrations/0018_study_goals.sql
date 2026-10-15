-- 0018 — Objetivos de preparação: descoberta integrada, sem separar os públicos.
-- Aplicar antes de publicar o app que usa os novos campos.
create table public.goal_exams (
  id smallint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  goal_type text not null check (goal_type in ('vestibular', 'militar', 'oab_residencia'))
);
create table public.study_courses (
  id smallint generated always as identity primary key,
  slug text not null unique,
  name text not null
);
alter table public.goal_exams enable row level security;
alter table public.study_courses enable row level security;
grant select on public.goal_exams, public.study_courses to authenticated;
create policy goal_exams_read on public.goal_exams for select to authenticated using (true);
create policy study_courses_read on public.study_courses for select to authenticated using (true);

insert into public.goal_exams (slug, name, goal_type) values
  ('enem', 'ENEM', 'vestibular'), ('fuvest', 'Fuvest', 'vestibular'),
  ('unicamp', 'Unicamp', 'vestibular'), ('unesp', 'Unesp', 'vestibular'),
  ('outro_vestibular', 'Outro vestibular', 'vestibular'),
  ('espcex', 'EsPCEx', 'militar'), ('esa', 'ESA', 'militar'),
  ('eear', 'EEAR', 'militar'), ('afa', 'AFA', 'militar'),
  ('escola_naval', 'Escola Naval', 'militar'), ('efomm', 'EFOMM', 'militar'),
  ('outra_selecao_militar', 'Outra seleção militar', 'militar'),
  ('oab_1', 'OAB · 1ª fase', 'oab_residencia'), ('oab_2', 'OAB · 2ª fase', 'oab_residencia'),
  ('residencia_medica', 'Residência médica', 'oab_residencia'),
  ('residencia_multi', 'Residência multiprofissional', 'oab_residencia');
insert into public.study_courses (slug, name) values
  ('medicina', 'Medicina'), ('direito', 'Direito'), ('engenharia', 'Engenharia'),
  ('computacao', 'Computação / Tecnologia'), ('psicologia', 'Psicologia'),
  ('enfermagem', 'Enfermagem'), ('administracao', 'Administração'),
  ('odontologia', 'Odontologia'), ('fisioterapia', 'Fisioterapia'),
  ('pedagogia', 'Pedagogia'), ('arquitetura', 'Arquitetura'), ('outro', 'Outro curso');

alter table public.profiles
  add column goal_type text not null default 'concurso'
    check (goal_type in ('concurso', 'vestibular', 'militar', 'oab_residencia')),
  add column goal_exam_id smallint references public.goal_exams(id),
  add column desired_course_id smallint references public.study_courses(id),
  add column desired_institution text check (char_length(desired_institution) between 2 and 100),
  add column goal_detail text check (char_length(goal_detail) between 2 and 100),
  add column secondary_goals text[] not null default '{}' check (
    cardinality(secondary_goals) <= 3 and
    secondary_goals <@ array['concurso', 'vestibular', 'militar', 'oab_residencia']::text[] and
    array_position(secondary_goals, null) is null and not (goal_type = any(secondary_goals))
  ),
  add constraint course_requires_vestibular check (desired_course_id is null or goal_type = 'vestibular');
-- Perfis antigos continuam válidos; a área militar identifica o público já existente.
update public.profiles p set goal_type = 'militar'
  from public.career_areas a where a.id = p.area_id and a.slug = 'militar';

grant insert (goal_type, goal_exam_id, desired_course_id, desired_institution, goal_detail, secondary_goals),
      update (goal_type, goal_exam_id, desired_course_id, desired_institution, goal_detail, secondary_goals)
  on public.profiles to authenticated;

create function public.validate_study_goal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.goal_exam_id is not null and not exists (
    select 1 from public.goal_exams e where e.id = new.goal_exam_id and e.goal_type = new.goal_type
  ) then raise exception 'INVALID_GOAL_EXAM'; end if;
  if new.goal_type in ('vestibular', 'oab_residencia') and
     (new.area_id is not null or new.competition_id is not null) then
    raise exception 'INVALID_GOAL_CAREER';
  end if;
  if new.competition_id is not null and not exists (
    select 1 from public.competitions c where c.id = new.competition_id and c.area_id = new.area_id
  ) then raise exception 'INVALID_GOAL_CAREER'; end if;
  if new.goal_type = 'militar' and new.area_id is not null and not exists (
    select 1 from public.career_areas a where a.id = new.area_id and a.slug = 'militar'
  ) then raise exception 'INVALID_GOAL_CAREER'; end if;
  if cardinality(new.secondary_goals) <> (select count(distinct g) from unnest(new.secondary_goals) g) then
    raise exception 'INVALID_SECONDARY_GOALS';
  end if;
  if not public.bio_allowed(new.desired_institution) or not public.bio_allowed(new.goal_detail) then
    raise exception 'GOAL_TEXT_NOT_ALLOWED';
  end if;
  return new;
end $$;
revoke all on function public.validate_study_goal() from public, anon, authenticated;
create trigger validate_study_goal before insert or update of goal_type, goal_exam_id,
  desired_course_id, desired_institution, goal_detail, secondary_goals, area_id, competition_id
  on public.profiles for each row execute function public.validate_study_goal();

insert into public.matching_weights (factor, weight, description) values
  ('mesmo_objetivo', 5, 'Mesmo tipo de preparação (afinidade, nunca filtro)'),
  ('mesmo_exame', 15, 'Mesma prova ou seleção'),
  ('mesmo_curso', 10, 'Mesmo curso desejado no vestibular');

create or replace function public.compatibility(me public.profiles, c public.profiles)
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
      when 'mesmo_objetivo' then
        if me.goal_type = c.goal_type then
          f := 1; v_reasons := array_append(v_reasons, 'Mesmo objetivo de preparação'::text);
        end if;
      when 'mesmo_exame' then
        if me.goal_exam_id is not null and me.goal_exam_id = c.goal_exam_id and exists (
          select 1 from public.goal_exams e where e.id = me.goal_exam_id
            and e.slug not in ('outro_vestibular', 'outra_selecao_militar')
        ) then
          f := 1; v_reasons := array_append(v_reasons, 'Mesma prova ou seleção'::text);
        end if;
      when 'mesmo_curso' then
        if me.desired_course_id is not null and me.desired_course_id = c.desired_course_id and exists (
          select 1 from public.study_courses s where s.id = me.desired_course_id and s.slug <> 'outro'
        ) then
          f := 1; v_reasons := array_append(v_reasons, 'Mesmo curso desejado'::text);
        end if;
      when 'mesmo_concurso' then
        if me.competition_id is not null and me.competition_id = c.competition_id then
          f := 1; v_reasons := array_append(v_reasons, case when me.goal_type = 'militar' then 'Mesma seleção militar'::text else 'Mesmo concurso'::text end);
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
          f := 1; v_reasons := array_append(v_reasons, 'Mesmo destino'::text);
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


-- A assinatura de retorno mudou; recriar e restaurar somente o grant necessário.
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
  message_to_me   text,
  goal_type       text,
  goal_exam       text,
  desired_course  text,
  desired_institution text,
  goal_detail     text,
  secondary_goals text[]
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
      (case when me.goal_type in ('vestibular', 'oab_residencia')
                  or l.goal_type in ('vestibular', 'oab_residencia')
             then 'Destino: ' else 'Lotação: ' end)
      || coalesce(l.target_city || '/' || l.target_state, l.city || '/' || l.state)
    end,
    (sc.v->>'score')::int,
    sc.v->'reasons',
    array(select p.storage_path from public.photos p
          where p.user_id = l.id and p.approved order by p.position),
    l.interests,
    l.msg, l.goal_type, exam.name, course.name, l.desired_institution, l.goal_detail, l.secondary_goals
  from located l
  cross join lateral (select public.compatibility(me, p) as v from public.profiles p where p.id = l.id) sc
  left join public.competitions comp on comp.id = l.competition_id
  left join public.career_areas ar on ar.id = l.area_id
  left join public.goal_exams exam on exam.id = l.goal_exam_id
  left join public.study_courses course on course.id = l.desired_course_id
  where l.in_radius or l.by_lotacao
  order by (l.msg is not null) desc, (sc.v->>'score')::int desc, l.last_active_at desc
  limit least(greatest(p_limit, 1), 50);
end $$;


revoke all on function public.discover(integer) from public, anon;
grant execute on function public.discover(integer) to authenticated;
