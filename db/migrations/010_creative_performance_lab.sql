create table if not exists creative_fingerprints (
  id uuid primary key default gen_random_uuid(),
  production_run_id uuid not null unique references production_runs(id) on delete cascade,
  channel_id uuid references channels(id) on delete set null,
  publication_id uuid references publications(id) on delete set null,
  content_format text not null,
  language text,
  topic text,
  attention_score numeric(6,2),
  hook_type text,
  hook_retention_device text,
  narrative_archetype text,
  beat_count integer not null default 0,
  scene_count integer not null default 0,
  visual_mix jsonb not null default '{}'::jsonb,
  packaging jsonb not null default '{}'::jsonb,
  fingerprint jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists creative_fingerprints_channel_format_idx on creative_fingerprints(channel_id,content_format,created_at desc);

create table if not exists creative_segment_observations (
  id bigserial primary key,
  analytics_snapshot_id bigint references analytics_snapshots(id) on delete cascade,
  production_run_id uuid not null references production_runs(id) on delete cascade,
  publication_id uuid not null references publications(id) on delete cascade,
  channel_id uuid not null references channels(id) on delete cascade,
  segment_type text not null check (segment_type in ('beat','scene')),
  segment_key text not null,
  start_seconds numeric(12,3) not null,
  end_seconds numeric(12,3) not null,
  start_ratio numeric(9,6) not null,
  end_ratio numeric(9,6) not null,
  start_retention numeric(9,6),
  end_retention numeric(9,6),
  average_retention numeric(9,6),
  retention_delta numeric(9,6),
  local_dips integer not null default 0,
  local_spikes integer not null default 0,
  features jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now()
);

create index if not exists creative_segment_observations_channel_idx on creative_segment_observations(channel_id,observed_at desc);
create index if not exists creative_segment_observations_publication_idx on creative_segment_observations(publication_id,observed_at desc);
create index if not exists creative_segment_observations_feature_gin_idx on creative_segment_observations using gin(features);

create table if not exists creative_feature_snapshots (
  id bigserial primary key,
  channel_id uuid not null references channels(id) on delete cascade,
  content_format text not null,
  feature_name text not null,
  feature_value text not null,
  sample_size integer not null,
  weighted_views bigint not null default 0,
  average_retention_delta numeric(9,6),
  average_segment_retention numeric(9,6),
  average_video_avp numeric(9,4),
  average_share_rate numeric(9,4),
  average_subscribers_per_thousand numeric(9,4),
  average_roi numeric(12,4),
  confidence numeric(6,4) not null default 0,
  payload jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now()
);

create index if not exists creative_feature_snapshots_lookup_idx on creative_feature_snapshots(channel_id,content_format,feature_name,feature_value,observed_at desc);

create table if not exists audience_context_snapshots (
  id bigserial primary key,
  publication_id uuid not null references publications(id) on delete cascade,
  analytics_snapshot_id bigint references analytics_snapshots(id) on delete cascade,
  context_type text not null,
  context_value text not null,
  views bigint not null default 0,
  watch_time_minutes numeric(16,4) not null default 0,
  payload jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now()
);

create index if not exists audience_context_snapshots_publication_idx on audience_context_snapshots(publication_id,context_type,observed_at desc);
