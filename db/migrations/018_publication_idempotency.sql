-- A production run owns exactly one canonical publication record. This prevents retries from
-- inserting duplicate publication rows and makes YouTube recovery/upsert deterministic.
create unique index if not exists uq_publications_production_run
  on publications(production_run_id)
  where production_run_id is not null;
