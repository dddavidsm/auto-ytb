alter table channel_connections drop constraint if exists channel_connections_provider_check;
alter table channel_connections add constraint channel_connections_provider_check check (provider in ('youtube','tiktok','instagram','facebook'));

create table if not exists reference_assets (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  title text not null,
  source_url text not null,
  asset_kind text not null default 'url' check (asset_kind in ('url','youtube','upload')),
  thumbnail_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reference_assets_owner_created_idx on reference_assets(lower(owner_email), created_at desc);
