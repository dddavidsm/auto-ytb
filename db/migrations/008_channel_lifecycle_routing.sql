alter table channels add column if not exists lifecycle_state text not null default 'ready';
alter table channels add column if not exists credentials_ref text;
alter table channels add column if not exists config_path text;
alter table channels add column if not exists automation_enabled boolean not null default true;
alter table channels add column if not exists last_routed_at timestamptz;

do $$ begin
  alter table channels add constraint channels_lifecycle_state_check
    check (lifecycle_state in ('candidate','brand_ready','awaiting_channel','ready','paused','retired'));
exception when duplicate_object then null;
end $$;

create table if not exists channel_candidates (
  id uuid primary key default gen_random_uuid(),
  candidate_key text not null unique,
  source_opportunity_id uuid references opportunities(id) on delete set null,
  language text not null,
  proposed_name text not null,
  proposed_positioning text not null,
  character_mode text not null default 'none' check (character_mode in ('none','persistent-character','host-persona')),
  character_name text,
  style_fingerprint jsonb not null default '{}'::jsonb,
  proposed_identity jsonb not null default '{}'::jsonb,
  brand_plan jsonb not null default '{}'::jsonb,
  route_score numeric not null default 0 check (route_score between 0 and 100),
  opportunity_score numeric not null default 0 check (opportunity_score between 0 and 100),
  status text not null default 'discovered' check (status in ('discovered','brand_queued','brand_ready','awaiting_channel','connected','rejected')),
  youtube_channel_id text,
  promoted_channel_id uuid references channels(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_channel_candidates_status_score on channel_candidates(status,opportunity_score desc,created_at desc);

create table if not exists channel_social_profiles (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references channels(id) on delete cascade,
  channel_candidate_id uuid references channel_candidates(id) on delete cascade,
  platform text not null,
  handle text,
  profile_url text,
  state text not null default 'planned' check (state in ('planned','provisioning','active','paused','unsupported')),
  identity_payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((channel_id is not null) <> (channel_candidate_id is not null))
);
create unique index if not exists idx_social_profile_channel_platform on channel_social_profiles(channel_id,platform) where channel_id is not null;
create unique index if not exists idx_social_profile_candidate_platform on channel_social_profiles(channel_candidate_id,platform) where channel_candidate_id is not null;
