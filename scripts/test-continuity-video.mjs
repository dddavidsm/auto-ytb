import assert from 'node:assert/strict';
import { withContinuityBridgeVideo } from '../packages/runtime-node/continuity-video.mjs';

const calls=[];
const image={name:'image',async generate(input){calls.push({kind:'image',input});return{id:'bridge-1',uri:'file:///bridge.png',mimeType:'image/png',provider:'mock-image',model:'gen4_image',costUsd:0.08};}};
const video={name:'video',async generate(input){calls.push({kind:'video',input});return{id:'video-1',uri:'file:///video.mp4',mimeType:'video/mp4',provider:'mock-video',model:'gen4.5',costUsd:0.60};}};
const context={required:true,channelKey:'owl',characterName:'Old Owl',continuityKey:'owl-v1',styleTags:['storybook'],styleGuidance:'Soft painted shapes.',referenceUris:['file:///owl.png','file:///style.png']};
const bridged=withContinuityBridgeVideo(video,image,context);
const result=await bridged.generate({prompt:'Old Owl opens the moon door.',durationSeconds:5,aspectRatio:'16:9'});
assert.equal(calls.length,2);
assert.equal(calls[0].kind,'image');
assert.deepEqual(calls[0].input.referenceUris,['file:///owl.png','file:///style.png']);
assert.equal(calls[1].kind,'video');
assert.deepEqual(calls[1].input.referenceUris,['file:///bridge.png']);
assert.equal(result.brandContinuity.bridgeUsed,true);
assert.equal(result.brandContinuity.referenceCount,2);
assert.equal(result.metadata.continuityBridge.bridgeUri,'file:///bridge.png');

calls.length=0;
const direct=withContinuityBridgeVideo(video,image,{...context,referenceUris:['file:///owl.png']});
await direct.generate({prompt:'Old Owl waves.',durationSeconds:4,aspectRatio:'16:9',referenceUris:['file:///owl.png']});
assert.equal(calls.length,1);
assert.equal(calls[0].kind,'video');
console.log('✓ multiple canonical references are fused into a continuity keyframe before video animation');
console.log('✓ single-reference video generation stays direct and avoids unnecessary image cost');
