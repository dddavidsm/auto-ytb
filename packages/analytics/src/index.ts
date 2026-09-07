export type RetentionPoint = { elapsedRatio: number; audienceWatchRatio: number };
export type VideoPerformance = {
  videoId: string;
  views: number;
  watchTimeMinutes: number;
  averageViewDurationSec: number;
  averageViewPercentage: number;
  likes: number;
  comments: number;
  shares: number;
  subscribersGained: number;
  revenueUsd: number;
  productionCostUsd: number;
  retention: RetentionPoint[];
};

export type RetentionEvent = { atRatio: number; type: 'DIP' | 'SPIKE' | 'STABLE'; magnitude: number };

export function analyzeRetention(points: RetentionPoint[]): RetentionEvent[] {
  const sorted = [...points].sort((a, b) => a.elapsedRatio - b.elapsedRatio);
  const events: RetentionEvent[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const delta = sorted[i].audienceWatchRatio - sorted[i - 1].audienceWatchRatio;
    if (delta <= -0.08) events.push({ atRatio: sorted[i].elapsedRatio, type: 'DIP', magnitude: Math.round(Math.abs(delta) * 1000) / 10 });
    else if (delta >= 0.05) events.push({ atRatio: sorted[i].elapsedRatio, type: 'SPIKE', magnitude: Math.round(delta * 1000) / 10 });
  }
  return events;
}

export function calculateEconomics(performance: VideoPerformance) {
  const profitUsd = performance.revenueUsd - performance.productionCostUsd;
  const rpmUsd = performance.views > 0 ? performance.revenueUsd / performance.views * 1000 : 0;
  const roi = performance.productionCostUsd > 0 ? profitUsd / performance.productionCostUsd : performance.revenueUsd > 0 ? Infinity : 0;
  return { profitUsd: Math.round(profitUsd * 100) / 100, rpmUsd: Math.round(rpmUsd * 100) / 100, roi: Number.isFinite(roi) ? Math.round(roi * 100) / 100 : roi };
}

export function deriveLearningSignals(performance: VideoPerformance) {
  const retentionEvents = analyzeRetention(performance.retention);
  return {
    strongHook: (performance.retention.find((point) => point.elapsedRatio >= 0.05)?.audienceWatchRatio ?? 0) >= 0.75,
    averageViewPercentage: performance.averageViewPercentage,
    subscriberConversionPerThousand: performance.views ? Math.round((performance.subscribersGained / performance.views * 1000) * 100) / 100 : 0,
    shareRate: performance.views ? Math.round((performance.shares / performance.views) * 10000) / 100 : 0,
    retentionEvents,
    economics: calculateEconomics(performance),
  };
}
