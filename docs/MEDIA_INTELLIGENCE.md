# Media Intelligence

`MediaIntelligenceEngine` owns entity registration, discovery references, publishable assets, segment indexing, rights records, specificity classification, ranking, availability and script-to-media coverage.

## Specificity

Segments are ranked as `EXACT_ENTITY`, `EXACT_EVENT`, `EXACT_LOCATION`, `STRONG_CONTEXT`, `WEAK_CONTEXT`, `GENERIC` or `IRRELEVANT`. Exact named entities receive a strong ranking advantage; generic footage is a fallback, not a shortcut.

## Coverage gate

`MediaAvailabilityReport` answers whether each beat is excellent, good, marginal or poor before final production. `ScriptMediaCoverageMatrix` records exact assets, contextual assets, rights confidence, coverage confidence, exact coverage ratio and generic filler ratio. Critical missing coverage is a hard failure.

## Durable pack

`MediaResourcePack` contains entities, discovery sources, segments, publishable assets, rights entries and the coverage matrix so a later repair can replace one timeline region without rediscovering the whole topic.
