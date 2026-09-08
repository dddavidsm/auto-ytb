create table if not exists series (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  series_key text not null,
  title text not null,
  language text not null default 'en',
  positioning text,
  audience_mode text not null default 'GENERAL' check (audience_mode in ('GENERAL','MADE_FOR_KIDS')),
  target_age_min integer,
  target_age_max integer,
  lifecycle_state text not null default 'bootstrap_pending' check (lifecycle_state in ('bootstrap_pending','active','paused','retired')),
  automation_enabled boolean not null default true,
  current_bible_version integer not null default 0,
  continuity_key text,
  identity jsonb not null default '{}'::jsonb,
  format_strategy jsonb not null default '{}'::jsonb,
  performance_policy jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(channel_id,series_key)
);
create index if not exists series_channel_state_idx on series(channel_id,lifecycle_state,automation_enabled);

create table if not exists series_candidates (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  source_opportunity_id uuid references opportunities(id) on delete set null,
  candidate_key text not null,
  proposed_title text not null,
  language text not null default 'en',
  audience_mode text not null default 'GENERAL' check (audience_mode in ('GENERAL','MADE_FOR_KIDS')),
  target_age_min integer,
  target_age_max integer,
  style_fingerprint jsonb not null default '{}'::jsonb,
  character_spec jsonb not null default '{}'::jsonb,
  rationale jsonb not null default '[]'::jsonb,
  route_score numeric(6,2) not null default 0,
  opportunity_score numeric(6,2) not null default 0,
  status text not null default 'discovered' check (status in ('discovered','bootstrap_queued','bootstrapping','active','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(channel_id,candidate_key)
);

create table if not exists series_bibles (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references series(id) on delete cascade,
  version integer not null,
  status text not null default 'draft' check (status in ('draft','active','retired')),
  continuity_key text not null,
  bible jsonb not null,
  validation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  unique(series_id,version)
);
create unique index if not exists series_one_active_bible_idx on series_bibles(series_id) where status='active';

create table if not exists series_characters (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references series(id) on delete cascade,
  character_key text not null,
  name text not null,
  role text,
  character_mode text not null default 'persistent-character',
  continuity_key text not null,
  specification jsonb not null default '{}'::jsonb,
  voice_profile jsonb not null default '{}'::jsonb,
  canonical_reference_uri text,
  status text not null default 'active' check (status in ('active','retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(series_id,character_key)
);

create table if not exists series_styles (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references series(id) on delete cascade,
  style_key text not null,
  name text not null,
  continuity_key text not null,
  specification jsonb not null default '{}'::jsonb,
  canonical_reference_uri text,
  status text not null default 'active' check (status in ('active','retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(series_id,style_key)
);

create table if not exists series_story_arcs (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references series(id) on delete cascade,
  arc_key text not null,
  title text not null,
  status text not null default 'planned' check (status in ('planned','active','completed','abandoned')),
  summary text,
  rules jsonb not null default '{}'::jsonb,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(series_id,arc_key)
);

create table if not exists series_prompt_packs (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references series(id) on delete cascade,
  version integer not null,
  status text not null default 'active' check (status in ('draft','active','retired')),
  prompts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(series_id,version)
);
create unique index if not exists series_one_active_prompt_pack_idx on series_prompt_packs(series_id) where status='active';

create table if not exists series_episodes (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references series(id) on delete cascade,
  production_run_id uuid unique references production_runs(id) on delete set null,
  story_arc_id uuid references series_story_arcs(id) on delete set null,
  bible_version_id uuid references series_bibles(id) on delete restrict,
  season_number integer not null default 1,
  episode_number integer not null,
  episode_key text not null,
  title text,
  premise text,
  status text not null default 'planned' check (status in ('planned','production','private','scheduled','published','failed','retired')),
  continuity_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(series_id,season_number,episode_number),
  unique(series_id,episode_key)
);

create table if not exists series_episode_memory (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references series(id) on delete cascade,
  episode_id uuid references series_episodes(id) on delete cascade,
  memory_type text not null,
  memory_key text not null,
  payload jsonb not null,
  importance numeric(5,2) not null default 50,
  canonical boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(series_id,episode_id,memory_type,memory_key)
);
create index if not exists series_memory_active_idx on series_episode_memory(series_id,active,canonical,importance desc);

create table if not exists series_assets (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references series(id) on delete cascade,
  scope_type text not null check (scope_type in ('series','character','style','world','prop','location','audio')),
  scope_key text not null,
  asset_type text not null,
  uri text not null,
  provider text,
  model text,
  continuity_key text,
  license text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(series_id,scope_type,scope_key,asset_type,uri)
);

create table if not exists series_performance_snapshots (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references series(id) on delete cascade,
  content_format text,
  sample_size integer not null default 0,
  views bigint not null default 0,
  average_view_percentage numeric(8,3),
  average_view_duration_seconds numeric(10,3),
  average_retention_30s numeric(8,3),
  share_rate numeric(10,5),
  subscribers_per_thousand numeric(10,4),
  revenue_usd numeric(12,4),
  cost_usd numeric(12,4),
  profit_usd numeric(12,4),
  roi numeric(12,5),
  watch_minutes_per_dollar numeric(14,4),
  payload jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now()
);
create index if not exists series_performance_recent_idx on series_performance_snapshots(series_id,observed_at desc);

alter table content_ideas add column if not exists series_id uuid references series(id) on delete set null;
create index if not exists content_ideas_series_idx on content_ideas(series_id,created_at desc);
