create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null unique,
  kind text not null,
  channel_id uuid references channels(id) on delete set null,
  opportunity_id uuid references opportunities(id) on delete set null,
  state text not null default 'queued' check (state in ('queued','running','retry','succeeded','dead','cancelled')),
  priority integer not null default 50 check (priority between 0 and 100),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 4 check (max_attempts between 1 and 20),
  not_before timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  payload jsonb not null default '{}'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists idx_jobs_claim on jobs(state, not_before, priority desc, created_at) where state in ('queued','retry');
create index if not exists idx_jobs_opportunity on jobs(opportunity_id, created_at desc) where opportunity_id is not null;

create table if not exists daily_budget_ledger (
  id bigserial primary key,
  channel_key text not null,
  spend_date date not null,
  reserved_usd numeric not null default 0 check (reserved_usd >= 0),
  actual_usd numeric not null default 0 check (actual_usd >= 0),
  jobs_scheduled integer not null default 0 check (jobs_scheduled >= 0),
  updated_at timestamptz not null default now(),
  unique(channel_key, spend_date)
);

create table if not exists job_events (
  id bigserial primary key,
  job_id uuid not null references jobs(id) on delete cascade,
  event_type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_job_events_job_time on job_events(job_id, created_at desc);
