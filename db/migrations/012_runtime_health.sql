create table if not exists runtime_heartbeats (
  role text not null check (role in ('worker','scheduler','web','maintenance')),
  instance_id text not null,
  state text not null default 'starting',
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  primary key (role,instance_id)
);

create index if not exists runtime_heartbeats_role_seen_idx on runtime_heartbeats(role,last_seen_at desc);
