export type OpportunitySignals = {
  trendVelocity: number;
  demand: number;
  outlierStrength: number;
  competitionGap: number;
  retentionPotential: number;
  monetizationPotential: number;
  evergreenPotential: number;
  freshness: number;
  channelFit: number;
  productionFeasibility: number;
  multiFormatPotential: number;
  crossSourceConfidence: number;
};

export type RiskSignals = {
  copyrightRisk: number;
  policyRisk: number;
  factualRisk: number;
  saturationRisk: number;
  productionCostRisk: number;
};

export type OpportunityScore = {
  rawScore: number;
  riskPenalty: number;
  confidenceMultiplier: number;
  finalScore: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'D';
  decision: 'PRODUCE' | 'RESEARCH' | 'WATCH' | 'REJECT';
};

export type VideoSample = {
  id: string;
  views: number;
  publishedAt: Date;
};

export type NicheSignals = {
  monetizationPotential: number;
  trendFrequency: number;
  evergreenDepth: number;
  audienceBreadth: number;
  storytellingPotential: number;
  packagingPotential: number;
  sponsorAffiliatePotential: number;
  automationFit: number;
  assetAvailability: number;
  crossLanguagePotential: number;
  differentiationPotential: number;
  evidenceConfidence: number;
};

export type NicheRisks = {
  policyRisk: number;
  copyrightRisk: number;
  expertiseRisk: number;
  productionCostRisk: number;
  saturationRisk: number;
};

export type NicheScore = {
  rawScore: number;
  riskPenalty: number;
  confidenceMultiplier: number;
  finalScore: number;
  recommendation: 'PRIMARY' | 'TEST' | 'WATCH' | 'AVOID';
};
