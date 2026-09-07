# Go-live checklist

The application is designed so production activation is configuration-first rather than a rewrite.

## 1. Install and validate

```bash
npm install
npm run typecheck
npm run test:all
npm run doctor
```

## 2. Configure secrets

Copy `.env.example` to a local secret store or configure the same names in the deployment platform. Never commit `.env` or OAuth refresh tokens.

Minimum live stack:

- `YOUTUBE_API_KEY`
- `DATABASE_URL`
- `SEARCH_PROVIDER=tavily` + `SEARCH_API_KEY`
- `TEXT_MODEL_RESEARCH` + `TEXT_MODEL_API_KEY`
- `VOICE_PROVIDER=elevenlabs` + `VOICE_API_KEY`
- Google OAuth client ID/secret + refresh token

Runway image/video generation is optional. The planner can fall back to sourced visuals/motion graphics.

## 3. Database

```bash
npm run migrate
```

Migrations are idempotently tracked in `schema_migrations`.

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

The system should report all mandatory subsystems as READY. Image/video may remain PARTIAL if intentionally disabled.

## 6. Start market collection

```bash
npm run niche:live
npm run discover:competitors -- --niche future-tech-business
```

Do not force a niche winner until the live evidence gate reaches sufficient confidence.

## 7. Owned-channel learning loop

After private/public videos exist in the `publications` table:

```bash
npm run analytics:sync -- --days=28
```

This persists performance, retention, traffic sources, revenue and derived learning signals.

## Safety defaults

- private upload before public publishing
- `AUTO_PUBLISH_PUBLIC=false`
- production cost cap
- synthetic-media disclosure gate
- factual/provenance QA
- no secrets committed to Git
