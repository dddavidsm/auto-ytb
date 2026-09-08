alter table series add column if not exists automation_profile jsonb not null default '{}'::jsonb;
alter table series add column if not exists current_automation_profile_version integer not null default 0;

create table if not exists series_automation_profiles (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references series(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft','active','retired')),
  profile jsonb not null,
  validation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  unique(series_id,version)
);
create unique index if not exists series_one_active_automation_profile_idx on series_automation_profiles(series_id) where status='active';
create index if not exists series_automation_profiles_recent_idx on series_automation_profiles(series_id,version desc);
