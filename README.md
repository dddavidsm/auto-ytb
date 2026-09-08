# auto-ytb

Autonomous YouTube **Channel Operating System** for discovering opportunities, producing original videos, reviewing quality, publishing safely, measuring economics and learning what works.

## Current milestone: Autonomous Channel OS v0.12

The repository now contains an end-to-end, provider-agnostic path from public market intelligence to a privately reviewable Full-HD render and, when a Channel DNA enables `FULL_AUTONOMOUS`, automated scheduling/publication after hard quality, rights and budget gates.

The operator is not part of the production critical path. The secure web control plane exists to observe, preview and audit what the system is doing.

## End-to-end flow

```text
YouTube / market signals
        ↓
Market Pattern Lab + outliers + trends
        ↓
Opportunity Engine
        ↓
Channel Router / Channel DNA
        ↓
Research + claims + provenance
        ↓
Script + Packaging A/B/C + Storyboard
        ↓
Attention & Virality Preflight
        ↓ fail
Automatic rewrite / repackage / replan
        ↓ pass
Timestamped narration
        ↓
Audio ↔ script ↔ visual synchronization
        ↓
Hybrid Visual Engine
        ↓
Thumbnails + Full-HD render
        ↓
Factual / rights / originality / cost QA
        ↓
Final FFmpeg/ffprobe media inspection
        ↓
Private YouTube upload
        ↓
Autonomous publication policy
        ↓
Google Drive library
        ↓
YouTube Analytics + revenue + retention
        ↓
Creative Performance Lab
        ↓
Learned hook / narrative / visual / format / cost guidance
        ↓
Next video
```

## What is implemented

### Intelligence
- YouTube market scanning with quota-aware discovery
- trend velocity, acceleration and persistence
- competitor discovery and age-adjusted outliers
- topic clustering and cross-source evidence
- opportunity scoring with independent policy/copyright/factual hard gates
- public **Market Pattern Lab** for observable competitor traits: title style/length, duration bucket, format, age, views/hour, relative velocity, outlier rate and public engagement proxy
- no fabricated competitor CTR, retention, RPM or revenue

### Multi-channel / brand OS
- Channel DNA with language, audience, voice, visual identity, character/persona, formats, economics and autonomy policy
- automatic opportunity → channel routing
- isolated OAuth credentials per channel
- new-channel candidates rather than mixing incompatible styles into an existing audience
- persistent character/brand blueprints, reference packs, banner/avatar/watermark/social assets
- Google Drive organization per channel and production stage

### Editorial + attention
- research dossiers with source quality, claims, contradictions, timelines and ranked story angles
- native-English-first script generation by default
- three differentiated packaging hypotheses
- format-aware Shorts vs long-form structure
- mandatory **Attention & Virality Review Engine** scoring:
  - promise match
  - hook strength
  - narrative momentum
  - story arc
  - visual communication
  - pattern variation
  - payoff
  - clarity
  - format fit
- automatic script/packaging/storyboard repair before expensive media generation when the attention score is below threshold

### Audio / visuals / render
- ElevenLabs timestamped narration contract
- script/scene retiming to real TTS duration
- hybrid visual planning: source-backed evidence, charts, deterministic motion graphics, AI images and selective premium AI video
- provenance and license classification for source-backed media
- 3-way deterministic thumbnail composition
- Full-HD 1920×1080 long-form and 1080×1920 Shorts
- FFmpeg rendering
- final ffprobe/FFmpeg inspection for streams, resolution, duration mismatch, long black frames and abnormal silence

### QA + autonomy
- factual, provenance, originality, source-rights, language, audio-sync, visual coverage, visual mix, packaging, format, synthetic-media, attention and cost gates
- private upload before any public transition
- FULL_AUTONOMOUS publication only when QA/research/rights/budget/policy gates all pass
- durable PostgreSQL job queue with locking, retries, exponential backoff, timeout recovery and dead-letter
- daily budget reservation/reconciliation

### Analytics + self-learning
- views, watch time, AVD, AVP, retention curve, traffic sources, likes, comments, shares, subscribers and estimated YouTube revenue
- exact retention curve ↔ script beat ↔ scene attribution
- **Creative Performance Lab** fingerprints every owned video and aggregates feature performance with sample-size/confidence safeguards
- learned guidance feeds future hooks, narrative structure, scene cadence, packaging and cost allocation instead of merely being displayed
- bounded exploration/exploitation to avoid overfitting small samples
- economics ledger by provider/model/stage
- production cost, YouTube/external revenue, profit, ROI, RPM-style measures and watch-minutes-per-dollar

## Secure web control plane

The primary UI is now a responsive Next.js application rather than the legacy diagnostic dashboard.

It provides:
- portfolio cost / revenue / profit / ROI
- channels and new-channel candidates
- autonomous factory status and queue
- recent videos with QA + Attention scores
- provider/model cost ledger
- Creative Performance Lab
- Market Pattern Lab
- protected pre-publication MP4 preview
- per-video script, final media inspection and economics

Security defaults:
- signed `HttpOnly` session cookie
- `SameSite=Strict`
- secure cookie in production
- server-only database access
- separate `CONTROL_PLANE_TOKEN` and `SESSION_SECRET`
- anti-indexing headers / robots
- frame denial, MIME sniffing protection and restrictive browser permissions
- local render streaming restricted to `LOCAL_RENDER_ROOT`
- web container receives shared media volume read-only

Run it with:

```bash
npm run web:dev
# or production:
docker compose up -d
# web: http://localhost:4310
```

The previous Node dashboard remains available only as `npm run dashboard:legacy` for diagnostics.

## Validate without external API keys

```bash
npm install
npm run typecheck
npm run test:all
npm run pipeline:mock
npm run web:build
```

CI runs the same suite and installs FFmpeg so the final media-inspection regression is exercised against real generated MP4 files.

## Go live

Production activation is configuration-first. Once credentials exist:

```bash
cp .env.example .env
npm run migrate
npm run oauth:url
npm run oauth:exchange -- --code=YOUR_CODE
npm run doctor
docker compose up -d
```

Then the autonomous scheduler/worker can perform market scans, routing, production, private upload, policy-gated publication, Drive archival, Analytics ingestion and learning without requiring the web app to be open.

See [`docs/GO_LIVE.md`](docs/GO_LIVE.md), [`docs/API_CONNECTIONS.md`](docs/API_CONNECTIONS.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and `.env.example`.

## External limits that remain by design

- YouTube Data API does not provide a supported operation to create a brand-new YouTube channel. The OS can discover a new brand, prepare its complete identity and mark it `AWAITING_CHANNEL`; initial channel creation remains a one-time external account operation.
- Competitor-private metrics such as retention, CTR and revenue are not inferred as facts. The market brain uses observable public signals; the owned-channel brain uses real private Analytics.
- No system can guarantee virality. The optimization objective is a continuously learned **profitable watch-value** model rather than a fixed viral formula.

## Core objective

```text
Expected profitable watch value
≈ P(click)
× expected watch time
× viewer satisfaction
× return probability
× monetization
− production cost
− policy / copyright / factual risk
```

The formula is calibrated continuously from owned-channel experiments instead of being treated as a universal constant.
