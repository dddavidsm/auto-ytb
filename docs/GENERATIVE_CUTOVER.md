# Generative Video Cutover

The canonical production entry point is still `scripts/run-autonomous-studio.mjs`. `/create` and `production:create` invoke that same entry point. Sourced production remains retrieval-first; generative production is an additional mode, not a second product.

## Modes

- `FOOTAGE_PRO`: real moving footage first. A missing non-documentary visual may be generated only after the sourced path has failed and the final asset is approved.
- `HYBRID_EDITORIAL`: real and generated moving footage can be combined.
- `GENERATIVE_EDITORIAL`: generated editorial footage is the primary visual source.
- `FULL_GENERATIVE`: external footage discovery is disabled; all final visual assets are generated video.
- `CHARACTER_SERIES`: full generative production with persistent character, world, and episode registries.

The runtime profile is selected from duration and aspect ratio, so Shorts and long-form share the same orchestrator and renderer.

## VIDEO_ONLY

Final manifests use `finalMediaPolicy: VIDEO_ONLY`. The production gate rejects `IMAGE`, `DOCUMENT`, `GRAPHIC`, placeholders, intentional stills, and synthetic footage without provenance. The renderer also rejects an image or missing asset before FFmpeg runs when that policy is present. Real video, generated video, animated maps/charts, screen captures, and motion graphics rendered as video remain valid.

Reference images may be stored and passed to a provider, but they cannot be inserted into the final timeline. A sourced run with an unresolved still fallback fails loudly and must search, rewrite, or generate a moving replacement.

## Providers

Video providers implement the common provider contract in `packages/providers/src/types.ts`. The Higgsfield adapter uses the official REST API, `HF_CREDENTIALS` or `HF_API_KEY_ID`/`HF_API_KEY_SECRET`, and records provider/model/request metadata. It is registered alongside Gemini and Runway; the production core does not import Higgsfield-specific request shapes.

Higgsfield Seedance 2.5 is model-aware in AUTO-YTB and can expose text-to-video, image-to-video, reference-to-video and video-edit through the common provider contract. A ChatGPT/MCP Higgsfield connection is deliberately not treated as a server-side AUTO-YTB credential. See `docs/HIGGSFIELD_INTEGRATION.md`.

The generative runtime can compose multiple legitimately configured video providers through a circuit-broken failover wrapper. Safe availability/quota/auth failures can move a compatible shot to the next provider; invalid requests and ambiguous post-submit timeouts do not trigger blind duplicate paid generations. Provider pricing must be known or conservatively estimated before generation.

Real generation is safety-gated by `REAL_GENERATION_ENABLED=true`. It is unset/false in development by default. Missing Higgsfield credentials produce a configuration error; no credential is invented and no purchase is attempted.

## Generation, QC, and repair

`GenerativeProductionOrchestrator` compiles a structured `ShotContract` using character/world references, calls the selected provider, probes the returned video, evaluates the configured quality floor, records the attempt, and either registers an approved synthetic illustration or diagnoses the failure. `RepairOrchestrator` changes the strategy (references, action complexity, camera, prompt, provider, or abort) and enforces a finite attempt count.

Generated clips are not accepted merely because they are valid moving MP4s. In MAX_QUALITY generative runs, the runtime creates a chronological temporal contact sheet from each generated clip and sends it through the existing `VisionProvider` contract. The reviewer is grounded on the exact semantic shot contract (subject, action, object, cause/result, character identity, world identity, style and motion). Material mismatches such as action/object failure, character/world drift, anatomy, impossible physics, object disappearance, morphing, temporal incoherence or style mismatch are hard rejection reasons. FFmpeg VIDEO_ONLY/freeze/loop checks remain independent hard gates.

The semantic QC evidence is persisted in asset metadata and receipts: reviewer, sampled-frame count, observed meaning, relevance, continuity, artifact quality, issue codes and token usage. The pipeline does not claim exact vision-review cost when the provider only reports token usage. If semantic review cannot run, the MAX_QUALITY path fails closed rather than promoting an unverified clip.

Each attempt persists request, compiled prompt, references, provider/model, estimated/actual cost, latency, output, QC result, failure categories, and repair relation. Synthetic media is never `DIRECT_EVIDENCE`.

## Cost and learning

`CostOptimizer` tracks reservations, spend, rejected generation cost, accepted usable seconds, provider/model breakdown, remaining budget, and cost per accepted usable second. `GenerationPerformanceMemory` persists historical keep rate, quality, latency, failure categories, and cost per accepted second and can rank future candidates with that history.

Provider-reported billing is distinguished from estimated accounting. Failover uses a conservative reservation ceiling so a fallback cannot silently exceed the amount reserved for a shot. Vision-review token usage is recorded separately when the provider does not return authoritative billing.

## Character and world continuity

`CharacterRegistry`, `WorldRegistry`, and `SeriesEpisodeMemoryRegistry` persist versioned identities under a run's registry directory. Immutable identity fields cannot drift silently. Prompts are compiled from the registry rather than redefining a recurring character ad hoc for every shot.

## Inputs and benchmarks

The generic CLI accepts the existing `--mode`, `--prompt`, `--script`, `--duration`, `--aspect-ratio`, `--character`, and `--budget` conventions. Example:

```text
npm run production:create -- --mode full-generative --prompt "..." --duration 30 --aspect-ratio 9:16 --budget 2
```

`scripts/test-generative-cutover.mjs` is deterministic and does not call a paid provider. The generative benchmark briefs live in `benchmark-inputs/generative-cutover-*.json`; they are inputs, not topic-specific production logic. Real D/E/F renders require explicit real-generation enablement and provider credentials/budget.

## Real Generative Validation (2026-09-18)

This section records an actual controlled validation run, not a contract fixture.

- Provider exercised: Google Gemini API, Veo 3.1 Fast and Veo 3.1 Lite preview models. The repository default remains opt-in only; `REAL_GENERATION_ENABLED=true` was supplied only to the validation process.
- Budget guard: a shared USD ledger enforced a $10 global hard cap, per-run budgets, reservations before each shot, and settlement after each provider response. Empty price configuration is not treated as free; Gemini pricing is resolved from explicit configuration or the versioned provider default.
- D produced a real 31.7-second 9:16 MP4 with 32 generated seconds planned, 0 image seconds, 8 accepted shots and 1 rejected repair sequence. The technical gates passed and the MP4 was archived, but frame review found weak narrative adherence (generic indoor cat coverage instead of a convincing rescue progression), so it remains a human-review candidate rather than a quality success.
- C was repaired without generation: its single still segment was replaced by a real moving pizza-dough segment from the existing vault. The repaired MP4 is 71.3 seconds, passes VIDEO_ONLY/freeze/loop probing, and reports 0 image seconds.
- A was revalidated without regeneration. Its existing 80.1-second MP4 passes the current VIDEO_ONLY/freeze/loop probe and contains no image scene in its canonical timeline.
- E reached the real provider and was stopped after three rejected attempts on the third shot; the run is `FAILED_QUALITY_GATE` and no incomplete MP4 was promoted.
- F completed research, moving-media discovery, acquisition, and semantic analysis, but both strict word-alignment attempts were below the 88% floor (87% and 86%). No synthetic clip was generated and no invalid MP4 was promoted.
- B remains blocked by the historical image segments under VIDEO_ONLY. Exact moving replacements were not available for every named vehicle within the remaining validation budget, so no wrong-model substitute was promoted.

The validation therefore proves real provider calls, billing reservation, rejection/repair behavior, and VIDEO_ONLY repair, but does not claim the full A-F milestone complete. D's visual result and E/F/B require further work before publication readiness.

## Quality recovery validation (2026-09-18)

The recovery pass adds a structured creative gate before generation and before final promotion. It checks explicit story-beat coverage, semantic shot contracts, hook/payoff specificity, visual causality, shot diversity, redundancy, pacing, and a human-review quality floor. A technical render is not eligible for `READY_FOR_HUMAN_REVIEW` when the story is only a sequence of generic or repeated shots.

High-risk shot plans are redesigned into one continuous, filmable action while retaining the subject, object, cause, result, emotion, and story-beat contract. Provider quota/authentication failures now trip a finite abort path instead of spending on identical retries. Failed generative runs persist attempts, repair decisions, cost, and provider failure categories before exiting.

The closeout run used the isolated `.data/autonomous-production/validation-closeout-budget.json` ledger. Gemini returned `429 RESOURCE_EXHAUSTED` for both the Lite and Fast D hook attempts; the new iteration therefore recorded $1.20 of estimated rejected generation cost and stopped further calls. No Higgsfield server credential was configured. This is an external quota limitation, not a successful D/E validation. A and C remain valid and were not regenerated; F recovered word alignment but still stopped at an honest visual-match failure for the hyperbaric-chamber beat; B still requires exact moving replacements for its historical still scenes.

## Temporal semantic quality gate (2026-09-22)

The post-validation hardening removes the old assumption that provider success plus an FFprobe-valid MP4 implies semantic success. Each generated clip now receives temporal visual review before it can enter the approved asset registry. A deterministic FFmpeg regression verifies the contact-sheet extraction, while fake `VisionProvider` fixtures cover strong acceptance, action mismatch, identity/anatomy failure and preservation of independent freeze/VIDEO_ONLY failures without making paid calls in CI.

This directly targets the failure class observed in D/E: visually polished but narratively generic footage, missing interactions, anatomy drift and temporal inconsistency can no longer receive hardcoded `STRONG` quality dimensions merely because the file moves and decodes correctly.
