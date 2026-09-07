alter table publications drop constraint if exists publications_state_check;
alter table publications add constraint publications_state_check
  check (state in ('rendered','private','reviewed','scheduled','public','rejected','failed'));

create table if not exists review_decisions (
  id bigserial primary key,
  publication_id uuid not null references publications(id) on delete cascade,
  action text not null check (action in ('approve','reject','schedule')),
  note text,
  publish_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_review_decisions_publication_time on review_decisions(publication_id,created_at desc);
