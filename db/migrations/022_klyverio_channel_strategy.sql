create table if not exists channel_strategies (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null unique references channels(id) on delete cascade,
  version integer not null default 1,
  selection_mode text not null default 'OPPORTUNITY_DRIVEN',
  target_markets jsonb not null default '[]'::jsonb,
  active_formats jsonb not null default '[]'::jsonb,
  brand_identity jsonb not null default '{}'::jsonb,
  voice_identity jsonb not null default '{}'::jsonb,
  visual_identity jsonb not null default '{}'::jsonb,
  cost_policy jsonb not null default '{}'::jsonb,
  production_preferences jsonb not null default '{}'::jsonb,
  analytics_settings jsonb not null default '{}'::jsonb,
  experiment_policy jsonb not null default '{}'::jsonb,
  statistics_status text not null default 'NO_CREDENTIALS',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

with channel_row as (
  insert into channels(channel_key,title,handle,language,country,niche,is_owned,is_competitor,identity,voice_profile,autonomy_policy,library_policy)
  values ('klyverio-en','Klyverio','@klyverio','en','GLOBAL','umbrella-opportunity-driven',true,false,
    '{"archetype":"adaptive-editorial","tone":["curious","clear","credible","cinematic"]}'::jsonb,
    '{"primaryLanguage":"en","accent":"neutral-international-english","alignmentRequired":true}'::jsonb,
    '{"autonomyMode":"REVIEW_REQUIRED","allowAutomaticPublicScheduling":false,"blockOnUnresolvedRights":true,"blockOnPolicyWarning":true}'::jsonb,
    '{"provider":"google-drive","rootFolder":"AUTO-YTB","channelFolder":"klyverio-en"}'::jsonb)
  on conflict (channel_key) where is_owned=true do update set title=excluded.title,handle=excluded.handle,language=excluded.language,country=excluded.country,niche=excluded.niche,updated_at=now()
  returning id
)
insert into channel_strategies(channel_id,target_markets,active_formats,brand_identity,voice_identity,visual_identity,cost_policy,production_preferences,analytics_settings,experiment_policy,statistics_status)
select id,
  '["global English-speaking"]'::jsonb,
  '["DOCUMENTARY","EXPLAINER","BUSINESS","SCIENCE","HISTORY","MYSTERY","RANKING","STORY","CHARACTER_LED","SHORT"]'::jsonb,
  '{"positioning":"Evidence-led original stories selected by opportunity, not a fixed niche.","tone":["curious","clear","credible","cinematic"]}'::jsonb,
  '{"language":"en","accent":"neutral-international-english","continuity":"stable channel voice when configured"}'::jsonb,
  '{"rule":"one dominant idea per frame","avoid":["fake logos","copied thumbnails","generic keyword slideshow"]}'::jsonb,
  '{"currency":"USD","defaultBudgetUsd":5,"draftBeforeFinal":true,"hardBudgetCap":true}'::jsonb,
  '{"referenceFirst":true,"evidenceFirst":true,"reuseExistingProductionEngine":true}'::jsonb,
  '{"marketEvidenceWeight":0.9,"ownedEvidenceWeight":0.1,"importOwnedMetricsWhenAvailable":true,"classifyEstimatedSeparately":true}'::jsonb,
  '{"maxVariablesPerExperiment":1,"exploreUntilOwnedSample":8,"requireEvidenceBeforeScale":true}'::jsonb,
  'NO_CREDENTIALS'
from channel_row
on conflict(channel_id) do update set version=channel_strategies.version+1,updated_at=now();
