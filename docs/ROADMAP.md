# Roadmap

## Milestone M1 — Intelligence Engine (ACTIVE)

### Done
- [x] Opportunity scoring + risk gates
- [x] Age-adjusted video outlier scoring
- [x] Niche scoring with evidence-confidence discount
- [x] Trend velocity / acceleration / persistence
- [x] Cross-source evidence confidence
- [x] YouTube search budget guard
- [x] Daily query-lane planner (100 searches)
- [x] YouTube search + batched video enrichment
- [x] Channel metadata + uploads playlist retrieval
- [x] Recent competitor upload retrieval
- [x] PostgreSQL intelligence schema
- [x] GitHub Actions CI

### Next
- [x] Persistence repositories (provider-agnostic Postgres SQL)
- [x] Adaptive snapshot scheduling policy
- [x] Seed-query generator / deduplicator
- [x] Competitor discovery ranker
- [x] Topic clustering baseline (lexical; embeddings later)
- [x] Current-market niche evidence collector CLI
- [x] Niche winner decision gate

### M1 code-complete gate
The live winner remains evidence-gated until `npm run niche:live` collects enough market samples.

## M2 — Editorial Research Engine
- source discovery / claim extraction
- contradiction detection
- source quality scoring
- angle generation and ranking
- research dossier

## M3 — Script + Packaging Engine
- retention-aware story graph
- hook variants
- title/thumbnail hypotheses
- originality checks

## M4 — Video Factory
- voice provider abstraction
- scene planner
- asset provenance
- FFmpeg + Remotion renderer
- captions, music, loudness normalization

## M5 — QA + Publishing
- factual / copyright / policy gates
- synthetic-media disclosure
- private upload, human review, schedule/publish

## M6 — Analytics Brain
- YouTube Analytics ingestion
- retention curves
- traffic-source attribution
- title/thumbnail experiments
- profit per video
- self-improvement loop

## M7 — Multi-channel OS
- isolated channel DNA
- portfolio budget allocation
- shared global learning with channel-specific policies
