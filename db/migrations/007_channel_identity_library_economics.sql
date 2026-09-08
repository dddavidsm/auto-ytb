alter table channels add column if not exists channel_key text;
alter table channels add column if not exists identity jsonb not null default '{}'::jsonb;
alter table channels add column if not exists voice_profile jsonb not null default '{}'::jsonb;
alter table channels add column if not exists autonomy_policy jsonb not null default '{}'::jsonb;
alter table channels add column if not exists library_policy jsonb not null default '{}'::jsonb;
alter table channels add column if not exists brand_assets jsonb not null default '{}'::jsonb;
create unique index if not exists idx_channels_owned_channel_key on channels(channel_key) where channel_key is not null and is_owned=true;

create table if not exists channel_identity_versions (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  version integer not null,
  identity jsonb not null,
  reason text,
  created_at timestamptz not null default now(),
  unique(channel_id,version)
);

create table if not exists channel_brand_assets (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  asset_type text not null check (asset_type in ('profile','banner','watermark','character_reference','thumbnail_reference','social_avatar','social_banner','style_guide')),
  uri text not null,
  provider text,
  source_prompt text,
  version integer not null default 1,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_channel_brand_assets_active on channel_brand_assets(channel_id,asset_type,active);

create table if not exists content_routing_decisions (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references opportunities(id) on delete cascade,
  channel_id uuid references channels(id) on delete set null,
  channel_key text,
  route_score numeric not null check (route_score between 0 and 100),
  route_mode text not null check (route_mode in ('EXISTING_CHANNEL','NEW_CHANNEL_CANDIDATE','REJECT')),
  style_fingerprint jsonb not null default '{}'::jsonb,
  rationale jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_content_routing_channel on content_routing_decisions(channel_id,created_at desc);

create table if not exists audio_alignment_runs (
  id uuid primary key default gen_random_uuid(),
  production_run_id uuid not null references production_runs(id) on delete cascade,
  provider text not null,
  model text,
  language text not null,
  voice_id text not null,
  audio_uri text not null,
  duration_seconds numeric not null,
  alignment jsonb not null default '{}'::jsonb,
  alignment_confidence numeric,
  created_at timestamptz not null default now()
);

create table if not exists video_economics (
  id bigserial primary key,
  production_run_id uuid not null references production_runs(id) on delete cascade,
  publication_id uuid references publications(id) on delete set null,
  captured_at timestamptz not null default now(),
  research_cost_usd numeric not null default 0,
  llm_cost_usd numeric not null default 0,
  voice_cost_usd numeric not null default 0,
  image_cost_usd numeric not null default 0,
  video_cost_usd numeric not null default 0,
  render_cost_usd numeric not null default 0,
  storage_cost_usd numeric not null default 0,
  thumbnail_cost_usd numeric not null default 0,
  other_cost_usd numeric not null default 0,
  total_cost_usd numeric generated always as (research_cost_usd+llm_cost_usd+voice_cost_usd+image_cost_usd+video_cost_usd+render_cost_usd+storage_cost_usd+thumbnail_cost_usd+other_cost_usd) stored,
  estimated_revenue_usd numeric,
  youtube_revenue_usd numeric,
  affiliate_revenue_usd numeric,
  sponsor_revenue_usd numeric,
  other_revenue_usd numeric,
  total_revenue_usd numeric,
  profit_usd numeric,
  roi numeric,
  revenue_per_1000_views_usd numeric,
  watch_minutes_per_dollar numeric,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists idx_video_economics_run_time on video_economics(production_run_id,captured_at desc);

create table if not exists content_library_items (
  id uuid primary key default gen_random_uuid(),
  production_run_id uuid references production_runs(id) on delete cascade,
  channel_id uuid references channels(id) on delete cascade,
  channel_key text not null,
  stage text not null check (stage in ('research','script','audio','alignment','visuals','thumbnails','render','published','analytics','archive')),
  provider text not null,
  external_id text,
  uri text,
  relative_path text not null,
  content_type text,
  bytes bigint,
  checksum text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(provider,relative_path)
);
create index if not exists idx_library_channel_stage on content_library_items(channel_key,stage,created_at desc);
