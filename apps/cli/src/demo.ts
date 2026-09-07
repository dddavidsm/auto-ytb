import { calculateOpportunityScore, calculateOutlier } from '@auto-ytb/core';

const score = calculateOpportunityScore(
  {
    trendVelocity: 94,
    demand: 84,
    outlierStrength: 91,
    competitionGap: 78,
    retentionPotential: 96,
    monetizationPotential: 88,
    evergreenPotential: 82,
    freshness: 96,
    channelFit: 92,
    productionFeasibility: 84,
    multiFormatPotential: 88,
    crossSourceConfidence: 93,
  },
  {
    copyrightRisk: 4,
    policyRisk: 5,
    factualRisk: 12,
    saturationRisk: 14,
    productionCostRisk: 10,
  },
);

const now = new Date('2026-09-07T12:00:00Z');
const outlier = calculateOutlier(
  { id: 'breakout', views: 438_000, publishedAt: new Date('2026-09-05T12:00:00Z') },
  [
    { id: '1', views: 32_000, publishedAt: new Date('2026-08-28T12:00:00Z') },
    { id: '2', views: 41_000, publishedAt: new Date('2026-08-27T12:00:00Z') },
    { id: '3', views: 27_000, publishedAt: new Date('2026-08-29T12:00:00Z') },
    { id: '4', views: 38_000, publishedAt: new Date('2026-08-26T12:00:00Z') },
  ],
  now,
);

console.log(JSON.stringify({ opportunity: score, outlier }, null, 2));
