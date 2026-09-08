import assert from 'node:assert/strict';
import { assertBrandContinuityReady, auditBrandContinuityAssets, bindMediaProviderToBrand, parseBrandContinuityContext } from '../packages/runtime-node/brand-continuity.mjs';

const calls=[];
const provider={name:'fixture-media',async generate(input){calls.push(input);return{id:'x',uri:'mock://x',mimeType:'image/png',provider:'fixture-media'};}};
const context={required:true,channelKey:'old-owl-stories-en',characterMode:'persistent',characterName:'Old Owl',continuityKey:'owl-v1',referenceUris:['file:///brand/old-owl-master.png'],styleTags:['cozy','storybook'],styleGuidance:'Warm illustrated night-time environments.'};
const bound=bindMediaProviderToBrand(provider,context);
const result=await bound.generate({prompt:'Old Owl opens a mysterious letter.',aspectRatio:'9:16'});
assert.equal(calls.length,1);
assert.deepEqual(calls[0].referenceUris,['file:///brand/old-owl-master.png']);
assert.match(calls[0].prompt,/Persistent character: Old Owl/);
assert.match(calls[0].prompt,/Do not redesign or reinterpret/);
assert.match(calls[0].prompt,/mysterious letter/);
assert.equal(result.brandContinuity.characterName,'Old Owl');
assert.equal(result.brandContinuity.referenceCount,1);
assert.throws(()=>assertBrandContinuityReady({...context,referenceUris:[]}),/requires a canonical visual reference/);
assert.equal(parseBrandContinuityContext(JSON.stringify(context)).continuityKey,'owl-v1');

const audit=auditBrandContinuityAssets([{...result,generated:true},{id:'second',generated:true,brandContinuity:{...result.brandContinuity}}],context);
assert.equal(audit.passed,true);assert.equal(audit.score,100);assert.equal(audit.compliant,2);
const missingProof=auditBrandContinuityAssets([{id:'drifted',generated:true}],context);
assert.equal(missingProof.passed,false);assert.ok(missingProof.issues.some((issue)=>issue.includes('missing continuity proof')));
const wrongKey=auditBrandContinuityAssets([{id:'wrong-key',generated:true,brandContinuity:{...result.brandContinuity,continuityKey:'owl-v2'}}],context);
assert.equal(wrongKey.passed,false);assert.ok(wrongKey.issues.some((issue)=>issue.includes('continuity key mismatch')));
const noAssets=auditBrandContinuityAssets([],context);assert.equal(noAssets.passed,false);

const neutralCalls=[];
const neutralProvider={name:'neutral',async generate(input){neutralCalls.push(input);return{id:'n',uri:'mock://n',mimeType:'image/png',provider:'neutral'};}};
const untouched=bindMediaProviderToBrand(neutralProvider,null);
await untouched.generate({prompt:'A chart',aspectRatio:'16:9'});
assert.equal(neutralCalls[0].referenceUris,undefined);
assert.equal(auditBrandContinuityAssets([{id:'n',generated:true}],null).passed,true);
console.log('✓ persistent character generations inherit canonical reference');
console.log('✓ missing required brand reference fails closed');
console.log('✓ continuity audit detects missing proof and identity-key drift');
console.log('✓ non-character channels remain unbound when no brand context is provided');
