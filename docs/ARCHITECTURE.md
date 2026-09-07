# auto-ytb architecture v0.1

## Principle
Optimize expected profitable watch value, not raw views:

`P(click) × expected watch time × satisfaction × return probability × monetization - cost - risk`

## Current modules
1. Signal collectors
2. Topic normalization / clustering
3. Trend intelligence
4. Competitor + outlier intelligence
5. Opportunity scoring
6. Research / editorial strategy (next)
7. Script / packaging (later)
8. Production / QA / publish (later)
9. Analytics learning loop (later)

## API quota strategy
`search.list` is scarce. Search is used only for candidate generation. Candidate enrichment, channel baselines and snapshots use cheaper list endpoints and caching.

## Non-negotiable quality gates
- No mass-template videos.
- No copied scripts or clips.
- Factual claims require sources.
- Synthetic-media disclosure when applicable.
- Cost per video is tracked before publication.
- An opportunity can score highly on demand and still be rejected for policy/copyright risk.
