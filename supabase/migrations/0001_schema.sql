-- =====================================================================
-- ConMatch — schema do MVP
-- App de relacionamento para concurseiros.
-- Postgres 15+ (Supabase). Fuso de negócio: America/Sao_Paulo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.gender as enum ('mulher', 'homem', 'nao_binario');

create type public.study_status as enum (
  'comecando', 'estudando', 'pos_edital', 'inscrito',
  'fez_prova', 'aprovado', 'aguardando_nomeacao', 'nomeado'
);

create type public.study_period as enum ('manha', 'tarde', 'noite', 'madrugada', 'variado');

create type public.report_reason as enum (
  'perfil_falso', 'menor_de_idade', 'assedio', 'conteudo_sexual',
  'spam_golpe', 'discurso_de_odio', 'outro'
);

create type public.report_status as enum ('aberta', 'em_analise', 'procedente', 'improcedente');

-- ---------------------------------------------------------------------
-- Configuração centralizada (pesos de compatibilidade, limites)
-- Alterar regras = UPDATE nestas tabelas, sem deploy.
-- ---------------------------------------------------------------------
create table public.app_config (
  key   text primary key,
  value jsonb not null,
  description text
);

create table public.matching_weights (
  factor text primary key,
  weight numeric(5,2) not null check (weight >= 0),
  description text
);

-- ---------------------------------------------------------------------
-- Catálogo de concursos (Concurso Service, no futuro)
-- ---------------------------------------------------------------------
create table public.career_areas (
  id   smallint generated always as identity primary key,
  slug text not null unique,
  name text not null
);

create table public.competitions (
  id           integer generated always as identity primary key,
  area_id      smallint not null references public.career_areas(id),
  name         text not null,            -- ex.: "Polícia Federal — Agente"
  organization text not null,            -- ex.: "Polícia Federal"
  active       boolean not null default true,
  unique (organization, name)
);

-- ---------------------------------------------------------------------
-- Perfil (1:1 com auth.users)
-- Localização: só cidade/UF + coordenadas arredondadas (~1 km).
-- Nunca guardamos localização exata.
-- ---------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  display_name    text not null check (char_length(display_name) between 2 and 40),
  birthdate       date not null,
  gender          public.gender not null,
  interested_in   public.gender[] not null check (cardinality(interested_in) between 1 and 3),
  bio             text check (char_length(bio) <= 500),

  state           char(2) not null check (state ~ '^[A-Z]{2}$'),
  city            text not null check (char_length(city) between 2 and 80),
  lat_approx      numeric(5,2) check (lat_approx between -90 and 90),
  lng_approx      numeric(5,2) check (lng_approx between -180 and 180),

  -- Modo Lotação: cidade para onde a pessoa quer ir / foi nomeada
  target_state    char(2) check (target_state ~ '^[A-Z]{2}$'),
  target_city     text check (char_length(target_city) between 2 and 80),

  area_id         smallint references public.career_areas(id),
  competition_id  integer references public.competitions(id),
  status          public.study_status not null default 'estudando',
  study_period    public.study_period,

  -- Preferências de descoberta
  age_min         smallint not null default 18 check (age_min >= 18),
  age_max         smallint not null default 60 check (age_max <= 99),
  max_distance_km smallint not null default 50 check (max_distance_km between 1 and 500),

  is_visible      boolean not null default true,

  -- Colunas controladas pelo sistema (usuário NÃO pode alterar; ver grants)
  verified        boolean not null default false,
  banned_at       timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_active_at  timestamptz not null default now(),

  constraint adult_only check (birthdate <= (current_date - interval '18 years')),
  constraint age_range check (age_min <= age_max),
  constraint target_pair check ((target_state is null) = (target_city is null))
);

create index profiles_discovery_idx on public.profiles (state, gender) where is_visible and banned_at is null;
create index profiles_target_idx    on public.profiles (target_state, target_city) where target_city is not null;
create index profiles_active_idx    on public.profiles (last_active_at desc);

-- Fotos (arquivo fica no Storage; aqui só o caminho)
create table public.photos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  position     smallint not null check (position between 0 and 5),
  approved     boolean not null default true,   -- moderação pode reprovar
  created_at   timestamptz not null default now(),
  unique (user_id, position)
);

-- Consentimentos LGPD (termos, privacidade, dado sensível: orientação)
create table public.consents (
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('termos', 'privacidade', 'dados_sensiveis')),
  version    text not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, kind, version)
);

-- Assinatura (escrita só pelo backend/webhook de pagamento)
create table public.entitlements (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  premium_until timestamptz,
  source        text,            -- 'apple' | 'google' | 'manual'
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Interações
-- ---------------------------------------------------------------------
create table public.likes (
  liker_id   uuid not null references public.profiles(id) on delete cascade,
  likee_id   uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (liker_id, likee_id),
  check (liker_id <> likee_id)
);
create index likes_likee_idx on public.likes (likee_id);
create index likes_daily_idx on public.likes (liker_id, created_at desc);

create table public.passes (
  passer_id  uuid not null references public.profiles(id) on delete cascade,
  passee_id  uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (passer_id, passee_id),
  check (passer_id <> passee_id)
);

create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

-- Match: par ordenado (user_a < user_b) garante unicidade sem duplicar
create table public.matches (
  id            uuid primary key default gen_random_uuid(),
  user_a        uuid not null references public.profiles(id) on delete cascade,
  user_b        uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unmatched_at  timestamptz,
  unmatched_by  uuid references public.profiles(id) on delete set null,
  check (user_a < user_b),
  unique (user_a, user_b)
);
create index matches_user_b_idx on public.matches (user_b);

create table public.messages (
  id         bigint generated always as identity primary key,
  match_id   uuid not null references public.matches(id) on delete cascade,
  sender_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index messages_match_idx  on public.messages (match_id, id desc);
create index messages_sender_idx on public.messages (sender_id, created_at desc);

-- ---------------------------------------------------------------------
-- Segurança / moderação
-- ---------------------------------------------------------------------
create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  reason      public.report_reason not null,
  details     text check (char_length(details) <= 1000),
  match_id    uuid references public.matches(id) on delete set null,
  status      public.report_status not null default 'aberta',
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index reports_open_idx on public.reports (status, created_at) where status in ('aberta', 'em_analise');
create index reports_reported_idx on public.reports (reported_id);

create table public.audit_logs (
  id         bigint generated always as identity primary key,
  actor_id   uuid,
  action     text not null,
  target_id  uuid,
  data       jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------
create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Arredonda coordenadas no servidor: mesmo que o app mande GPS preciso,
-- o banco guarda no máximo 2 casas (~1,1 km). Proteção de privacidade.
create function public.round_location() returns trigger
language plpgsql as $$
begin
  new.lat_approx := round(new.lat_approx, 2);
  new.lng_approx := round(new.lng_approx, 2);
  return new;
end $$;

create trigger profiles_round_location before insert or update of lat_approx, lng_approx on public.profiles
  for each row execute function public.round_location();
