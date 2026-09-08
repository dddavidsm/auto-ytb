create table if not exists distribution_attempts (
  id bigserial primary key,
  publication_id uuid not null references publications(id) on delete cascade,
  platform text not null check (platform in ('youtube','tiktok','instagram','facebook')),
  state text not null default 'queued' check (state in ('queued','publishing','processing','published','scheduled','blocked','retry','failed')),
  external_id text,
  external_url text,
  publish_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(publication_id,platform)
);
create index if not exists idx_distribution_attempts_state on distribution_attempts(state,updated_at);
create index if not exists idx_distribution_attempts_publication on distribution_attempts(publication_id,platform);
