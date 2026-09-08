# Go-live checklist — v0.12

Production activation is **configuration-first**. The factory, quality gates, schedulers, analytics/learning loops and secure web control plane are already wired; go-live should not require an architectural rewrite.

## 1. Validate the repository

```bash
npm install
npm run typecheck
npm run test:all
npm run pipeline:mock
npm run web:build
```

CI runs the same path and also installs FFmpeg so the real MP4 inspection regression executes.

## 2. Configure secrets

Copy `.env.example` to `.env` locally or use secrets in the deployment platform. Never commit `.env`, API keys, OAuth refresh tokens, `CONTROL_PLANE_TOKEN` or `SESSION_SECRET`.

Minimum live stack:

- `YOUTUBE_API_KEY`
- `DATABASE_URL`
- `SEARCH_PROVIDER=tavily` + `SEARCH_API_KEY`
- `TEXT_MODEL_API_KEY`
- `VOICE_PROVIDER=elevenlabs` + `VOICE_API_KEY` + `VOICE_ID`
- `IMAGE_PROVIDER=runway` + API key
- `VIDEO_PROVIDER=runway` + API key
- Google OAuth client ID/secret + refresh token + existing `YOUTUBE_CHANNEL_ID`
- random `CONTROL_PLANE_TOKEN`
- independent random `SESSION_SECRET` (>=32 chars in production)

Providers are replaceable behind contracts. Runway is the current live visual adapter, but the Hybrid Visual Engine deliberately avoids using premium generation for every scene.

## 3. Database

```bash
npm run migrate
```

Migrations include intelligence, durable jobs, review/audit, channel identity, economics, provider cost ledger, Creative Performance Lab and public Market Pattern Lab.

## 4. YouTube + Drive OAuth

```bash
npm run oauth:url
npm run oauth:exchange -- --code=YOUR_CODE
```

The authorization includes YouTube upload/Analytics capabilities and the Google Drive `drive.file` scope used by the content library. Store the returned refresh token only as a secret.

Each additional Channel DNA uses its own `credentialsRef` and suffixed OAuth variables. Tokens are never implicitly reused between channels.

## 5. Configuration doctor

```bash
npm run doctor
```

Mandatory subsystems used by live production should report READY.

## 6. First controlled live render

Public release is not required to validate production. Run one real topic through the complete factory:

```bash
npm run pipeline:live -- --topic="YOUR TEST TOPIC"
```

The run must clear:

1. research confidence / provenance
2. script + packaging + storyboard Attention Review
3. automatic repair passes if the attention score is below threshold
4. timestamped narration synchronization
5. visual / rights / originality / language / packaging / cost QA
6. Full-HD render
7. final ffprobe/FFmpeg inspection

A failed gate must remain BLOCKED rather than being pushed forward manually.

## 7. Secure web control plane

Development:

```bash
npm run web:dev
```

Production is normally run through Compose and exposed at port 4310:

```bash
docker compose up -d
```

Open `http://HOST:4310` and authenticate using `CONTROL_PLANE_TOKEN`. After login, the token is not stored in browser JavaScript; the app uses a signed HttpOnly session cookie.

The web app is observational by default and shows:
- pre-publication render preview
- QA / Attention / final media scores
- scripts and publication state
- cost / revenue / profit / ROI
- provider/model spend
- queue state
- channels / brand candidates
- Creative Performance Lab
- public Market Pattern Lab

The web process receives the shared `.data` volume read-only. It does not run FFmpeg workers or hold production jobs.

## 8. Autonomous operations

Relevant safeguards:

```env
AUTO_UPLOAD_PRIVATE=true
MIN_ATTENTION_SCORE=86
MAX_ATTENTION_REVISION_PASSES=2
AUTO_PRODUCTION_MIN_SCORE=82
AUTO_PRODUCTION_MAX_PER_DAY=1
AUTO_PRODUCTION_DAILY_BUDGET_USD=25
AUTO_PRODUCTION_RESERVED_COST_USD=18
```

Persistent processes are already defined in Docker Compose:
- `worker`
- `scheduler`
- `web`

The scheduler creates market, branding, production and maintenance jobs. The worker uses atomic PostgreSQL claims, timeout recovery, exponential retry/backoff and dead-letter handling.

## 9. Autonomous intelligence and learning

Every market cycle performs public market intelligence and then updates the Market Pattern Lab using observable competitor signals only.

Every completed owned production stores a creative fingerprint. Analytics sync then aligns retention with exact beats/scenes and recomputes feature performance. When sample size and confidence are sufficient, learned hook/narrative/cadence/visual guidance is fed into future generation. Sparse evidence stays observational.

Economics are reconciled from the provider cost ledger and latest Analytics rather than from a single opaque estimate.

## 10. Public publishing policy

A Channel DNA configured for `FULL_AUTONOMOUS` may schedule/publish without an operator click **only after all required gates pass**. The workflow still uploads private first so the transition is reversible and the video can be viewed in the web control plane.

Unresolved direct-source rights, factual blockers, failed attention/media QA, budget violations or policy risk keep the video private/blocked.

## External one-time limitation

The YouTube Data API does not provide a supported operation to create a brand-new YouTube channel. If the Channel Router discovers a materially different new brand/persona, the OS can create its complete candidate identity and mark it `AWAITING_CHANNEL`, but creation of that new channel/account itself is a one-time external account operation. Once linked through its OAuth, normal autonomous operation resumes.
