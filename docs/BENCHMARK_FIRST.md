# Benchmark-first intelligence

The benchmark-first layer turns public market signals into auditable production inputs.

## Flow

`BenchmarkRequest → official-provider discovery → outlier assessment → ContentDNA → PatternCluster → ReferencePack → evidence-backed Opportunity → shared Production Engine`

`packages/core/src/benchmark.ts` contains the normalized channel/video contract and the observable outlier score. It combines comparable-view multiple, velocity, views/subscriber efficiency, persistence and engagement proxy. Private competitor CTR, retention and revenue are never fabricated.

`packages/intelligence/src/benchmark-discovery.ts` provides the `BenchmarkProvider` abstraction and the official YouTube Data API adapter. Fixtures implement the same contract for no-credential smoke tests. Seed channels in `config` and `SEED_BENCHMARK_CHANNELS` are hints, not an allowlist.

## DNA and reference packs

`ContentDNA` stores structured topic, title, thumbnail, script and video attributes. Transcript/script DNA is explicitly `UNAVAILABLE` when no permitted transcript exists. Thumbnail attributes are marked `VISION`, `METADATA` or `UNAVAILABLE`; the system does not infer vision facts from a URL.

`ReferencePack` selects 3–7 items across distinct structural roles. It is evidence for framing and transferable mechanics, not a license to reuse scripts, phrases, assets or exact compositions.

## Explicit engines

`packages/core/src/engines.ts` exposes the seven capabilities: Niche Hunter, Hook Engineer, Clip/Ranking Researcher, Retention Doctor, Viral Deconstructor, Production Engine and Series Factory. The production planner feeds the existing shared production infrastructure and supports draft-before-final cost control. Clip candidates default to research-only unless rights are cleared.

Run the deterministic, zero-cost smoke test with:

```bash
npm run benchmark:smoke
```

It covers seven seed-shaped fixture channels, 3–7 references, ContentDNA, pattern mining, opportunity evidence, 15 hooks and a budgeted production plan. Real API execution remains credential-dependent and must use `YouTubeBenchmarkProvider`.
