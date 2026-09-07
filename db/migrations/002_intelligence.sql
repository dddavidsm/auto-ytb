create table if not exists search_queries (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  lane text not null,
  language text,
  region text,
  last_run_at timestamptz,
  next_run_at timestamptz,
  priority numeric not null default 50,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  unique(query, lane, coalesce(language,''), coalesce(region,''))
);

create table if not exists search_runs (
  id uuid primary key default gen_random_uuid(),
  search_query_id uuid references search_queries(id) on delete set null,
  source text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result_count integer,
  quota_cost integer not null default 0,
  status text not null default 'running',
  error text
);

create table if not exists topic_evidence (
  id bigserial primary key,
  topic_id uuid not null references topics(id) on delete cascade,
  source text not null,
  observed_at timestamptz not null default now(),
  strength numeric not null check (strength >= 0 and strength <= 100),
  authority numeric not null default 80 check (authority >= 0 and authority <= 100),
  reference text,
  payload jsonb not null default '{}'::jsonb
);
create index if not exists idx_topic_evidence_topic_time on topic_evidence(topic_id, observed_at desc);

create table if not exists competitor_snapshots (
  id bigserial primary key,
  channel_id uuid not null references channels(id) on delete cascade,
  captured_at timestamptz not null default now(),
  subscribers bigint,
  total_views bigint,
  video_count bigint,
  median_recent_views numeric,
  median_recent_views_per_day numeric,
  breakout_count integer,
  strongest_outlier numeric
);
create index if not exists idx_competitor_snapshots_channel_time on competitor_snapshots(channel_id, captured_at desc);
