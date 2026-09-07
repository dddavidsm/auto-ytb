# auto-ytb

Autonomous YouTube intelligence and production system focused on profitable, monetizable, original content.

## Current milestone: Intelligence Engine v0.2

Implemented:
- opportunity scoring with risk penalties
- channel/video outlier scoring
- YouTube search-budget guard (100/day default)
- YouTube candidate search + batched video enrichment
- PostgreSQL schema for channels, videos, snapshots, trends, opportunities, ideas, production and experiments
- niche candidate registry and confidence-discounted niche scoring
- trend velocity / acceleration / persistence analysis
- cross-source evidence confidence
- quota-aware daily query planning
- competitor channel metadata + recent uploads retrieval
- deterministic tests

## Run

```bash
npm install
npm test
npm run typecheck
npm run demo
```

For real YouTube discovery:

```bash
export YOUTUBE_API_KEY=...
npm run radar -- --query "AI agents" --days 7
```

## Architecture target
Dashboard + Postgres + scheduled collectors + durable workers + FFmpeg/Remotion production. Providers remain replaceable.
