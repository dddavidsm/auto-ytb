alter table analytics_snapshots add column if not exists data_mode text not null default 'REAL' check (data_mode in ('REAL','FIXTURE','HYBRID'));
alter table analytics_snapshots add column if not exists metric_provenance jsonb not null default '{}'::jsonb;
create index if not exists idx_analytics_snapshots_mode on analytics_snapshots(data_mode, captured_at desc);
