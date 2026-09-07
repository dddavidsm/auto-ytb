import type { OpportunityScore, OpportunitySignals, RiskSignals } from './types.js';

const weights: Record<keyof OpportunitySignals, number> = {
  trendVelocity: 0.14,
  demand: 0.11,
  outlierStrength: 0.12,
  competitionGap: 0.11,
  retentionPotential: 0.12,
  monetizationPotential: 0.10,
  evergreenPotential: 0.08,
  freshness: 0.06,
  channelFit: 0.05,
  productionFeasibility: 0.04,
  multiFormatPotential: 0.03,
  crossSourceConfidence: 0.04,
};

const riskCaps: Record<keyof RiskSignals, number> = {
  copyrightRisk: 30,
  policyRisk: 30,
  factualRisk: 20,
  saturationRisk: 20,
  productionCostRisk: 10,
};

const round = (n: number) => Math.round(n * 10) / 10;
const clampScore = (n: number, label: string) => {
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`${label} must be between 0 and 100`);
  return n;
};

export function calculateOpportunityScore(
  signals: OpportunitySignals,
  risks: RiskSignals,
): OpportunityScore {
  for (const key of Object.keys(weights) as Array<keyof OpportunitySignals>) clampScore(signals[key], key);
  for (const key of Object.keys(riskCaps) as Array<keyof RiskSignals>) clampScore(risks[key], key);

  const rawScore = (Object.keys(weights) as Array<keyof OpportunitySignals>).reduce(
    (sum, key) => sum + signals[key] * weights[key],
    0,
  );

  const riskPenalty = (Object.keys(riskCaps) as Array<keyof RiskSignals>).reduce(
    (sum, key) => sum + (risks[key] / 100) * riskCaps[key],
    0,
  );

  const confidenceMultiplier = 0.88 + (signals.crossSourceConfidence / 100) * 0.12;
  const finalScore = Math.max(0, Math.min(100, (rawScore - riskPenalty) * confidenceMultiplier));

  const grade: OpportunityScore['grade'] =
    finalScore >= 85 ? 'S' : finalScore >= 75 ? 'A' : finalScore >= 65 ? 'B' : finalScore >= 50 ? 'C' : 'D';

  const decision: OpportunityScore['decision'] =
    finalScore >= 82 && risks.policyRisk < 60 && risks.copyrightRisk < 60
      ? 'PRODUCE'
      : finalScore >= 68
        ? 'RESEARCH'
        : finalScore >= 52
          ? 'WATCH'
          : 'REJECT';

  return {
    rawScore: round(rawScore),
    riskPenalty: round(riskPenalty),
    confidenceMultiplier: round(confidenceMultiplier),
    finalScore: round(finalScore),
    grade,
    decision,
  };
}
