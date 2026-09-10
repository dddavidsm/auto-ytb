-- Voice providers and alignment retiming can produce fractional seconds. Keep the
-- durable script contract precise enough to preserve those timings.
alter table scripts
  alter column target_duration_seconds type numeric(10,3)
  using target_duration_seconds::numeric;
