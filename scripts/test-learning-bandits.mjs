import assert from 'node:assert/strict';
import { selectStructuralExperiment } from '../packages/production/dist/index.js';

function findSeed(prefix, predicate){
  for(let i=0;i<10000;i+=1){
    const seed=`${prefix}-${i}`;
    const result=selectStructuralExperiment({sampleSize:24,experimentSeed:seed,allowCostExperiment:true});
    if(predicate(result)) return seed;
  }
  throw new Error(`No deterministic seed found for ${prefix}`);
}

const exploitSeed=findSeed('exploit',(result)=>result.mode!=='EXPLORE');

const sparse=selectStructuralExperiment({
  sampleSize:1,
  experimentSeed:exploitSeed,
  learning:{sampleSize:1,arms:[{axis:'hook',arm:'MORE_DIRECT',sampleSize:1,meanOutcomeScore:99}]},
});
assert.equal(sparse.mode,'CONTROL','one lucky video must not displace control');
assert.equal(sparse.selected.arm,'CONTROL');

const learned=selectStructuralExperiment({
  sampleSize:24,
  experimentSeed:exploitSeed,
  learning:{sampleSize:24,arms:[
    {axis:'hook',arm:'CONTROL',sampleSize:8,meanOutcomeScore:54},
    {axis:'hook',arm:'MORE_DIRECT',sampleSize:8,meanOutcomeScore:78},
    {axis:'duration',arm:'SHORTER',sampleSize:4,meanOutcomeScore:58},
    {axis:'visual_density',arm:'DENSER',sampleSize:4,meanOutcomeScore:61},
  ]},
});
assert.equal(learned.mode,'EXPLOIT');
assert.equal(learned.selected.arm,'MORE_DIRECT');
const direct=learned.learnedScores.find((row)=>row.arm==='MORE_DIRECT');
assert.ok(direct && direct.confidence>0.5 && direct.learnedScore>60);

const weak=selectStructuralExperiment({
  sampleSize:24,
  experimentSeed:exploitSeed,
  learning:{sampleSize:24,arms:[
    {axis:'hook',arm:'CONTROL',sampleSize:10,meanOutcomeScore:62},
    {axis:'duration',arm:'LONGER',sampleSize:10,meanOutcomeScore:64},
  ]},
});
assert.equal(weak.mode,'CONTROL','small learned deltas should not trigger exploitation');

console.log('✓ sparse structural evidence is shrunk toward control');
console.log('✓ sufficiently supported winning structural arm is exploited');
console.log('✓ marginal differences do not cause premature exploitation');
