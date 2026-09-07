# auto-ytb

Autonomous YouTube intelligence, editorial and production operating system focused on profitable, monetizable, original content.

## Current milestone: End-to-end autonomous MVP v0.6

The repository contains an executable provider-agnostic path from market opportunity to a private-upload-ready video artifact, plus live provider adapters and an owned-channel analytics learning loop.

### Implemented
- market/niche intelligence, opportunity scoring, trend acceleration, competitor discovery, outliers and adaptive snapshots
- evidence-gated niche winner selection
- PostgreSQL intelligence + editorial + production + analytics persistence
- research dossier engine with source quality, claims, contradictions, timeline and story-angle ranking
- retention-aware script generation contract
- 3-way title/thumbnail packaging hypotheses
- scene planner that minimizes expensive generative video
- live adapters for Tavily search, OpenAI Responses, ElevenLabs voice and Runway media
- cost estimation before media generation
- factual/provenance/originality/cost/synthetic-media QA gates
- FFmpeg local renderer
- Google OAuth, private YouTube uploads, scheduling primitives and YouTube Analytics client
- retention analysis, per-video economics and persisted learning signals
- end-to-end orchestrator and multi-channel OS primitives
- deterministic mock providers and full mock pipeline
- local control-plane dashboard
- daily GitHub Actions market radar and CI
- database migrator, OAuth bootstrap and Analytics sync commands

## Validate without API keys

```bash
npm install
npm run test:all
npm run pipeline:mock
npm run doctor
```

The mock pipeline writes `.data/pipeline-mock-latest.json` and reaches `READY_FOR_REVIEW` without external providers.

## Live intelligence

```bash
export YOUTUBE_API_KEY=...
npm run niche:live
npm run discover:competitors -- --niche future-tech-business
npm run radar -- --query "AI agents" --days 7
```

## Go live

Production activation is configuration-first. After supplying credentials:

```bash
npm run migrate
npm run oauth:url
npm run oauth:exchange -- --code=YOUR_CODE
npm run doctor
npm run analytics:sync -- --days=28
```

See [`docs/GO_LIVE.md`](docs/GO_LIVE.md), [`docs/API_CONNECTIONS.md`](docs/API_CONNECTIONS.md) and `.env.example`.

## Safety defaults

- public publishing is disabled by default
- private upload precedes public review/scheduling
- production cost cap
- synthetic-media disclosure gate
- factual/provenance QA
- secrets never belong in Git

## Core principle

Optimize expected profitable watch value, not raw views:

`P(click) × expected watch time × satisfaction × return probability × monetization - cost - risk`

## Local control plane

```bash
npm run dashboard
# http://localhost:4310
```
