import assert from 'node:assert/strict';
import { decideVisualContinuity } from '../packages/runtime-node/visual-continuity.mjs';

const canonical=decideVisualContinuity([
  {sceneId:'hook',overallScore:92,characterVisible:true,characterIdentityScore:94,styleScore:91,paletteScore:90,compositionScore:88,confidence:92,issues:[]},
  {sceneId:'forest',overallScore:88,characterVisible:false,characterIdentityScore:10,styleScore:89,paletteScore:86,compositionScore:91,confidence:86,issues:[]},
]);
assert.equal(canonical.passed,true);
assert.ok(canonical.score>=88);
assert.equal(canonical.metrics.characterScenes,1);

const styleDrift=decideVisualContinuity([{sceneId:'bad-style',overallScore:58,characterVisible:false,characterIdentityScore:100,styleScore:48,paletteScore:45,compositionScore:70,confidence:94,issues:[]}]);
assert.equal(styleDrift.passed,false);
assert.equal(styleDrift.status,'blocked');

const identityDrift=decideVisualContinuity([{sceneId:'owl-closeup',overallScore:70,characterVisible:true,characterIdentityScore:54,styleScore:84,paletteScore:83,compositionScore:80,confidence:95,issues:[]}]);
assert.equal(identityDrift.passed,false);
assert.ok(identityDrift.blocking.some((message)=>message.includes('character identity drift')));

const absentCharacter=decideVisualContinuity([{sceneId:'establishing',overallScore:86,characterVisible:false,characterIdentityScore:0,styleScore:88,paletteScore:85,compositionScore:90,confidence:90,issues:[]}]);
assert.equal(absentCharacter.passed,true);
console.log('✓ canonical visual variation passes without requiring identical scene composition');
console.log('✓ severe style or visible-character identity drift blocks series release');
console.log('✓ absent characters are not falsely penalized by identity scoring');
