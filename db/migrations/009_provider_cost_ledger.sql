create table if not exists provider_cost_events (
  id bigserial primary key,
  production_run_id uuid not null references production_runs(id) on delete cascade,
  channel_id uuid references channels(id) on delete set null,
  event_key text not null,
  stage text not null,
  provider text not null,
  model text,
  operation text not null,
  input_units numeric,
  output_units numeric,
  unit_name text,
  duration_seconds numeric,
  quantity numeric,
  cost_usd numeric,
  estimated boolean not null default true,
  pricing_source text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(production_run_id,event_key)
);
create index if not exists idx_provider_cost_run_stage on provider_cost_events(production_run_id,stage,created_at);
create index if not exists idx_provider_cost_provider_model on provider_cost_events(provider,model,created_at desc);
create index if not exists idx_provider_cost_channel_time on provider_cost_events(channel_id,created_at desc) where channel_id is not null;
