# AUTO-YTB provider connections

This document is the canonical runtime connection guide for the current deployment.

## Account topology

Google Drive storage and YouTube publishing are intentionally independent identities.

```text
Google account A (YouTube)
  -> YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN
  -> upload, channel management, Analytics and revenue

Google account B (AUTO-YTB storage)
  -> DRIVE_CLIENT_ID / DRIVE_CLIENT_SECRET / DRIVE_REFRESH_TOKEN
  -> Google Drive content archive only
  -> root folder: AUTO-YTB
  -> DRIVE_ROOT_FOLDER_ID=1NaSy4ni0np1TXUlk0Zq7FFx9isBDtlp3
```

Never reuse a YouTube refresh token as the Drive storage token when `DRIVE_ROOT_FOLDER_ID` is pinned. The live runtime fails closed in that situation.

## 1. Google Drive

### Required Google Cloud setup

1. Create or select one Google Cloud project for AUTO-YTB.
2. Enable **Google Drive API**.
3. Configure the OAuth consent screen.
4. Create an OAuth 2.0 client suitable for the machine running AUTO-YTB.
5. Add the redirect URI configured by `DRIVE_REDIRECT_URI` (default `http://localhost:53683/oauth2/callback`).
6. Authorize while signed into the Google account that owns the AUTO-YTB Drive folder.

The OAuth client itself may be shared with YouTube, but the Drive refresh token must be issued while authenticated as the Drive storage account.

### Environment

```env
CONTENT_LIBRARY_ENABLED=true
CONTENT_LIBRARY_PROVIDER=google-drive
DRIVE_ROOT_FOLDER=AUTO-YTB
DRIVE_ROOT_FOLDER_ID=1NaSy4ni0np1TXUlk0Zq7FFx9isBDtlp3
DRIVE_CLIENT_ID=...
DRIVE_CLIENT_SECRET=...
DRIVE_REFRESH_TOKEN=...
DRIVE_REDIRECT_URI=http://localhost:53683/oauth2/callback
```

### OAuth commands

```bash
npm run drive:oauth:url
npm run drive:oauth:exchange -- --code=<GOOGLE_AUTHORIZATION_CODE>
```

The requested scope is `https://www.googleapis.com/auth/drive.file` only. YouTube scopes are not included in the Drive authorization URL.

## 2. YouTube

Use a clean/unused owned channel as the first pilot. Choose the niche before rebranding the channel.

Enable:
- YouTube Data API v3
- YouTube Analytics API

Configure the OAuth redirect URI from `YOUTUBE_REDIRECT_URI` (default `http://localhost:53682/oauth2/callback`).

Required scopes are kept separate from Drive:
- `youtube.upload`
- `youtube.force-ssl`
- `yt-analytics.readonly`
- `yt-analytics-monetary.readonly`

Environment:

```env
YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...
YOUTUBE_REFRESH_TOKEN=...
YOUTUBE_CHANNEL_ID=...
YOUTUBE_REDIRECT_URI=http://localhost:53682/oauth2/callback
```

Additional channels use a `credentialsRef`; for example `OWL` maps to `YOUTUBE_CLIENT_ID__OWL`, `YOUTUBE_CLIENT_SECRET__OWL`, `YOUTUBE_REFRESH_TOKEN__OWL`, and `YOUTUBE_CHANNEL_ID__OWL`.

Start with `AUTO_UPLOAD_PRIVATE=true`. Do not enable autonomous public release before at least one controlled private E2E production has passed media QA and manual inspection.

## 3. Gemini

AUTO-YTB supports Gemini structured generation through the official Gemini API. The current preferred first text provider is Gemini so OpenAI API spend is optional.

```env
TEXT_MODEL_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_TEXT_MODEL=gemini-3.8-flash
GEMINI_API_BASE_URL=https://generativelanguage.googleapis.com/v1beta
TEXT_MODEL_RESEARCH=gemini-3.8-flash
TEXT_MODEL_CREATIVE=gemini-3.8-flash
TEXT_MODEL_VISION=gemini-3.8-flash
```

The adapter uses structured JSON output for research dossiers, scripts and packaging. Gemini API billing/quotas are separate from consumer Gemini subscriptions; use the API project quota/billing configuration as the source of truth.

OpenAI remains an optional provider:

```env
TEXT_MODEL_PROVIDER=openai
TEXT_MODEL_API_KEY=...
TEXT_MODEL_RESEARCH=<supported OpenAI API model>
TEXT_MODEL_BASE_URL=
```

ChatGPT Plus is not treated as an API credential and is never scraped or browser-automated.

## 4. Search

Current factual research provider:

```env
SEARCH_PROVIDER=tavily
SEARCH_API_KEY=...
```

Research is skipped structurally for archetypes whose execution plan sets `researchRequired=false`.

## 5. Voice

Current voice provider:

```env
VOICE_PROVIDER=elevenlabs
VOICE_API_KEY=...
VOICE_ID=...
VOICE_MODEL=eleven_multilingual_v2
VOICE_TIMESTAMPS=true
```

TTS is not required for no-voice archetypes such as naturalistic visual-action animal content. Dialogue series can bind multiple canonical voices through the Series Bible/Automation Profile.

## 6. Image/video generation

Current production adapter:

```env
IMAGE_PROVIDER=runway
IMAGE_API_KEY=...
IMAGE_MODEL=gen4_image
VIDEO_PROVIDER=runway
VIDEO_API_KEY=...
VIDEO_MODEL=gen4.5
```

Provider selection is archetype-aware. A provider key is required only when the chosen execution plan actually needs that media capability.

## 7. TikTok

TikTok distribution is optional per series/channel. Do not create/connect a TikTok account until the channel's distribution profile requires it.

Runtime variables:

```env
TIKTOK_ACCESS_TOKEN=...
TIKTOK_PRIVACY_LEVEL=SELF_ONLY
TIKTOK_AUTOMATION_CONSENT=true
```

Direct Post must remain fail-closed without explicit owner consent. During initial validation use private/self-only visibility where required by the app's review/audit status.

## 8. Instagram Reels

```env
INSTAGRAM_ACCESS_TOKEN=...
INSTAGRAM_USER_ID=...
META_GRAPH_VERSION=...
DISTRIBUTION_PUBLIC_MEDIA_BASE_URL=https://...
```

Meta must be able to fetch the Reel from a public HTTPS URL. Local `file://` renders are never passed directly to Instagram.

## 9. Facebook Reels

```env
FACEBOOK_PAGE_ACCESS_TOKEN=...
FACEBOOK_PAGE_ID=...
META_GRAPH_VERSION=...
```

Facebook Page Reels use start -> binary upload -> finish/publish.

## Connection order for first live deployment

1. Google Drive storage OAuth
2. Pilot YouTube channel OAuth + Channel ID
3. Gemini API key
4. Search API key when factual research is needed
5. Voice provider when the selected archetype uses speech
6. Image/video provider required by the first archetype
7. Controlled private YouTube E2E
8. Only then provision TikTok/Instagram/Facebook for channels whose distribution profile justifies them

## Secret handling

- Never commit `.env` or tokens to GitHub.
- Never store OAuth refresh tokens inside Drive documents.
- Keep GitHub as canonical source for code/config templates, not secrets.
- Rotate a credential immediately if it appears in a commit, log, screenshot, chat or shared file.
- Store production secrets only in the deployment runtime/secret manager.

## Current Drive deployment

The real storage root already exists in the selected Drive account:

```text
AUTO-YTB/                         1NaSy4ni0np1TXUlk0Zq7FFx9isBDtlp3
  00_SYSTEM/
  01_CHANNELS/
  02_SHARED_LIBRARY/
  03_REPORTS/
  99_ARCHIVE/
```

Per-channel production folders are created lazily by the content library once a niche/channel is activated. This avoids creating unused channel trees before the Opportunity Router selects a viable channel.
