create extension if not exists pgcrypto;

create table if not exists channels (
  id uuid primary key default gen_random_uuid(),
  youtube_channel_id text unique,
  handle text,
  title text not null,
  language text,
  country text,
  niche text,
  is_owned boolean not null default false,
  is_competitor boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists videos (
  id uuid primary key default gen_random_uuid(),
  youtube_video_id text unique not null,
  channel_id uuid references channels(id) on delete cascade,
  title text not null,
  description text,
  published_at timestamptz not null,
  duration_seconds integer,
  language text,
  topic_cluster text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists video_snapshots (
  id bigserial primary key,
  video_id uuid not null references videos(id) on delete cascade,
  captured_at timestamptz not null default now(),
  views bigint not null default 0,
  likes bigint,
  comments bigint,
  views_per_hour numeric,
  unique(video_id, captured_at)
);
create index if not exists idx_video_snapshots_video_time on video_snapshots(video_id, captured_at desc);

create table if not exists topics (
  id uuid primary key default gen_random_uuid(),
  canonical_name text unique not null,
  niche text,
  language text,
  created_at timestamptz not null default now()
);

create table if not exists trend_signals (
  id bigserial primary key,
  topic_id uuid not null references topics(id) on delete cascade,
  source text not null,
  observed_at timestamptz not null default now(),
  value numeric not null,
  velocity numeric,
  acceleration numeric,
  source_url text,
  payload jsonb not null default '{}'::jsonb
);
create index if not exists idx_trend_signals_topic_time on trend_signals(topic_id, observed_at desc);

create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references topics(id) on delete set null,
  angle text not null,
  status text not null default 'candidate' check (status in ('candidate','watch','research','approved','rejected','produced')),
  score numeric not null check (score >= 0 and score <= 100),
  grade text,
  decision text,
  signals jsonb not null,
  risks jsonb not null,
  rationale jsonb not null default '[]'::jsonb,
  detected_at timestamptz not null default now(),
  expires_at timestamptz
);
create index if not exists idx_opportunities_score on opportunities(score desc, detected_at desc);

create table if not exists content_ideas (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references opportunities(id) on delete set null,
  format text not null check (format in ('long','short','series','community')),
  working_title text not null,
  premise text,
  target_viewer text,
  hook_hypothesis text,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create table if not exists production_runs (
  id uuid primary key default gen_random_uuid(),
  content_idea_id uuid not null references content_ideas(id) on delete cascade,
  state text not null,
  total_cost_usd numeric not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists model_experiments (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references channels(id) on delete cascade,
  experiment_type text not null,
  hypothesis text not null,
  variant_a jsonb not null,
  variant_b jsonb,
  variant_c jsonb,
  winner text,
  outcome jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
