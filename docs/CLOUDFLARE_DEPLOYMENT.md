# Cloudflare deployment

AUTO-YTB uses Cloudflare as the public control-plane edge and a Cloudflare Container for the Node/FFmpeg application runtime. This split is required because the application uses Next.js server routes, PostgreSQL, filesystem-backed media streaming, child processes and FFmpeg.

## Current configuration

- Wrangler config: `wrangler.jsonc`
- Worker entrypoint: `cloudflare/index.mjs`
- Container image: repository `Dockerfile`
- Public Worker name: `auto-ytb-production`
- Container class: `AutoYtbWebContainer`
- Default container port: `3000`
- Container sleep policy: `30m`
- Maximum production instances: `1` until workload evidence justifies scaling
- Real generation and automatic publishing are disabled by default

The container runs the existing Next.js control plane. Docker Compose still overrides the Dockerfile command for the local worker, scheduler and web services, so the local development topology remains unchanged.

## Cloudflare prerequisites

Cloudflare Containers requires the Workers Paid plan. The account must also have a Docker-compatible build path: local Docker Desktop, or Workers Builds connected to this GitHub repository. The account used for the canonical deployment is `davidsanchezmora17@gmail.com`.

When local Docker is unavailable, use Workers Builds with a full `npx wrangler deploy` command. A Worker-only `versions upload` is not enough for Containers because it does not publish or roll out the image.

## Runtime secrets

Do not commit these values. Configure them as encrypted Worker secrets after the database and provider accounts are ready:

- `DATABASE_URL` — production PostgreSQL connection string
- `DATABASE_SSL` — normally `true` for hosted PostgreSQL
- `SESSION_SECRET` — at least 32 random characters
- `CONTROL_PLANE_TOKEN` — emergency/operator token
- `CONTROL_GOOGLE_ALLOWED_EMAILS` — allowlist including the operator email
- `CONTROL_GOOGLE_CLIENT_ID`, `CONTROL_GOOGLE_CLIENT_SECRET`, `CONTROL_GOOGLE_REDIRECT_URI` — Google control-plane OAuth
- Provider credentials such as `GEMINI_API_KEY`, `HF_CREDENTIALS` or `HF_API_KEY_ID`/`HF_API_KEY_SECRET`, and `RUNWAY_API_KEY` only when legitimately configured
- YouTube and Drive OAuth credentials only when private upload/distribution is intentionally enabled

`REAL_GENERATION_ENABLED` and `AUTO_UPLOAD_PRIVATE` stay `false` until provider, budget, rights and human-review checks are complete.

## Verification sequence

```text
npx wrangler whoami
npx wrangler types
npx wrangler deploy --dry-run
npx wrangler deploy
npx wrangler tail auto-ytb-production
npx wrangler containers list
curl https://auto-ytb-production.<account-subdomain>.workers.dev/login
```

The deploy is not considered complete until the Worker URL reaches the Next.js login page, the first container becomes healthy, the application can authenticate, and a protected dashboard request is verified against the configured database. A successful upload alone is not sufficient evidence.

## Why not Workers-only

The free Workers runtime can host an edge API and static frontend, but it cannot host the current complete video factory without a substantial rewrite and an external render runtime. That path would not preserve the requested Node/FFmpeg architecture or the current production guarantees.
