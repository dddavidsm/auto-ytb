alter table provider_cost_events
  add column if not exists priced boolean generated always as (cost_usd is not null) stored;

comment on column provider_cost_events.priced is
  'Derived pricing status for dashboard/reporting: true when cost_usd is known, false when the event has not been priced.';
