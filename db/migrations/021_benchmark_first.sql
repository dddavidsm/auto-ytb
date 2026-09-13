alter table channels add column if not exists description text;
alter table channels add column if not exists benchmark_metadata jsonb not null default '{}'::jsonb;
alter table videos add column if not exists thumbnail_url text;
alter table videos add column if not exists benchmark_metadata jsonb not null default '{}'::jsonb;

create table if not exists benchmark_seed_channels (
  id bigserial primary key,
  name text not null,
  handle text not null unique,
  niche text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into benchmark_seed_channels(name,handle,niche) values
  ('fern','@fern-tv','documentary'),
  ('Hoog','@hoog-youtube','documentary'),
  ('LEMMiNO','@lemmino','documentary'),
  ('RealLifeLore','@RealLifeLore','geography/documentary'),
  ('Primal Space','@primalspace','space/science'),
  ('How Money Works','@howmoneyworks','business/finance'),
  ('MagnatesMedia','@magnatesmedia','business/documentary'),
  ('Search Party','@searchparty','documentary'),
  ('ColdFusion','@ColdFusion','technology/documentary'),
  ('The Infographics Show','@TheInfographicsShow','explainer'),
  ('AiTelly','@AiTelly','science/technology')
on conflict(handle) do update set name=excluded.name,niche=excluded.niche,active=true;

create table if not exists content_dna_snapshots (
  id bigserial primary key,
  channel_id uuid references channels(id) on delete cascade,
  video_id uuid references videos(id) on delete cascade,
  version integer not null default 1,
  dna jsonb not null,
  source_quality jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  check (channel_id is not null or video_id is not null)
);
create index if not exists content_dna_snapshots_video_idx on content_dna_snapshots(video_id,observed_at desc);
create index if not exists content_dna_snapshots_channel_idx on content_dna_snapshots(channel_id,observed_at desc);

create table if not exists pattern_clusters (
  id uuid primary key default gen_random_uuid(),
  niche text not null,
  name text not null,
  description text not null,
  evidence_count integer not null default 0,
  reference_videos jsonb not null default '[]'::jsonb,
  reference_channels jsonb not null default '[]'::jsonb,
  success_correlation numeric(8,3) not null default 0,
  confidence numeric(8,3) not null default 0,
  niche_specificity numeric(8,3) not null default 0,
  transferable boolean not null default false,
  evidence jsonb not null default '[]'::jsonb,
  observed_at timestamptz not null default now()
);
create index if not exists pattern_clusters_lookup_idx on pattern_clusters(niche,confidence desc,observed_at desc);

alter table opportunities add column if not exists evidence jsonb not null default '[]'::jsonb;
alter table opportunities add column if not exists reference_pack jsonb not null default '{}'::jsonb;
alter table opportunities add column if not exists score_breakdown jsonb not null default '{}'::jsonb;
alter table opportunities add column if not exists confidence numeric(8,3) not null default 0;

create table if not exists reference_packs (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references opportunities(id) on delete cascade,
  niche text not null,
  topic text,
  format text,
  version integer not null default 1,
  diversity jsonb not null default '{}'::jsonb,
  limitations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists reference_pack_items (
  id bigserial primary key,
  reference_pack_id uuid not null references reference_packs(id) on delete cascade,
  video_id uuid references videos(id) on delete set null,
  external_video_id text,
  channel_id uuid references channels(id) on delete set null,
  role text not null,
  evidence jsonb not null default '[]'::jsonb,
  outlier_score numeric(8,3),
  selected_because text not null
);
create index if not exists reference_pack_items_pack_idx on reference_pack_items(reference_pack_id,role);
