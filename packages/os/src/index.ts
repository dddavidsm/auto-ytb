export * from './channel-routing.js';
export * from './autonomy.js';
export * from './branding.js';
export * from './series.js';
export * from './series-memory.js';
export * from './content-archetypes.js';

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

export type RetryPolicy = { baseDelayMs?: number; maxDelayMs?: number; jitterRatio?: number };
export function computeRetryDelayMs(attempt: number, policy: RetryPolicy = {}): number {
  if (!Number.isFinite(attempt) || attempt < 1) throw new Error('attempt must be >= 1');
  const base = Math.max(1000, policy.baseDelayMs ?? 60_000);
  const max = Math.max(base, policy.maxDelayMs ?? 6 * 60 * 60_000);
  const jitterRatio = Math.max(0, Math.min(0.5, policy.jitterRatio ?? 0));
  const exponential = Math.min(max, base * 2 ** Math.min(20, attempt - 1));
  const deterministicJitter = exponential * jitterRatio * (((attempt * 9301 + 49297) % 233280) / 233280);
  return Math.round(Math.min(max, exponential + deterministicJitter));
}

export function shouldRetry(attempts: number, maxAttempts: number): boolean {
  return attempts < Math.max(1, maxAttempts);
}

export type LearningPerformance = {
  sampleSize: number;
  strongHookRate?: number;
  averageViewPercentage?: number;
  shareRate?: number;
  roi?: number;
};

export function calculateLearningBoost(metrics: LearningPerformance): number {
  const samples = Math.max(0, Math.floor(metrics.sampleSize));
  if (!samples) return 0;
  const confidence = Math.min(1, samples / 8);
  const hook = Math.max(0, Math.min(1, metrics.strongHookRate ?? 0.5));
  const avp = Math.max(0, Math.min(100, metrics.averageViewPercentage ?? 50));
  const share = Math.max(0, Math.min(10, metrics.shareRate ?? 0));
  const roi = Math.max(-1, Math.min(5, metrics.roi ?? 0));
  const raw = (hook - 0.5) * 8 + (avp - 50) / 12 + Math.min(3, share * 0.6) + Math.max(-3, Math.min(3, roi * 0.8));
  return Math.round(Math.max(-8, Math.min(8, raw * confidence)) * 10) / 10;
}

export type ProductionCandidate = {
  id: string;
  score: number;
  detectedAt: string;
  expiresAt?: string | null;
  riskPenalty?: number;
  expectedCostUsd?: number;
  learningBoost?: number;
};

export function rankProductionCandidates(candidates: ProductionCandidate[], now = new Date()): Array<ProductionCandidate & { productionPriority: number }> {
  const nowMs = now.getTime();
  return candidates.map((candidate) => {
    const detectedMs = new Date(candidate.detectedAt).getTime();
    const ageHours = Number.isFinite(detectedMs) ? Math.max(0, (nowMs - detectedMs) / 3_600_000) : 0;
    const freshness = Math.max(0, 100 - ageHours * 1.5);
    const expiresMs = candidate.expiresAt ? new Date(candidate.expiresAt).getTime() : NaN;
    const hoursToExpiry = Number.isFinite(expiresMs) ? Math.max(0, (expiresMs - nowMs) / 3_600_000) : 168;
    const urgency = Number.isFinite(expiresMs) ? Math.max(0, 100 - Math.min(100, hoursToExpiry * 2)) : 20;
    const risk = Math.max(0, Math.min(100, candidate.riskPenalty ?? 0));
    const costPenalty = Math.max(0, Math.min(25, (candidate.expectedCostUsd ?? 0) * 1.2));
    const learningBoost = Math.max(-8, Math.min(8, candidate.learningBoost ?? 0));
    const productionPriority = Math.round(Math.max(0, Math.min(100, candidate.score * 0.58 + freshness * 0.2 + urgency * 0.12 + (100 - risk) * 0.1 - costPenalty + learningBoost)) * 10) / 10;
    return { ...candidate, learningBoost, productionPriority };
  }).sort((a,b)=>b.productionPriority-a.productionPriority || b.score-a.score);
}
