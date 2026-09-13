alter table production_runs add column if not exists video_id text;
alter table production_runs add column if not exists channel_id uuid references channels(id) on delete set null;
alter table production_runs add column if not exists format text;
alter table production_runs add column if not exists mode text not null default 'DRAFT' check (mode in ('DRY_RUN','DRAFT','FINAL'));
alter table production_runs add column if not exists status text not null default 'PLANNED';
alter table production_runs add column if not exists started_at timestamptz;
alter table production_runs add column if not exists completed_at timestamptz;
alter table production_runs add column if not exists budget_usd numeric not null default 0 check (budget_usd >= 0);
alter table production_runs add column if not exists estimated_cost_usd numeric not null default 0 check (estimated_cost_usd >= 0);
alter table production_runs add column if not exists actual_cost_usd numeric not null default 0 check (actual_cost_usd >= 0);
alter table production_runs add column if not exists currency text not null default 'USD';
alter table production_runs add column if not exists current_stage text;
alter table production_runs add column if not exists failure_stage text;
alter table production_runs add column if not exists failure_reason text;
alter table production_runs add column if not exists resume_from text;
alter table production_runs add column if not exists config_snapshot jsonb not null default '{}'::jsonb;
create index if not exists idx_production_runs_status on production_runs(status, updated_at desc);

create table if not exists production_subtasks (
  id uuid primary key default gen_random_uuid(),
  production_run_id uuid not null references production_runs(id) on delete cascade,
  task_key text not null,
  kind text not null,
  scene_id text,
  dependencies jsonb not null default '[]'::jsonb,
  provider text,
  model text,
  input_hash text not null,
  config_hash text not null,
  artifact_hash text,
  artifact_id uuid,
  attempt integer not null default 0 check (attempt >= 0),
  status text not null default 'PENDING' check (status in ('PENDING','RUNNING','COMPLETE','FAILED','BLOCKED','CANCELLED')),
  estimated_cost_usd numeric not null default 0 check (estimated_cost_usd >= 0),
  actual_cost_usd numeric not null default 0 check (actual_cost_usd >= 0),
  fallback_strategy jsonb not null default '{}'::jsonb,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(production_run_id, task_key)
);
create index if not exists idx_production_subtasks_resume on production_subtasks(production_run_id, status, task_key);

create table if not exists generated_artifacts (
  id uuid primary key default gen_random_uuid(),
  production_run_id uuid not null references production_runs(id) on delete cascade,
  scene_id text,
  type text not null,
  mime_type text not null,
  provider text,
  model text,
  storage_key text not null,
  local_path text,
  size_bytes bigint,
  duration_seconds numeric,
  resolution jsonb,
  content_hash text not null,
  created_at timestamptz not null default now(),
  cost_usd numeric not null default 0,
  is_draft boolean not null default true,
  is_final boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  unique(production_run_id, content_hash)
);
create index if not exists idx_generated_artifacts_run_scene on generated_artifacts(production_run_id, scene_id, created_at);

create table if not exists provider_calls (
  id uuid primary key default gen_random_uuid(),
  production_run_id uuid not null references production_runs(id) on delete cascade,
  subtask_id uuid references production_subtasks(id) on delete set null,
  provider text not null,
  model text,
  capability text not null,
  status text not null,
  request_hash text,
  response_metadata jsonb not null default '{}'::jsonb,
  latency_ms integer,
  cost_usd numeric not null default 0,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists idx_provider_calls_run_time on provider_calls(production_run_id, created_at);

create table if not exists production_cost_entries (
  id uuid primary key default gen_random_uuid(),
  production_run_id uuid not null references production_runs(id) on delete cascade,
  subtask_id uuid references production_subtasks(id) on delete set null,
  category text not null,
  provider text,
  operation text not null,
  estimated_usd numeric not null default 0,
  actual_usd numeric not null default 0,
  currency text not null default 'USD',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_production_cost_run_category on production_cost_entries(production_run_id, category, created_at);

create table if not exists production_quality_gates (
  id uuid primary key default gen_random_uuid(),
  production_run_id uuid not null references production_runs(id) on delete cascade,
  gate_id text not null,
  status text not null,
  message text not null,
  critical boolean not null default true,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(production_run_id, gate_id)
);

create table if not exists production_reports (
  id uuid primary key default gen_random_uuid(),
  production_run_id uuid not null references production_runs(id) on delete cascade,
  report_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique(production_run_id, report_type)
);
