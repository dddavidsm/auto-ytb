alter table publications add column if not exists content_format text;
alter table publications drop constraint if exists publications_content_format_check;
alter table publications add constraint publications_content_format_check check (content_format is null or content_format in ('LONG_HORIZONTAL','SHORT_VERTICAL'));

create index if not exists idx_publications_channel_format on publications(channel_id, content_format, updated_at desc);

alter table opportunities add column if not exists recommended_format text;
alter table opportunities drop constraint if exists opportunities_recommended_format_check;
alter table opportunities add constraint opportunities_recommended_format_check check (recommended_format is null or recommended_format in ('LONG_HORIZONTAL','SHORT_VERTICAL','HYBRID'));

create table if not exists format_performance_snapshots (
  id bigserial primary key,
  channel_id uuid not null references channels(id) on delete cascade,
  content_format text not null check (content_format in ('LONG_HORIZONTAL','SHORT_VERTICAL')),
  captured_at timestamptz not null default now(),
  publication_count integer not null default 0,
  views bigint not null default 0,
  average_view_percentage numeric,
  average_view_duration_seconds numeric,
  share_rate numeric,
  subscribers_per_thousand numeric,
  revenue_usd numeric,
  production_cost_usd numeric,
  roi numeric,
  payload jsonb not null default '{}'::jsonb
);
create index if not exists idx_format_performance_channel_time on format_performance_snapshots(channel_id,content_format,captured_at desc);
