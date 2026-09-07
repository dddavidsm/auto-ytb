# Architecture decisions

## ADR-001: English-first master channel
Status: provisional until Niche Discovery reaches sufficient confidence.
Reason: larger addressable audience, sponsor inventory, cross-language reuse and strong fit for faceless documentary production.

## ADR-002: Long-form is the economic core
Shorts are discovery/testing assets. Long-form is the primary unit for watch time, monetization, audience depth and sponsor inventory.

## ADR-003: Search is scarce; enrichment is cheap
YouTube search queries are candidate generation only. Once channels/videos are known, channel uploads playlists and list endpoints maintain the intelligence graph.

## ADR-004: Evidence confidence gates niche selection
No niche is promoted to PRIMARY from qualitative priors alone. Observed market evidence must raise confidence first.

## ADR-005: No autonomous public publishing initially
Production may be autonomous, but first releases pass a final review gate and are uploaded private before scheduling. This minimizes factual, copyright and policy failures while the system learns.

## ADR-006: Profitability is a first-class metric
Every video eventually stores API/LLM/TTS/image/video/render/storage costs alongside revenue. The objective is profitable expected watch value, not raw views.

## GitHub as canonical source of truth

- Canonical repository: `dddavidsm/auto-ytb`.
- Every development iteration must end with a Git commit and synchronization to the canonical GitHub repository.
- Secrets, API keys, local data, build caches and generated artifacts must never be committed.
- `.env` files remain local; `.env.example` documents required variables without values.
- Direct changes to the project are not considered complete until the remote repository reflects them.
