import assert from 'node:assert/strict';
import { decideSeriesContinuation, mergeCanonicalMemory, validateEpisodeMemory } from '../packages/os/dist/index.js';

const merged=mergeCanonicalMemory([
  {type:'prop_state',key:'magic-key',importance:70,canonical:true,payload:{value:'Old Owl owns the silver key'}},
],[
  {type:'prop_state',key:'magic-key',importance:88,canonical:true,payload:{value:'Old Owl used the silver key to open the moon door'}},
  {type:'relationship',key:'owl-luna',importance:75,canonical:true,payload:{value:'Old Owl now trusts Luna'}},
]);
assert.equal(merged.length,2);
assert.equal(merged.find((item)=>item.key==='magic-key')?.importance,88);

const safe=validateEpisodeMemory({madeForKids:true,facts:[{type:'plot_fact',key:'found-map',importance:80,canonical:true,payload:{value:'They found a map'}}],conflicts:[]});
assert.equal(safe.passed,true);
const immutable=validateEpisodeMemory({facts:[{type:'character_invariant',key:'owl-face',importance:90,canonical:true,payload:{value:'Change the permanent face design'}}]});
assert.equal(immutable.passed,false);
assert.ok(immutable.blocking.some((item)=>item.includes('immutable canon')));
const unsafeKids=validateEpisodeMemory({madeForKids:true,facts:[{type:'unsafe_challenge',key:'roof-jump',importance:90,canonical:true,payload:{value:'imitate roof jump'}}]});
assert.equal(unsafeKids.passed,false);

const early=decideSeriesContinuation({sampleSize:2,views:220,averageViewPercentage:90,roi:5});
assert.equal(early.decision,'LEARN');
const strong=decideSeriesContinuation({sampleSize:8,views:18000,averageViewPercentage:72,shareRate:2.3,subscribersPerThousand:13,roi:1.8,watchMinutesPerDollar:920});
assert.equal(strong.decision,'SCALE');
const strongQuality=decideSeriesContinuation({sampleSize:8,views:18000,averageViewPercentage:72,shareRate:2.3,subscribersPerThousand:13,roi:1.8,watchMinutesPerDollar:920,qualityReportCoverage:1,averageVisualContinuityScore:91,averageKidsQualityScore:92,qualityWarningRate:0.1,qualityBlockedCount:0});
assert.equal(strongQuality.decision,'SCALE');
const incompleteQuality=decideSeriesContinuation({sampleSize:8,views:18000,averageViewPercentage:72,shareRate:2.3,subscribersPerThousand:13,roi:1.8,watchMinutesPerDollar:920,qualityReportCoverage:0.5,averageVisualContinuityScore:90,averageKidsQualityScore:91,qualityWarningRate:0.1,qualityBlockedCount:0});
assert.equal(incompleteQuality.decision,'CONTINUE');
const visualDrift=decideSeriesContinuation({sampleSize:8,views:18000,averageViewPercentage:72,shareRate:2.3,subscribersPerThousand:13,roi:1.8,watchMinutesPerDollar:920,qualityReportCoverage:1,averageVisualContinuityScore:62,averageKidsQualityScore:92,qualityWarningRate:0.2,qualityBlockedCount:0});
assert.equal(visualDrift.decision,'REVIEW');
const weak=decideSeriesContinuation({sampleSize:10,views:9000,averageViewPercentage:25,shareRate:0.1,subscribersPerThousand:0.2,roi:-1.3,watchMinutesPerDollar:20});
assert.equal(weak.decision,'PAUSE');
console.log('✓ series memory deduplicates canonical facts by semantic key');
console.log('✓ episode memory cannot overwrite immutable canon or unsafe kids rules');
console.log('✓ series strategy waits for evidence before scaling or pausing');
console.log('✓ strong business metrics cannot SCALE a series with incomplete or drifting quality evidence');
