import assert from 'node:assert/strict';
import { calculateOpportunityScore, calculateOutlier, calculateNicheScore } from '../packages/core/dist/index.js';

const strong = calculateOpportunityScore({
  trendVelocity:94,demand:82,outlierStrength:91,competitionGap:78,retentionPotential:93,
  monetizationPotential:88,evergreenPotential:76,freshness:95,channelFit:90,
  productionFeasibility:83,multiFormatPotential:86,crossSourceConfidence:92,
},{copyrightRisk:5,policyRisk:5,factualRisk:10,saturationRisk:10,productionCostRisk:8});
assert.ok(strong.finalScore > 75, `expected strong opportunity, got ${strong.finalScore}`);

const risky = calculateOpportunityScore({
  trendVelocity:94,demand:82,outlierStrength:91,competitionGap:78,retentionPotential:93,
  monetizationPotential:88,evergreenPotential:76,freshness:95,channelFit:90,
  productionFeasibility:83,multiFormatPotential:86,crossSourceConfidence:92,
},{copyrightRisk:95,policyRisk:80,factualRisk:60,saturationRisk:85,productionCostRisk:40});
assert.equal(risky.decision, 'REJECT');

const now = new Date('2026-09-07T12:00:00Z');
const outlier = calculateOutlier(
  { id:'x', views:410000, publishedAt:new Date('2026-09-05T12:00:00Z') },
  [
    { id:'a', views:35000, publishedAt:new Date('2026-08-28T12:00:00Z') },
    { id:'b', views:42000, publishedAt:new Date('2026-08-27T12:00:00Z') },
    { id:'c', views:31000, publishedAt:new Date('2026-08-29T12:00:00Z') },
    { id:'d', views:39000, publishedAt:new Date('2026-08-26T12:00:00Z') },
  ], now);
assert.ok(outlier.rawViewMultiple > 9);
assert.ok(outlier.velocityMultiple > 20);
assert.ok(outlier.score > 90);

console.log('✓ opportunity low-risk ranking');
console.log('✓ risk rejection gate');
console.log('✓ age-adjusted outlier detection');
console.log(JSON.stringify({ strong, risky, outlier }, null, 2));

const niche = calculateNicheScore({monetizationPotential:90,trendFrequency:85,evergreenDepth:85,audienceBreadth:88,storytellingPotential:94,packagingPotential:93,sponsorAffiliatePotential:90,automationFit:85,assetAvailability:82,crossLanguagePotential:90,differentiationPotential:80,evidenceConfidence:50},{policyRisk:10,copyrightRisk:15,expertiseRisk:20,productionCostRisk:25,saturationRisk:40});
assert.ok(niche.finalScore > 60);
console.log('✓ niche profitability/risk ranking');

const { analyzeTrend, calculateCrossSourceConfidence, allocateSearchBudget } = await import('../packages/core/dist/index.js');
const t0 = new Date('2026-09-01T00:00:00Z');
const trend = analyzeTrend([10,11,12,14,20,36,70,130].map((value,i)=>({at:new Date(t0.getTime()+i*86400000),value})));
assert.ok(trend.breakoutScore > 70);
assert.ok(trend.accelerationPct > 0);
const confidence = calculateCrossSourceConfidence([
  {source:'youtube',strength:90,observedAt:new Date('2026-09-07T10:00:00Z')},
  {source:'google_trends',strength:85,observedAt:new Date('2026-09-07T09:00:00Z')},
  {source:'news',strength:80,observedAt:new Date('2026-09-07T08:00:00Z')},
], new Date('2026-09-07T12:00:00Z'));
assert.ok(confidence > 70);
const allocation = allocateSearchBudget(100,[{name:'a',weight:3,minCalls:20},{name:'b',weight:2,minCalls:10},{name:'c',weight:1,minCalls:5}]);
assert.equal(allocation.reduce((s,a)=>s+a.calls,0),100);
console.log('✓ temporal trend breakout analysis');
console.log('✓ cross-source evidence confidence');
console.log('✓ quota-aware query planning');
