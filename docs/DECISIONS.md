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

## ADR-007: Recurring formats become versioned Series IP
A repeatable format with persistent identity is represented as a Series with an active versioned Bible rather than as prompt fragments. Character invariants, world rules, style rules, audience rules, episode grammar, prompt packs, story arcs and canonical memory are durable data. An episode may advance narrative state but may not rewrite immutable character/style identity.

## ADR-008: Series release fails closed
A Series episode cannot autonomously reach public scheduling until its episode memory is compiled and continuity is `passed`. It must also have an accepted visual-continuity report. `MADE_FOR_KIDS` series additionally require an accepted Kids & Family quality report. Missing reports are blockers, including when a quality worker fails before creating a report.

## ADR-009: Child-directed content has a stricter quality layer
`MADE_FOR_KIDS` is not treated as a metadata flag alone. The pipeline carries an explicit age band, vocabulary/safety/emotional rules, deterministic Kids & Family checks and YouTube `selfDeclaredMadeForKids` propagation. Unsafe imitation, manipulative child-directed promotion, graphic content, misleading educational certainty and missing narrative payoff are hard blockers; softer language/structure concerns produce warnings.

## ADR-010: Pixel-level continuity is sampled before release
Prompt/reference provenance is necessary but insufficient proof of visual consistency. For recurring IP, representative generated images/video keyframes are compared semantically with canonical character/style references. Severe identity/style drift blocks release. Source/procedural-only series without persistent characters can mark this gate not-applicable rather than paying for unnecessary vision inspection.

## ADR-011: Multiple visual references use a canonical keyframe bridge for video
The image generator can combine multiple canonical references while the current Gen-4.5 image-to-video path is anchored by one prompt image. When at least two canonical references are active, the runtime first creates a reference-conditioned keyframe and animates that keyframe. The bridge image cost is included in the pre-render production budget and in the provider cost ledger.

## ADR-012: Quality constrains scaling, not only publication
Series strategy combines private Analytics/economics with production-quality evidence. Strong audience/ROI metrics cannot promote a series to `SCALE` when visual/Kids quality coverage is incomplete or drifting. Severe recurring quality weakness forces `REVIEW`; isolated warnings may permit `CONTINUE` while the system gathers more evidence.

## GitHub as canonical source of truth

- Canonical repository: `dddavidsm/auto-ytb`.
- Every development iteration must end with a Git commit and synchronization to the canonical GitHub repository.
- Secrets, API keys, local data, build caches and generated artifacts must never be committed.
- `.env` files remain local; `.env.example` documents required variables without values.
- Direct changes to the project are not considered complete until the remote repository reflects them.
