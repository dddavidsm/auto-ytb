import { calculateNicheScore } from './niche.js';
import type { NicheRisks, NicheSignals } from './types.js';

export type NicheObservation = {
  nicheId: string;
  competitorCount: number;
  priorityCompetitors: number;
  trackCompetitors: number;
  totalRecentVideos: number;
  totalBreakouts: number;
  medianViewsPerDay: number;
  medianCompetitorScore: number;
  strongestOutlier: number;
};

export type NormalizedNicheEvidence = NicheObservation & {
  competitorDepth: number;
  breakoutActivity: number;
  velocityStrength: number;
  replicability: number;
  observedOpportunity: number;
  evidenceConfidence: number;
};

export type NichePrior = {
  id: string;
  label: string;
  signals: NicheSignals;
  risks: NicheRisks;
};

export type EvaluatedNiche = NichePrior & {
  evidence: NormalizedNicheEvidence;
  blendedSignals: NicheSignals;
  finalScore: number;
  recommendation: 'PRIMARY' | 'TEST' | 'WATCH' | 'AVOID';
};

const clamp = (n: number) => Math.max(0, Math.min(100, n));
const round = (n: number) => Math.round(n * 10) / 10;
const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

export function normalizeNicheObservations(observations: NicheObservation[]): NormalizedNicheEvidence[] {
  const maxVelocity = Math.max(...observations.map((o) => o.medianViewsPerDay), 1);
  return observations.map((observation) => {
    const competitorDepth = clamp((observation.competitorCount / 16) * 100);
    const breakoutDensity = observation.totalRecentVideos > 0
      ? observation.totalBreakouts / observation.totalRecentVideos
      : 0;
    const breakoutActivity = clamp(breakoutDensity * 500);
    const velocityStrength = observation.medianViewsPerDay <= 0
      ? 0
      : clamp((Math.log10(1 + observation.medianViewsPerDay) / Math.log10(1 + maxVelocity)) * 100);
    const highQuality = observation.competitorCount
      ? (observation.priorityCompetitors + observation.trackCompetitors * 0.55) / observation.competitorCount
      : 0;
    const replicability = clamp(highQuality * 100 * 0.65 + observation.medianCompetitorScore * 0.35);
    const observedOpportunity = clamp(
      breakoutActivity * 0.30 +
      velocityStrength * 0.24 +
      replicability * 0.24 +
      clamp(observation.strongestOutlier) * 0.14 +
      competitorDepth * 0.08,
    );
    const sampleConfidence = clamp(
      competitorDepth * 0.45 +
      clamp((observation.totalRecentVideos / 200) * 100) * 0.35 +
      (observation.competitorCount >= 5 ? 20 : observation.competitorCount * 4),
    );
    return {
      ...observation,
      competitorDepth: round(competitorDepth),
      breakoutActivity: round(breakoutActivity),
      velocityStrength: round(velocityStrength),
      replicability: round(replicability),
      observedOpportunity: round(observedOpportunity),
      evidenceConfidence: round(sampleConfidence),
    };
  });
}

export function evaluateNiches(priors: NichePrior[], observations: NicheObservation[]): EvaluatedNiche[] {
  const normalized = normalizeNicheObservations(observations);
  const evidenceById = new Map(normalized.map((e) => [e.nicheId, e]));

  return priors
    .map((prior) => {
      const evidence = evidenceById.get(prior.id) ?? {
        nicheId: prior.id,
        competitorCount: 0,
        priorityCompetitors: 0,
        trackCompetitors: 0,
        totalRecentVideos: 0,
        totalBreakouts: 0,
        medianViewsPerDay: 0,
        medianCompetitorScore: 0,
        strongestOutlier: 0,
        competitorDepth: 0,
        breakoutActivity: 0,
        velocityStrength: 0,
        replicability: 0,
        observedOpportunity: 0,
        evidenceConfidence: 0,
      };
      const confidence = evidence.evidenceConfidence / 100;
      const blend = (priorValue: number, observedValue: number, observedWeight = 0.45) =>
        clamp(priorValue * (1 - confidence * observedWeight) + observedValue * confidence * observedWeight);
      const blendedSignals: NicheSignals = {
        ...prior.signals,
        trendFrequency: blend(prior.signals.trendFrequency, evidence.breakoutActivity, 0.60),
        audienceBreadth: blend(prior.signals.audienceBreadth, evidence.competitorDepth, 0.30),
        storytellingPotential: blend(prior.signals.storytellingPotential, evidence.strongestOutlier, 0.25),
        packagingPotential: blend(prior.signals.packagingPotential, evidence.strongestOutlier, 0.40),
        differentiationPotential: blend(prior.signals.differentiationPotential, evidence.replicability, 0.35),
        evidenceConfidence: evidence.evidenceConfidence,
      };
      const score = calculateNicheScore(blendedSignals, prior.risks);
      return { ...prior, evidence, blendedSignals, finalScore: score.finalScore, recommendation: score.recommendation };
    })
    .sort((a, b) => b.finalScore - a.finalScore);
}

export function selectNicheWinner(evaluated: EvaluatedNiche[]): {
  decision: 'PRIMARY' | 'COLLECT_MORE_DATA';
  winner: EvaluatedNiche | null;
  margin: number;
  reason: string;
} {
  const [first, second] = evaluated;
  if (!first) return { decision: 'COLLECT_MORE_DATA', winner: null, margin: 0, reason: 'No niche evidence available' };
  const margin = round(first.finalScore - (second?.finalScore ?? 0));
  if (first.evidence.evidenceConfidence < 62) {
    return { decision: 'COLLECT_MORE_DATA', winner: first, margin, reason: 'Top niche does not yet have enough observed evidence' };
  }
  if (first.finalScore < 64) {
    return { decision: 'COLLECT_MORE_DATA', winner: first, margin, reason: 'Top niche score is below the launch threshold' };
  }
  if (second && margin < 3.5) {
    return { decision: 'COLLECT_MORE_DATA', winner: first, margin, reason: 'The leader is not separated enough from the runner-up' };
  }
  return { decision: 'PRIMARY', winner: first, margin, reason: 'Observed evidence, profitability and risk gates support launch' };
}

export function summarizeNicheObservation(input: {
  nicheId: string;
  competitors: Array<{ score: number; tier: 'PRIORITY' | 'TRACK' | 'REFERENCE' | 'IGNORE'; medianViewsPerDay: number; breakoutCount: number; strongestOutlier: number; recentVideos: number }>;
}): NicheObservation {
  const competitors = input.competitors;
  return {
    nicheId: input.nicheId,
    competitorCount: competitors.length,
    priorityCompetitors: competitors.filter((c) => c.tier === 'PRIORITY').length,
    trackCompetitors: competitors.filter((c) => c.tier === 'TRACK').length,
    totalRecentVideos: competitors.reduce((sum, c) => sum + c.recentVideos, 0),
    totalBreakouts: competitors.reduce((sum, c) => sum + c.breakoutCount, 0),
    medianViewsPerDay: round(median(competitors.map((c) => c.medianViewsPerDay))),
    medianCompetitorScore: round(median(competitors.map((c) => c.score))),
    strongestOutlier: round(Math.max(...competitors.map((c) => c.strongestOutlier), 0)),
  };
}
