import assert from 'node:assert/strict';
import { recommendContentFormat } from '../packages/core/dist/index.js';

const documentary = recommendContentFormat({
  narrativeDepth:95,visualSnackability:58,trendVelocity:72,searchIntentDepth:88,repeatability:65,
  monetizationDepth:92,sponsorFit:90,shortHookStrength:72,longRetentionPotential:94,
  mobileConsumptionFit:70,tvConsumptionFit:92,episodicPotential:85,productionComplexity:60,
});
assert.equal(documentary.primary,'LONG_HORIZONTAL');
assert.ok(documentary.scores.LONG_HORIZONTAL > documentary.scores.SHORT_VERTICAL);
assert.ok(['LONG_TO_SHORTS','BIDIRECTIONAL','NONE'].includes(documentary.derivativeStrategy));

const shortNative = recommendContentFormat({
  narrativeDepth:35,visualSnackability:96,trendVelocity:95,searchIntentDepth:35,repeatability:94,
  monetizationDepth:55,sponsorFit:45,shortHookStrength:97,longRetentionPotential:45,
  mobileConsumptionFit:98,tvConsumptionFit:28,episodicPotential:90,productionComplexity:25,
});
assert.equal(shortNative.primary,'SHORT_VERTICAL');
assert.ok(shortNative.suggestedDurationsSec.shortVertical);

const hybrid = recommendContentFormat({
  narrativeDepth:78,visualSnackability:82,trendVelocity:84,searchIntentDepth:72,repeatability:80,
  monetizationDepth:80,sponsorFit:76,shortHookStrength:84,longRetentionPotential:82,
  mobileConsumptionFit:88,tvConsumptionFit:76,episodicPotential:88,productionComplexity:42,
});
assert.ok(hybrid.scores.HYBRID >= Math.min(hybrid.scores.LONG_HORIZONTAL,hybrid.scores.SHORT_VERTICAL));
assert.ok(['HYBRID','LONG_HORIZONTAL','SHORT_VERTICAL'].includes(hybrid.primary));

const kids = recommendContentFormat({
  narrativeDepth:58,visualSnackability:90,trendVelocity:75,searchIntentDepth:45,repeatability:92,
  monetizationDepth:52,sponsorFit:40,shortHookStrength:88,longRetentionPotential:68,
  mobileConsumptionFit:90,tvConsumptionFit:80,kidAudienceFit:95,episodicPotential:95,productionComplexity:35,
},{madeForKidsRisk:90,policyRisk:25,lowEffortRisk:15});
assert.ok(kids.rationale.some((x)=>x.includes('made-for-kids')));

console.log('✓ long-form niche routing');
console.log('✓ Shorts-native niche routing');
console.log('✓ hybrid format support');
console.log('✓ made-for-kids treated as separate compliance/economics model');
