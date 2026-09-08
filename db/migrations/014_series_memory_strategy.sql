create table if not exists series_memory_compilations (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references series(id) on delete cascade,
  episode_id uuid not null references series_episodes(id) on delete cascade,
  bible_version_id uuid references series_bibles(id) on delete restrict,
  status text not null default 'compiled' check (status in ('compiled','conflict','blocked')),
  summary text not null,
  canonical_facts jsonb not null default '[]'::jsonb,
  arc_updates jsonb not null default '[]'::jsonb,
  next_episode_seeds jsonb not null default '[]'::jsonb,
  conflicts jsonb not null default '[]'::jsonb,
  model text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(episode_id)
);
create index if not exists series_memory_compilations_series_idx on series_memory_compilations(series_id,created_at desc);

create table if not exists series_strategy_decisions (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references series(id) on delete cascade,
  decision text not null check (decision in ('LEARN','CONTINUE','SCALE','PAUSE','REVIEW')),
  confidence numeric(6,5) not null default 0,
  score numeric(7,3) not null default 0,
  rationale jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now()
);
create index if not exists series_strategy_recent_idx on series_strategy_decisions(series_id,observed_at desc);

alter table series_episodes add column if not exists memory_compiled_at timestamptz;
alter table series_episodes add column if not exists continuity_status text not null default 'pending' check (continuity_status in ('pending','passed','conflict','blocked'));
