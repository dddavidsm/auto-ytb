create table if not exists channel_connections (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  provider text not null check (provider='youtube'),
  owner_email text not null,
  refresh_token_ciphertext text not null,
  status text not null default 'connected' check (status in ('connected','revoked','error')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(channel_id,provider)
);
create index if not exists channel_connections_owner_idx on channel_connections(lower(owner_email),provider,status);
