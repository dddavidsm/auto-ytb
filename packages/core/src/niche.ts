import type { NicheRisks, NicheScore, NicheSignals } from './types.js';

const weights: Record<keyof NicheSignals, number> = {
  monetizationPotential: 0.15,
  trendFrequency: 0.10,
  evergreenDepth: 0.11,
  audienceBreadth: 0.09,
  storytellingPotential: 0.12,
  packagingPotential: 0.10,
  sponsorAffiliatePotential: 0.10,
  automationFit: 0.06,
  assetAvailability: 0.04,
  crossLanguagePotential: 0.04,
  differentiationPotential: 0.05,
  evidenceConfidence: 0.04,
};

const riskCaps: Record<keyof NicheRisks, number> = {
  policyRisk: 18,
  copyrightRisk: 18,
  expertiseRisk: 10,
  productionCostRisk: 9,
  saturationRisk: 15,
};

const validate = (value: number, key: string) => {
  if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(`${key} must be 0..100`);
};
const round = (n: number) => Math.round(n * 10) / 10;

export function calculateNicheScore(signals: NicheSignals, risks: NicheRisks): NicheScore {
  for (const key of Object.keys(weights) as Array<keyof NicheSignals>) validate(signals[key], key);
  for (const key of Object.keys(riskCaps) as Array<keyof NicheRisks>) validate(risks[key], key);

  const rawScore = (Object.keys(weights) as Array<keyof NicheSignals>).reduce(
    (sum, key) => sum + signals[key] * weights[key], 0,
  );
  const riskPenalty = (Object.keys(riskCaps) as Array<keyof NicheRisks>).reduce(
    (sum, key) => sum + (risks[key] / 100) * riskCaps[key], 0,
  );

  // Priors are intentionally discounted until enough observed market data exists.
  const confidenceMultiplier = 0.80 + (signals.evidenceConfidence / 100) * 0.20;
  const finalScore = Math.max(0, Math.min(100, (rawScore - riskPenalty) * confidenceMultiplier));
  const recommendation: NicheScore['recommendation'] =
    finalScore >= 76 ? 'PRIMARY' : finalScore >= 64 ? 'TEST' : finalScore >= 50 ? 'WATCH' : 'AVOID';

  return {
    rawScore: round(rawScore),
    riskPenalty: round(riskPenalty),
    confidenceMultiplier: round(confidenceMultiplier),
    finalScore: round(finalScore),
    recommendation,
  };
}
