export type ChannelDna = {
  id: string;
  language: string;
  region: string;
  positioning: string;
  targetViewer: string;
  targetDurationSec: number;
  maxProductionCostUsd: number;
  learning: Record<string, number | string | boolean>;
};

export type PortfolioChannel = {
  channelId: string;
  enabled: boolean;
  expectedRoi: number;
  evidenceConfidence: number;
  opportunityBacklogScore: number;
  growthPriority: number;
  minimumDailyBudgetUsd?: number;
  maximumDailyBudgetUsd?: number;
};

export type BudgetAllocation = { channelId: string; dailyBudgetUsd: number; weight: number };

export function allocatePortfolioBudget(totalUsd: number, channels: PortfolioChannel[]): BudgetAllocation[] {
  if (totalUsd < 0) throw new Error('totalUsd must be non-negative');
  const active = channels.filter((channel) => channel.enabled);
  if (!active.length || totalUsd === 0) return active.map((channel) => ({ channelId: channel.channelId, dailyBudgetUsd: 0, weight: 0 }));
  const scored = active.map((channel) => {
    const roi = Math.max(0.1, channel.expectedRoi + 1);
    const confidence = Math.max(0.1, channel.evidenceConfidence / 100);
    const backlog = Math.max(0.1, channel.opportunityBacklogScore / 100);
    const priority = Math.max(0.1, channel.growthPriority / 100);
    return { ...channel, weight: roi * confidence * backlog * priority };
  });
  const minimum = scored.reduce((sum, channel) => sum + Math.max(0, channel.minimumDailyBudgetUsd ?? 0), 0);
  const distributable = Math.max(0, totalUsd - Math.min(totalUsd, minimum));
  const weightTotal = scored.reduce((sum, channel) => sum + channel.weight, 0);
  let allocations = scored.map((channel) => {
    const floor = Math.min(totalUsd, Math.max(0, channel.minimumDailyBudgetUsd ?? 0));
    const variable = weightTotal ? distributable * channel.weight / weightTotal : 0;
    const cap = channel.maximumDailyBudgetUsd ?? Infinity;
    return { channelId: channel.channelId, dailyBudgetUsd: Math.min(cap, floor + variable), weight: Math.round(channel.weight * 1000) / 1000 };
  });
  const allocated = allocations.reduce((sum, allocation) => sum + allocation.dailyBudgetUsd, 0);
  if (allocated > 0 && allocated > totalUsd) {
    const scale = totalUsd / allocated;
    allocations = allocations.map((allocation) => ({ ...allocation, dailyBudgetUsd: allocation.dailyBudgetUsd * scale }));
  }
  return allocations.map((allocation) => ({ ...allocation, dailyBudgetUsd: Math.round(allocation.dailyBudgetUsd * 100) / 100 })).sort((a, b) => b.dailyBudgetUsd - a.dailyBudgetUsd);
}

export type ProviderCandidate = { id: string; enabled: boolean; quality: number; reliability: number; latency: number; cost: number };
export function rankProviders(candidates: ProviderCandidate[]): Array<ProviderCandidate & { routeScore: number }> {
  return candidates.filter((candidate) => candidate.enabled).map((candidate) => ({
    ...candidate,
    routeScore: Math.round((candidate.quality * 0.42 + candidate.reliability * 0.28 + (100 - candidate.latency) * 0.12 + (100 - candidate.cost) * 0.18) * 10) / 10,
  })).sort((a, b) => b.routeScore - a.routeScore);
}

export type Job = { key: string; kind: string; channelId?: string; priority: number; notBefore?: string; payload: Record<string, unknown> };
export function dedupeJobs(jobs: Job[]): Job[] {
  const byKey = new Map<string, Job>();
  for (const job of jobs) {
    const current = byKey.get(job.key);
    if (!current || job.priority > current.priority) byKey.set(job.key, job);
  }
  return [...byKey.values()].sort((a, b) => b.priority - a.priority);
}
