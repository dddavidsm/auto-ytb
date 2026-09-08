import assert from 'node:assert/strict';
import { auditFinalManifestReleaseSafety } from './lib/release-safety.mjs';

const neutral={identity:{characterMode:'none'}};
const voiceOnly=auditFinalManifestReleaseSafety({assets:[]},neutral);
assert.equal(voiceOnly.passed,true);assert.equal(voiceOnly.audio.cueCount,0);assert.ok(voiceOnly.warnings.some((item)=>item.includes('voice-only')));

const missingNatural=auditFinalManifestReleaseSafety({executionPlan:{audioMode:'NATURAL_SOUND'},assets:[]},neutral);
assert.equal(missingNatural.passed,false);assert.equal(missingNatural.audio.naturalSoundRequired,true);assert.ok(missingNatural.issues.some((item)=>item.includes('natural-sound-required')));
const naturalReady=auditFinalManifestReleaseSafety({executionPlan:{audioMode:'NATURAL_SOUND'},sfx:[{assetId:'ambience-1',kind:'sfx',uri:'file:///park.wav',license:'owned-library',rightsStatus:'CLEARED'}],assets:[]},neutral);
assert.equal(naturalReady.passed,true);assert.equal(naturalReady.audioReady,true);assert.equal(naturalReady.audio.cueCount,1);

const cleared=auditFinalManifestReleaseSafety({soundtrack:{rightsReady:true,music:{assetId:'music-1',kind:'music',uri:'file:///music.wav',license:'subscription-2026',rightsStatus:'CLEARED'},sfx:[]}},neutral);
assert.equal(cleared.passed,true);assert.equal(cleared.audioReady,true);
const verify=auditFinalManifestReleaseSafety({music:{assetId:'music-2',kind:'music',uri:'file:///music.wav',license:'pending',rightsStatus:'VERIFY'}},neutral);
assert.equal(verify.passed,false);assert.ok(verify.issues.some((item)=>item.includes('not CLEARED')));
const missingLicense=auditFinalManifestReleaseSafety({music:{assetId:'music-3',kind:'music',uri:'file:///music.wav',rightsStatus:'CLEARED'}},neutral);
assert.equal(missingLicense.passed,false);assert.ok(missingLicense.issues.some((item)=>item.includes('no license')));

const owl={identity:{characterMode:'persistent-character',characterName:'Old Owl'}};
const proof={required:true,channelKey:'owl',continuityKey:'owl-v1',characterName:'Old Owl',referenceCount:1};
const consistent=auditFinalManifestReleaseSafety({assets:[{id:'a1',generated:true,brandContinuity:proof},{id:'a2',generated:true,brandContinuity:{...proof}}]},owl);
assert.equal(consistent.passed,true);assert.equal(consistent.brand.compliantAssetCount,2);assert.equal(consistent.brand.continuityKey,'owl-v1');
const missingProof=auditFinalManifestReleaseSafety({assets:[{id:'a1',generated:true}]},owl);
assert.equal(missingProof.passed,false);assert.ok(missingProof.issues.some((item)=>item.includes('missing brandContinuity proof')));
const drift=auditFinalManifestReleaseSafety({assets:[{id:'a1',generated:true,brandContinuity:proof},{id:'a2',generated:true,brandContinuity:{...proof,continuityKey:'owl-v2'}}]},owl);
assert.equal(drift.passed,false);assert.ok(drift.issues.some((item)=>item.includes('differs from owl-v1')));
const wrongCharacter=auditFinalManifestReleaseSafety({assets:[{id:'a1',generated:true,brandContinuity:{...proof,characterName:'New Owl'}}]},owl);
assert.equal(wrongCharacter.passed,false);assert.ok(wrongCharacter.issues.some((item)=>item.includes('differs from Old Owl')));
console.log('✓ voice-only manifests remain safely releasable');
console.log('✓ NATURAL_SOUND archetypes require cleared ambience/foley/reaction audio');
console.log('✓ non-CLEARED or unlicensed audio blocks public release');
console.log('✓ persistent-character manifests require consistent canonical continuity proof');
