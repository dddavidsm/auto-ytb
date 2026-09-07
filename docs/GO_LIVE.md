# Go-live checklist

The application is designed so production activation is configuration-first rather than a rewrite.

## 1. Install and validate

```bash
npm install
npm run typecheck
npm run test:all
npm run pipeline:mock
npm run doctor
```

## 2. Configure secrets

Copy `.env.example` to `.env` locally or configure the same names in the deployment platform. Never commit `.env`, API keys or OAuth refresh tokens.

Current minimum live stack:

- `YOUTUBE_API_KEY`
- `DATABASE_URL`
- `SEARCH_PROVIDER=tavily` + `SEARCH_API_KEY`
- `TEXT_MODEL_RESEARCH` + `TEXT_MODEL_API_KEY`
- `VOICE_PROVIDER=elevenlabs` + `VOICE_API_KEY` + `VOICE_ID`
- `IMAGE_PROVIDER=runway` + Runway API key
- `VIDEO_PROVIDER=runway` + Runway API key
- Google OAuth client ID/secret + refresh token + `YOUTUBE_CHANNEL_ID`

Runway image/video generation is currently required by the live scene planner. Providers remain replaceable behind the same contracts.

## 3. Database

```bash
npm run migrate
```

Migrations are idempotently tracked in `schema_migrations`, including the durable queue, job event history and daily budget ledger.

## 4. YouTube OAuth

```bash
npm run oauth:url
```

Open the printed URL and approve the requested YouTube/Analytics permissions. After Google returns the authorization code:

```bash
npm run oauth:exchange -- --code=YOUR_CODE
```

Store the returned refresh token as `YOUTUBE_REFRESH_TOKEN`.

## 5. Validate live configuration

```bash
npm run doctor
```

All mandatory subsystems used by `pipeline:live` should report READY before autonomous production is enabled.

## 6. Start market collection

```bash
npm run niche:live
npm run discover:competitors -- --niche future-tech-business
```

Do not force a niche winner until the live evidence gate reaches sufficient confidence.

## 7. Test one real production manually

Keep public publishing disabled:

```env
AUTO_UPLOAD_PRIVATE=false
AUTO_PUBLISH_PUBLIC=false
```

Then run:

```bash
npm run pipeline:live -- --topic="YOUR APPROVED TEST TOPIC"
```

Review the render, three thumbnail variants, sources, QA report and actual cost. After this passes, `AUTO_UPLOAD_PRIVATE=true` may be enabled so successful runs reach YouTube as private videos.

## 8. Autonomous operations

Production is gated by score, daily video count and budget:

```env
AUTO_PRODUCTION_MIN_SCORE=82
AUTO_PRODUCTION_MAX_PER_DAY=1
AUTO_PRODUCTION_DAILY_BUDGET_USD=25
AUTO_PRODUCTION_RESERVED_COST_USD=18
```

One scheduling pass:

```bash
npm run ops:schedule
```

Run a single queued job:

```bash
npm run worker:once
```

Persistent processes:

```bash
npm run scheduler
npm run worker
```

The worker uses atomic PostgreSQL claims (`FOR UPDATE SKIP LOCKED`), exponential retry/backoff, stale-lock recovery and a dead-letter state after retry exhaustion. Job keys prevent duplicate production of the same opportunity. Reserved budget is reconciled against the original scheduling date even when retries cross midnight.

## 9. Docker deployment

The repository includes a Node 22 + FFmpeg image and a Compose stack with persistent services:

```bash
docker compose build
docker compose run --rm worker npm run migrate
docker compose up -d
```

Services:

- `worker`: executes expensive production and analytics jobs
- `scheduler`: periodically queues approved high-value opportunities and maintenance
- `dashboard`: control plane on port `4310`

All three share `.data` through a Docker volume. The database should be a durable external PostgreSQL instance.

## 10. Owned-channel learning loop

Analytics is enqueued once per day automatically by the maintenance scheduler. Manual sync remains available:

```bash
npm run analytics:sync -- --days=28
```

This persists performance, retention, traffic sources, revenue and derived learning signals.

## Safety defaults

- private/review workflow before public publishing
- `AUTO_PUBLISH_PUBLIC=false`
- daily production budget and per-video cost cap
- only `PRODUCE`/approved opportunities above the configured score can enter the autonomous queue
- synthetic-media disclosure gate
- factual/provenance/originality/visual-coverage/thumbnail QA
- duplicate job protection
- bounded retries + dead-letter queue
- no secrets committed to Git or Docker build context
