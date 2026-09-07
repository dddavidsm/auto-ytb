export type EvidenceSource = {
  source: 'youtube' | 'google_trends' | 'news' | 'reddit' | 'owned_analytics' | 'other';
  strength: number;
  observedAt: Date;
  authority?: number;
};

const sourceWeight: Record<EvidenceSource['source'], number> = {
  youtube: 1.0,
  google_trends: 0.95,
  news: 0.75,
  reddit: 0.62,
  owned_analytics: 1.0,
  other: 0.45,
};
const clamp = (n: number) => Math.max(0, Math.min(100, n));
const round = (n: number) => Math.round(n * 10) / 10;

export function calculateCrossSourceConfidence(evidence: EvidenceSource[], now = new Date()): number {
  if (evidence.length === 0) return 0;
  const newestPerSource = new Map<EvidenceSource['source'], EvidenceSource>();
  for (const item of evidence) {
    if (item.strength < 0 || item.strength > 100) throw new Error('Evidence strength must be 0..100');
    const existing = newestPerSource.get(item.source);
    if (!existing || item.observedAt > existing.observedAt) newestPerSource.set(item.source, item);
  }

  let support = 0;
  let weightTotal = 0;
  for (const item of newestPerSource.values()) {
    const ageHours = Math.max(0, (now.getTime() - item.observedAt.getTime()) / 3_600_000);
    const recency = Math.exp(-ageHours / (24 * 7)); // ~7-day decay constant
    const authority = clamp(item.authority ?? 80) / 100;
    const weight = sourceWeight[item.source] * recency * authority;
    support += (item.strength / 100) * weight;
    weightTotal += weight;
  }

  const quality = weightTotal ? support / weightTotal : 0;
  const diversity = 1 - Math.exp(-newestPerSource.size / 2.2);
  const confidence = 100 * (quality * 0.65 + diversity * 0.35);
  return round(clamp(confidence));
}
