import assert from 'node:assert/strict';
import { selectLicensedSoundtrack } from '../packages/production/dist/index.js';

const script={title:'Why the System Broke',language:'en',targetDurationSec:80,thesis:'A hidden constraint changed the outcome.',beats:[
  {id:'b1',startSec:0,targetDurationSec:12,purpose:'hook',narration:'Everything looked stable until one hidden constraint changed the outcome.',visualIntent:'contrast',sourceIds:[],retentionDevice:'open_loop'},
  {id:'b2',startSec:12,targetDurationSec:24,purpose:'evidence',narration:'The evidence shows where the assumption stopped holding.',visualIntent:'evidence',sourceIds:[],retentionDevice:'question'},
  {id:'b3',startSec:36,targetDurationSec:20,purpose:'escalation',narration:'The mismatch then propagated through the system.',visualIntent:'escalate',sourceIds:[],retentionDevice:'contrast'},
  {id:'b4',startSec:56,targetDurationSec:12,purpose:'reveal',narration:'The real cause was the constraint nobody modeled.',visualIntent:'reveal',sourceIds:[],retentionDevice:'reveal'},
  {id:'b5',startSec:68,targetDurationSec:12,purpose:'payoff',narration:'Once that constraint is visible, the failure becomes predictable.',visualIntent:'payoff',sourceIds:[],retentionDevice:'reveal'},
],outro:'The failure was predictable once the hidden constraint was visible.'};
const catalog=[
  {id:'music-safe',kind:'music',uri:'file:///licensed/music-safe.wav',license:'subscription-cleared',rightsStatus:'CLEARED',moods:['documentary','tension','analytical'],tags:['background'],costUsd:0.2,defaultGain:0.15,formats:['LONG_HORIZONTAL']},
  {id:'music-risky',kind:'music',uri:'file:///unknown.wav',license:'unknown',rightsStatus:'VERIFY',moods:['documentary','tension'],tags:['background'],costUsd:0},
  {id:'sfx-impact',kind:'sfx',uri:'file:///licensed/impact.wav',license:'subscription-cleared',rightsStatus:'CLEARED',tags:['reveal','impact'],costUsd:0.05,defaultGain:0.2},
  {id:'sfx-transition',kind:'sfx',uri:'file:///licensed/transition.wav',license:'subscription-cleared',rightsStatus:'CLEARED',tags:['hook','transition'],costUsd:0.05,defaultGain:0.18},
  {id:'sfx-blocked',kind:'sfx',uri:'file:///blocked.wav',license:'none',rightsStatus:'BLOCKED',tags:['payoff','impact'],costUsd:0},
];
const plan=selectLicensedSoundtrack({script,contentFormat:'LONG_HORIZONTAL',catalog,maxAudioCostUsd:0.35});
assert.equal(plan.music?.assetId,'music-safe','VERIFY music must never outrank cleared music');
assert.equal(plan.rightsReady,true);
assert.ok(plan.estimatedCostUsd<=0.35,'audio plan must stay within budget');
assert.ok(plan.sfx.length<=5,'SFX must stay sparse');
assert.ok(plan.sfx.every((cue)=>cue.rightsStatus==='CLEARED'));
assert.ok(!plan.sfx.some((cue)=>cue.assetId==='sfx-blocked'));
const noBudget=selectLicensedSoundtrack({script,contentFormat:'LONG_HORIZONTAL',catalog,maxAudioCostUsd:0});
assert.equal(noBudget.music,undefined);
assert.equal(noBudget.sfx.length,0);
assert.equal(noBudget.rightsReady,true,'silence/voice-only is rights-safe');
const shortPlan=selectLicensedSoundtrack({script:{...script,targetDurationSec:45},contentFormat:'SHORT_VERTICAL',catalog,maxAudioCostUsd:1});
assert.equal(shortPlan.music,undefined,'format-incompatible music must not be selected for Shorts');
assert.ok(shortPlan.sfx.length<=3,'Shorts must use even sparser SFX');
console.log('✓ soundtrack planner uses only CLEARED audio assets');
console.log('✓ soundtrack cost stays inside the configured per-video budget');
console.log('✓ no licensed match safely falls back to voice-only');
console.log('✓ SFX remain sparse and format-aware');
