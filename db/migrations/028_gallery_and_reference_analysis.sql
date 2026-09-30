alter table production_runs add column if not exists deleted_at timestamptz;
create index if not exists idx_production_runs_gallery_visible on production_runs(created_at desc) where deleted_at is null;

create table if not exists video_reference_analyses (
  id uuid primary key default gen_random_uuid(),
  source_url text not null,
  youtube_video_id text,
  title text,
  status text not null default 'completed' check (status in ('queued','completed','failed')),
  analysis jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_video_reference_analyses_created on video_reference_analyses(created_at desc);
