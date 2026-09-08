create table if not exists market_video_features (
  id bigserial primary key,
  video_id uuid not null references videos(id) on delete cascade,
  niche text not null,
  observed_at timestamptz not null default now(),
  content_format text not null,
  duration_bucket text not null,
  title_style text not null,
  title_length_bucket text not null,
  age_bucket text not null,
  views_per_hour numeric(16,4) not null default 0,
  channel_velocity_multiple numeric(12,4),
  market_velocity_multiple numeric(12,4),
  engagement_proxy numeric(12,6),
  features jsonb not null default '{}'::jsonb
);
create index if not exists market_video_features_lookup_idx on market_video_features(niche,observed_at desc);
create index if not exists market_video_features_video_idx on market_video_features(video_id,observed_at desc);

create table if not exists market_pattern_snapshots (
  id bigserial primary key,
  niche text not null,
  content_format text not null,
  feature_name text not null,
  feature_value text not null,
  sample_size integer not null,
  unique_channels integer not null default 0,
  weighted_views bigint not null default 0,
  average_views_per_hour numeric(16,4),
  median_views_per_hour numeric(16,4),
  average_market_velocity_multiple numeric(12,4),
  outlier_rate numeric(9,6),
  average_engagement_proxy numeric(12,6),
  confidence numeric(6,4) not null default 0,
  payload jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now()
);
create index if not exists market_pattern_snapshots_lookup_idx on market_pattern_snapshots(niche,content_format,feature_name,feature_value,observed_at desc);
