import type { SearchResult } from '@auto-ytb/providers';
import type { SourceAssessment } from './types.js';

const SOURCE_BASE: Record<NonNullable<SearchResult['sourceType']>, number> = {
  primary: 100,
  official: 96,
  reference: 84,
  news: 80,
  community: 55,
  unknown: 50,
};

export function assessSource(source: SearchResult, now = new Date()): SourceAssessment {
  const base = SOURCE_BASE[source.sourceType ?? 'unknown'];
  let freshness = 70;
  if (source.publishedAt) {
    const ageDays = Math.max(0, (now.getTime() - new Date(source.publishedAt).getTime()) / 86_400_000);
    freshness = Math.max(25, Math.min(100, 100 - ageDays * 0.7));
  }
  const primaryEvidence = source.sourceType === 'primary' || source.sourceType === 'official';
  const qualityScore = Math.round((base * 0.72 + freshness * 0.28) * 10) / 10;
  return { ...source, authority: base, freshness: Math.round(freshness * 10) / 10, primaryEvidence, qualityScore };
}

export function researchConfidence(sources: SourceAssessment[], claimsConfidence: number[]): number {
  if (!sources.length) return 0;
  const sourceQuality = sources.reduce((sum, source) => sum + source.qualityScore, 0) / sources.length;
  const primaryBonus = Math.min(12, sources.filter((source) => source.primaryEvidence).length * 3);
  const claimQuality = claimsConfidence.length ? claimsConfidence.reduce((a, b) => a + b, 0) / claimsConfidence.length : 0;
  const diversity = Math.min(10, new Set(sources.map((source) => new URL(source.url).hostname.replace(/^www\./, ''))).size * 2);
  return Math.round(Math.min(100, sourceQuality * 0.42 + claimQuality * 0.42 + primaryBonus + diversity) * 10) / 10;
}
