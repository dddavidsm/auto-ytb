create table if not exists research_dossiers (
  id uuid primary key default gen_random_uuid(), opportunity_id uuid references opportunities(id) on delete set null,
  topic text not null, research_confidence numeric not null check (research_confidence between 0 and 100), executive_summary text not null,
  blocking_issues jsonb not null default '[]'::jsonb, dossier jsonb not null, created_at timestamptz not null default now()
);
create table if not exists scripts (
  id uuid primary key default gen_random_uuid(), content_idea_id uuid references content_ideas(id) on delete set null,
  research_dossier_id uuid references research_dossiers(id) on delete set null, version integer not null default 1,
  language text not null, target_duration_seconds integer not null, script jsonb not null, created_at timestamptz not null default now(), unique(content_idea_id, version)
);
create table if not exists packaging_variants (
  id uuid primary key default gen_random_uuid(), content_idea_id uuid references content_ideas(id) on delete cascade,
  variant_key text not null, title text not null, thumbnail_concept text not null, score numeric not null,
  payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), unique(content_idea_id, variant_key)
);
create table if not exists production_assets (
  id uuid primary key default gen_random_uuid(), production_run_id uuid references production_runs(id) on delete cascade,
  scene_id text, asset_type text not null, uri text not null, provider text, model text, generated boolean not null default false,
  source_ids jsonb not null default '[]'::jsonb, license text, source_url text, cost_usd numeric not null default 0,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists qa_reports (
  id uuid primary key default gen_random_uuid(), production_run_id uuid references production_runs(id) on delete cascade,
  passed boolean not null, score numeric not null, contains_synthetic_media boolean not null default false,
  blockers jsonb not null default '[]'::jsonb, report jsonb not null, created_at timestamptz not null default now()
);
create table if not exists publications (
  id uuid primary key default gen_random_uuid(), production_run_id uuid references production_runs(id) on delete set null,
  channel_id uuid references channels(id) on delete cascade, youtube_video_id text unique,
  state text not null check (state in ('rendered','private','reviewed','scheduled','public','failed')), publish_at timestamptz,
  contains_synthetic_media boolean not null default false, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists analytics_snapshots (
  id bigserial primary key, publication_id uuid not null references publications(id) on delete cascade, captured_at timestamptz not null default now(),
  views bigint not null default 0, watch_time_minutes numeric not null default 0, average_view_duration_seconds numeric,
  average_view_percentage numeric, likes bigint, comments bigint, shares bigint, subscribers_gained bigint, revenue_usd numeric,
  traffic_sources jsonb not null default '{}'::jsonb, unique(publication_id, captured_at)
);
create table if not exists retention_points (
  id bigserial primary key, analytics_snapshot_id bigint not null references analytics_snapshots(id) on delete cascade,
  elapsed_ratio numeric not null check (elapsed_ratio between 0 and 1), audience_watch_ratio numeric not null check (audience_watch_ratio >= 0)
);
create index if not exists idx_retention_snapshot_ratio on retention_points(analytics_snapshot_id, elapsed_ratio);
create table if not exists learning_signals (
  id bigserial primary key, channel_id uuid not null references channels(id) on delete cascade,
  publication_id uuid references publications(id) on delete cascade, signal_type text not null, feature_key text not null,
  feature_value jsonb not null, strength numeric not null default 50 check (strength between 0 and 100), observed_at timestamptz not null default now()
);
create index if not exists idx_learning_channel_signal on learning_signals(channel_id, signal_type, observed_at desc);
