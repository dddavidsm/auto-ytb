import type { BenchmarkRequest, BenchmarkVideo } from './benchmark.js';
import type { PatternCluster } from './pattern-mining.js';
import type { ReferencePack } from './reference-pack.js';

export type OpportunityScoreBreakdown = {
  demand: number;
  outlierEvidence: number;
  recentVelocity: number;
  evergreenPotential: number;
  monetizationPotential: number;
  productionFeasibility: number;
  packagingStrength: number;
  channelFit: number;
  originality: number;
  competitionPenalty: number;
  productionCostPenalty: number;
  policyRisk: number;
  total: number;
  formula: string;
};

export type EvidenceBackedOpportunity = {
  idea: string;
  workingTitle: string;
  topic: string;
  angle: string;
  whyNow: string;
  audience: string;
  referencePack: ReferencePack;
  evidence: Array<{ type: 'OUTLIER' | 'PATTERN' | 'GAP'; sourceIds: string[]; note: string; strength: number }>;
  similarSuccessfulVideos: string[];
  patternUsed: string[];
  novelty: number;
  productionComplexity: number;
  estimatedCostUsd: number;
  monetizationFit: number;
  risk: { policy: number; copyright: number; factual: number };
  confidence: number;
  score: OpportunityScoreBreakdown;
  decision: 'PRODUCE' | 'RESEARCH' | 'WATCH' | 'REJECT';
};

const clamp = (value: number) => Math.max(0, Math.min(100, value));
const round = (value: number, digits = 1) => { const factor = 10 ** digits; return Math.round(value * factor) / factor; };

export function scoreEvidenceBackedOpportunity(input: Omit<OpportunityScoreBreakdown, 'total' | 'formula'>): OpportunityScoreBreakdown {
  const positive = input.demand * 0.14 + input.outlierEvidence * 0.16 + input.recentVelocity * 0.10 + input.evergreenPotential * 0.08 + input.monetizationPotential * 0.10 + input.productionFeasibility * 0.08 + input.packagingStrength * 0.10 + input.channelFit * 0.08 + input.originality * 0.08;
  const penalties = input.competitionPenalty * 0.04 + input.productionCostPenalty * 0.02 + input.policyRisk * 0.02;
  const total = clamp(positive - penalties);
  return { ...input, total: round(total), formula: 'Σ weighted evidence signals − competition − cost − policy risk (all components visible)' };
}

export function generateEvidenceBackedOpportunity(input: {
  request: BenchmarkRequest;
  topic: string;
  angle: string;
  workingTitle: string;
  audience: string;
  referencePack: ReferencePack;
  videos: BenchmarkVideo[];
  patterns: PatternCluster[];
  demand?: number;
  channelFit?: number;
  productionCostUsd?: number;
  novelty?: number;
}): EvidenceBackedOpportunity {
  const winners = input.videos.filter((video) => video.likelyOutlier.classification === 'BREAKOUT' || video.likelyOutlier.classification === 'EXTREME_OUTLIER' || video.likelyOutlier.classification === 'STRONG_OUTLIER');
  const patternEvidence = input.patterns.filter((pattern) => pattern.transferable).slice(0, 4);
  const estimatedCostUsd = Math.max(0, input.productionCostUsd ?? 0);
  const productionFeasibility = input.request.productionBudgetUsd == null || estimatedCostUsd === 0 ? 70 : clamp(100 - estimatedCostUsd / Math.max(input.request.productionBudgetUsd, 1) * 100);
  const outlierEvidence = winners.length ? clamp(winners.reduce((sum, video) => sum + video.likelyOutlier.score, 0) / winners.length) : 0;
  const recentVelocity = winners.length ? clamp(winners.reduce((sum, video) => sum + Math.min(100, video.likelyOutlier.velocityMultiple * 20), 0) / winners.length) : 0;
  const originality = clamp(input.novelty ?? 72);
  const score = scoreEvidenceBackedOpportunity({
    demand: clamp(input.demand ?? (winners.length ? 65 + Math.min(30, winners.length * 4) : 0)),
    outlierEvidence,
    recentVelocity,
    evergreenPotential: clamp(winners.filter((video) => video.likelyOutlier.persistenceScore >= 60).length / Math.max(winners.length, 1) * 100),
    monetizationPotential: input.request.monetizationPriority === 'HIGH' ? 82 : input.request.monetizationPriority === 'LOW' ? 55 : 70,
    productionFeasibility,
    packagingStrength: clamp(patternEvidence.length * 18 + (input.referencePack.diversity.roles >= 3 ? 25 : 0)),
    channelFit: clamp(input.channelFit ?? 70),
    originality,
    competitionPenalty: clamp(100 - originality),
    productionCostPenalty: clamp(estimatedCostUsd && input.request.productionBudgetUsd ? estimatedCostUsd / input.request.productionBudgetUsd * 100 : 0),
    policyRisk: 12,
  });
  const confidence = clamp(input.referencePack.items.length / 7 * 35 + winners.length / Math.max(input.videos.length, 1) * 35 + patternEvidence.reduce((sum, pattern) => sum + pattern.confidence, 0) / Math.max(patternEvidence.length, 1) * 0.3);
  const decision = score.total >= 78 && confidence >= 60 ? 'PRODUCE' : score.total >= 62 && confidence >= 40 ? 'RESEARCH' : score.total >= 42 ? 'WATCH' : 'REJECT';
  return {
    idea: `${input.topic}: ${input.angle}`,
    workingTitle: input.workingTitle,
    topic: input.topic,
    angle: input.angle,
    whyNow: winners.length ? `${winners.length} comparable winner(s) show observable demand and outlier performance.` : 'No winning evidence was available; keep this as an unvalidated hypothesis.',
    audience: input.audience,
    referencePack: input.referencePack,
    evidence: [
      ...winners.slice(0, 7).map((video) => ({ type: 'OUTLIER' as const, sourceIds: [video.id], note: video.likelyOutlier.reasons.join('; '), strength: video.likelyOutlier.score })),
      ...patternEvidence.map((pattern) => ({ type: 'PATTERN' as const, sourceIds: pattern.referenceVideos, note: pattern.description, strength: pattern.confidence })),
      { type: 'GAP', sourceIds: [], note: originality >= 65 ? 'angle is deliberately distinct from the selected references' : 'novelty is not yet strong enough', strength: originality },
    ],
    similarSuccessfulVideos: winners.map((video) => video.id),
    patternUsed: patternEvidence.map((pattern) => pattern.name),
    novelty: originality,
    productionComplexity: round(100 - productionFeasibility),
    estimatedCostUsd: round(estimatedCostUsd, 2),
    monetizationFit: score.monetizationPotential,
    risk: { policy: 12, copyright: 0, factual: 25 },
    confidence: round(confidence),
    score,
    decision,
  };
}
