# auto-ytb

Autonomous YouTube **Channel Operating System** for discovering opportunities, producing original videos, preserving recurring IP, reviewing quality, publishing safely, measuring economics and learning what works.

## Current milestone: Autonomous Channel OS v0.15

The repository contains an end-to-end, provider-agnostic path from public market intelligence to a privately reviewable Full-HD render and, when a Channel DNA enables `FULL_AUTONOMOUS`, automated scheduling/publication after hard quality, rights, continuity and budget gates.

The operator is not part of the production critical path. The secure web control plane exists to observe, preview and audit what the system is doing.

v0.15 adds a durable **Series/IP layer**: versioned Series Bibles, persistent characters/styles, episode memory, story arcs, follow-up planning, Kids & Family QA, real pixel-level visual continuity, canonical keyframe bridging for video and quality-aware continuation/scaling decisions.

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
Series Router
   ├─ standalone
   ├─ existing Series → active Bible + canon + memory
   └─ new Series candidate → bootstrap reusable IP
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
Canonical reference bridge when multi-reference video continuity is required
        ↓
Thumbnails + Full-HD render
        ↓
Factual / rights / originality / cost QA
        ↓
Final FFmpeg/ffprobe media inspection
        ↓
Private YouTube upload
        ↓
Series memory compiler
        ↓
Kids & Family QA (when MADE_FOR_KIDS)
        ↓
Pixel-level visual continuity QA
        ↓
Fail-closed autonomous publication policy
        ↓
Google Drive library + canon/quality archive
        ↓
YouTube Analytics + revenue + retention
        ↓
Creative + Series Performance Labs
        ↓
LEARN / CONTINUE / SCALE / REVIEW / PAUSE
        ↓
Next video / next episode
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

### Series / persistent IP OS
- automatic opportunity → existing Series / new Series candidate / standalone routing
- versioned active Series Bible
- persistent character specifications and continuity keys
- persistent visual style specifications and canonical references
- audience mode and explicit Kids age bands
- world rules, continuity rules, recurring devices and episode grammar
- story arcs and canonical episode memory
- immutable-canon protection: episodes may advance state but may not rewrite identity/style invariants
- automatic next-episode seeds from completed memory
- bounded pilot phase: new Series cannot create unlimited episodes without Analytics evidence
- one pending autonomous follow-up per Series
- Series strategy states: `LEARN`, `CONTINUE`, `SCALE`, `REVIEW`, `PAUSE`
- Series strategy combines Analytics, economics and quality evidence

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
- canonical visual references applied to recurring-IP generation
- **Reference Bridge**: when multiple canonical references are needed for a video, the runtime creates a reference-conditioned keyframe and animates that frame rather than discarding all but one identity/style reference
- bridge image cost is included in the pre-render cost gate and provider ledger
- 3-way deterministic thumbnail composition
- Full-HD 1920×1080 long-form and 1080×1920 Shorts
- FFmpeg rendering
- final ffprobe/FFmpeg inspection for streams, resolution, duration mismatch, long black frames and abnormal silence

### QA + autonomy
- factual, provenance, originality, source-rights, language, audio-sync, visual coverage, visual mix, packaging, format, synthetic-media, attention and cost gates
- deterministic **Kids & Family Quality Gate** for `MADE_FOR_KIDS` episodes
- explicit age-band language/structure checks
- hard blocking for clear unsafe imitation, manipulative child-directed promotion, graphic content, misleading educational certainty and missing narrative payoff
- **pixel-level Series Visual Continuity Gate** comparing generated keyframes with canonical character/style references
- representative keyframe sampling with bounded vision cost
- severe character identity or art-style drift blocks release
- source/procedural-only Series without persistent characters can mark visual inspection not-applicable instead of paying for unnecessary vision calls
- private upload before any public transition
- Series releases fail closed when memory or required quality reports are missing
- FULL_AUTONOMOUS publication only when QA/research/rights/budget/policy/continuity gates all pass
- durable PostgreSQL job queue with locking, retries, exponential backoff, timeout recovery and dead-letter
- daily budget reservation/reconciliation

### Kids / Family compliance path
- `MADE_FOR_KIDS` is carried as Series data rather than inferred at upload time
- active Series Bible stores target age, vocabulary rules, safety rules and emotional rules
- script generation receives these rules as authoritative context
- YouTube upload explicitly sets `status.selfDeclaredMadeForKids`
- Kids quality report is mandatory before autonomous public scheduling
- Kids QA is archived with the episode for auditability

### Analytics + self-learning
- views, watch time, AVD, AVP, retention curve, traffic sources, likes, comments, shares, subscribers and estimated YouTube revenue
- exact retention curve ↔ script beat ↔ scene attribution
- **Creative Performance Lab** fingerprints every owned video and aggregates feature performance with sample-size/confidence safeguards
- learned guidance feeds future hooks, narrative structure, scene cadence, packaging and cost allocation instead of merely being displayed
- bounded exploration/exploitation to avoid overfitting small samples
- economics ledger by provider/model/stage
- production cost, YouTube/external revenue, profit, ROI, RPM-style measures and watch-minutes-per-dollar
- Series scaling is quality-aware: strong views/ROI cannot trigger `SCALE` with incomplete quality coverage or material visual/Kids drift

### Series archive
For recurring IP, Google Drive stores the reusable Bible/reference structure and a per-episode audit trail. Completed episodes include:

```text
SERIES/<series>/05_EPISODES/<episode>/11_MEMORY/
├── memory.json
├── canon-after-episode.json
└── quality-gates.json
```

This makes the state of the franchise reproducible outside the database.

## Secure web control plane

The primary UI is a responsive Next.js application rather than the legacy diagnostic dashboard.

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
- **Series Continuity** portfolio
- Series Bible, characters, style canon, story arcs and canonical memory
- per-episode memory, Kids QA and Visual QA scores
- Series strategy history and continuation state

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

CI runs the same suite and installs FFmpeg so the media-inspection and continuity regressions are exercised automatically.

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

Then the autonomous scheduler/worker can perform market scans, routing, production, private upload, Series memory/quality checks, policy-gated publication, Drive archival, Analytics ingestion and learning without requiring the web app to be open.

See [`docs/GO_LIVE.md`](docs/GO_LIVE.md), [`docs/API_CONNECTIONS.md`](docs/API_CONNECTIONS.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and `.env.example`.

## External limits that remain by design

- YouTube Data API does not provide a supported operation to create a brand-new YouTube channel. The OS can discover a new brand, prepare its complete identity and mark it `AWAITING_CHANNEL`; initial channel creation remains a one-time external account operation.
- Competitor-private metrics such as retention, CTR and revenue are not inferred as facts. The market brain uses observable public signals; the owned-channel brain uses real private Analytics.
- Vision-based continuity is a safety/quality signal, not a mathematical proof of identity. Hard publication gates combine canonical references, generation provenance, deterministic checks and semantic inspection rather than trusting one model score alone.
- No system can guarantee virality. The optimization objective is a continuously learned **profitable watch-value** model rather than a fixed viral formula.

## Core objective

```text
Expected profitable watch value
≈ P(click)
× expected watch time
× viewer satisfaction
× return probability
× monetization
× quality / continuity confidence
− production cost
− policy / copyright / factual risk
```

The formula is calibrated continuously from owned-channel experiments instead of being treated as a universal constant.
