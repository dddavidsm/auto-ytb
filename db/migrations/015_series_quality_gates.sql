create table if not exists series_episode_quality_reports (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references series(id) on delete cascade,
  episode_id uuid not null references series_episodes(id) on delete cascade,
  production_run_id uuid references production_runs(id) on delete cascade,
  report_type text not null check (report_type in ('kids_family','visual_continuity')),
  status text not null check (status in ('passed','warn','blocked')),
  score numeric(7,3) not null check (score between 0 and 100),
  report jsonb not null default '{}'::jsonb,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(episode_id,report_type)
);
create index if not exists series_episode_quality_reports_series_idx on series_episode_quality_reports(series_id,report_type,updated_at desc);
