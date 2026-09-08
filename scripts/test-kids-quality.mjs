import assert from 'node:assert/strict';
import { reviewKidsFamilyQuality } from '@auto-ytb/qa/kids';

const audience={mode:'MADE_FOR_KIDS',targetAgeMin:3,targetAgeMax:6,vocabularyRules:['short concrete sentences'],safetyRules:['no unsafe imitation'],emotionalRules:['end with reassurance']};
const good={title:'Milo and the Quiet Bell',language:'en',targetDurationSec:90,thesis:'Milo learns that asking for help can make a confusing problem feel smaller.',outro:'Milo felt safe again. He thanked his friend and went home calm.',beats:[
  {id:'b1',startSec:0,targetDurationSec:15,purpose:'hook',narration:'Milo heard a tiny bell, but he could not see where it was.',visualIntent:'Milo listens',sourceIds:[]},
  {id:'b2',startSec:15,targetDurationSec:30,purpose:'setup',narration:'He asked Old Owl for help. Together they followed the soft sound through the garden.',visualIntent:'They walk',sourceIds:[]},
  {id:'b3',startSec:45,targetDurationSec:30,purpose:'reveal',narration:'The bell was under a leaf. A little breeze made it ring.',visualIntent:'Bell reveal',sourceIds:[]},
  {id:'b4',startSec:75,targetDurationSec:15,purpose:'payoff',narration:'Milo smiled. He learned that asking a friend for help can make a mystery easier.',visualIntent:'Warm ending',sourceIds:[]},
]};
const ok=reviewKidsFamilyQuality({script:good,audience,packaging:[]});
assert.equal(ok.required,true);
assert.equal(ok.passed,true);
assert.ok(ok.score>=85);
assert.equal(ok.metrics.hasClearPayoff,true);

const unsafe=structuredClone(good);unsafe.beats[1].narration='Try this yourself at home. Play with fire and matches to see what happens.';
const unsafeReview=reviewKidsFamilyQuality({script:unsafe,audience,packaging:[]});
assert.equal(unsafeReview.passed,false);
assert.ok(unsafeReview.issues.some((issue)=>issue.code==='unsafe-imitation'));

const promo=structuredClone(good);promo.outro='Ask your parents to buy now. Limited time. Get yours now.';
const promoReview=reviewKidsFamilyQuality({script:promo,audience,packaging:[]});
assert.equal(promoReview.passed,false);
assert.ok(promoReview.issues.some((issue)=>issue.code==='manipulative-promotion'));

const general=reviewKidsFamilyQuality({script:good,audience:{mode:'GENERAL'},packaging:[]});
assert.equal(general.required,false);
assert.equal(general.passed,true);
console.log('✓ age-banded kids storytelling passes with clear, reassuring narrative structure');
console.log('✓ unsafe imitation and manipulative promotion block child-directed episodes');
console.log('✓ general-audience content is not subjected to the kids-only gate');
