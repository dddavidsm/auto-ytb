import type { CompetitorProfile } from './competitor.js';

export type CompetitorCandidate = CompetitorProfile & {
  channelTitle: string;
  subscriberCount: number | null;
  queryHits: number;
  uniqueQueryHits: number;
};

export type RankedCompetitor = CompetitorCandidate & {
  score: number;
  tier: 'PRIORITY' | 'TRACK' | 'REFERENCE' | 'IGNORE';
  signals: {
    topicalCoverage: number;
    queryFrequency: number;
    breakoutDensity: number;
    outlierStrength: number;
    velocity: number;
    sizeFit: number;
    cadence: number;
  };
};

const clamp = (n: number) => Math.max(0, Math.min(100, n));
const round = (n: number) => Math.round(n * 10) / 10;

function logNormalize(value: number, maxValue: number): number {
  if (value <= 0 || maxValue <= 0) return 0;
  return clamp((Math.log10(1 + value) / Math.log10(1 + maxValue)) * 100);
}

function subscriberSizeFit(subscribers: number | null): number {
  if (subscribers == null) return 55;
  if (subscribers < 1_000) return 20;
  if (subscribers < 10_000) return 55;
  if (subscribers <= 3_000_000) return 100;
  if (subscribers <= 10_000_000) return 75;
  return 45;
}

export function rankCompetitors(candidates: CompetitorCandidate[]): RankedCompetitor[] {
  if (!candidates.length) return [];

  const maxQueryHits = Math.max(...candidates.map((c) => c.queryHits), 1);
  const maxUniqueQueries = Math.max(...candidates.map((c) => c.uniqueQueryHits), 1);
  const maxVelocity = Math.max(...candidates.map((c) => c.medianViewsPerDay), 1);

  return candidates
    .map((candidate) => {
      const topicalCoverage = clamp((candidate.uniqueQueryHits / maxUniqueQueries) * 100);
      const queryFrequency = clamp((candidate.queryHits / maxQueryHits) * 100);
      const breakoutDensity = candidate.recentVideos
        ? clamp((candidate.breakoutCount / candidate.recentVideos) * 450)
        : 0;
      const outlierStrength = clamp(candidate.strongestOutlier);
      const velocity = logNormalize(candidate.medianViewsPerDay, maxVelocity);
      const sizeFit = subscriberSizeFit(candidate.subscriberCount);
      const cadence = clamp((candidate.recentVideos / 20) * 100);

      const score =
        topicalCoverage * 0.18 +
        queryFrequency * 0.10 +
        breakoutDensity * 0.20 +
        outlierStrength * 0.22 +
        velocity * 0.14 +
        sizeFit * 0.08 +
        cadence * 0.08;

      const final = round(score);
      const tier: RankedCompetitor['tier'] =
        final >= 80 ? 'PRIORITY' : final >= 65 ? 'TRACK' : final >= 48 ? 'REFERENCE' : 'IGNORE';

      return {
        ...candidate,
        score: final,
        tier,
        signals: {
          topicalCoverage: round(topicalCoverage),
          queryFrequency: round(queryFrequency),
          breakoutDensity: round(breakoutDensity),
          outlierStrength: round(outlierStrength),
          velocity: round(velocity),
          sizeFit: round(sizeFit),
          cadence: round(cadence),
        },
      };
    })
    .sort((a, b) => b.score - a.score);
}
