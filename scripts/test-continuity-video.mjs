import assert from 'node:assert/strict';
import { withContinuityBridgeVideo } from '../packages/runtime-node/continuity-video.mjs';

const calls=[];
const closeTo=(actual,expected,epsilon=1e-9)=>assert.ok(Math.abs(Number(actual)-Number(expected))<=epsilon,`expected ${actual} to be within ${epsilon} of ${expected}`);
const image={name:'image',async generate(input){calls.push({kind:'image',input});return{id:'bridge-1',uri:'file:///bridge.png',mimeType:'image/png',provider:'mock-image',model:'gen4_image',costUsd:0.08};}};
const video={name:'video',async generate(input){calls.push({kind:'video',input});return{id:'video-1',uri:'file:///video.mp4',mimeType:'video/mp4',provider:'mock-video',model:'gen4.5',costUsd:0.60};}};
const context={
  required:true,channelKey:'owl',characterName:null,continuityKey:'series-v1',styleTags:['storybook'],styleGuidance:'Soft painted shapes.',
  referenceUris:['file:///owl.png','file:///luna.png','file:///style.png'],
  referenceCatalog:[
    {kind:'character',key:'old-owl',name:'Old Owl',role:'narrator',continuityKey:'owl-v1',uri:'file:///owl.png'},
    {kind:'character',key:'luna',name:'Luna',role:'companion',continuityKey:'luna-v1',uri:'file:///luna.png'},
    {kind:'style',key:'moonlit-style',name:'Moonlit Storybook',continuityKey:'style-v1',uri:'file:///style.png'},
  ],
};
const bridged=withContinuityBridgeVideo(video,image,context);
const result=await bridged.generate({prompt:'Luna opens the moon door.',durationSeconds:5,aspectRatio:'16:9'});
assert.equal(calls.length,2);
assert.equal(calls[0].kind,'image');
assert.deepEqual(calls[0].input.referenceUris,['file:///luna.png','file:///style.png']);
assert.ok(!calls[0].input.referenceUris.includes('file:///owl.png'));
assert.equal(calls[1].kind,'video');
assert.deepEqual(calls[1].input.referenceUris,['file:///bridge.png']);
assert.equal(result.brandContinuity.bridgeUsed,true);
assert.equal(result.brandContinuity.referenceCount,2);
assert.deepEqual(result.brandContinuity.referenceKeys,['luna','moonlit-style']);
assert.deepEqual(result.metadata.brandContinuity.characterNames,['Luna']);
assert.equal(result.metadata.continuityBridge.bridgeUri,'file:///bridge.png');
closeTo(result.costUsd,0.68);
closeTo(result.metadata.continuityBridge.bridgeCostUsd,0.08);
closeTo(result.metadata.continuityBridge.videoCostUsd,0.60);

calls.length=0;
const directContext={...context,referenceUris:['file:///owl.png'],referenceCatalog:[context.referenceCatalog[0]]};
const direct=withContinuityBridgeVideo(video,image,directContext);
const directResult=await direct.generate({prompt:'Old Owl waves.',durationSeconds:4,aspectRatio:'16:9'});
assert.equal(calls.length,1);
assert.equal(calls[0].kind,'video');
assert.deepEqual(calls[0].input.referenceUris,['file:///owl.png']);
assert.equal(directResult.brandContinuity.bridgeUsed,false);
closeTo(directResult.costUsd,0.60);
console.log('✓ scene-specific cast references are fused into a continuity keyframe before video animation');
console.log('✓ unrelated recurring characters are excluded from a scene reference budget');
console.log('✓ continuity bridge image cost is included in the pre-render production budget');
console.log('✓ single-reference video generation stays direct and avoids unnecessary image cost');
