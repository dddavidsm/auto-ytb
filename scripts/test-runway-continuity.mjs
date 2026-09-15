import assert from 'node:assert/strict';
import { buildRunwayContinuityPayload, estimateRunwayContinuityCost } from '../packages/providers/dist/index.js';

const wan=buildRunwayContinuityPayload({mode:'WAN3_FIRST_LAST',prompt:'Preserve the same bipedal red panda and lantern while walking naturally.',durationSeconds:5,firstFrameUri:'runway://first',lastFrameUri:'runway://last',resolution:'480p'});
assert.equal(wan.path,'/v1/image_to_video');
assert.equal(wan.model,'wan3');
assert.deepEqual(wan.body.promptImage,[{uri:'runway://first',position:'first'},{uri:'runway://last',position:'last'}]);
assert.equal(wan.body.ratio,'auto_480p');
assert.equal(estimateRunwayContinuityCost({mode:'WAN3_FIRST_LAST',prompt:'x',durationSeconds:5,firstFrameUri:'runway://first',lastFrameUri:'runway://last',resolution:'480p'}).credits,25);

const extend=buildRunwayContinuityPayload({mode:'SEEDANCE25_EXTEND',prompt:'Continue the same physical state with no reset.',durationSeconds:4,promptVideoUri:'runway://clip',inputVideoDurationSeconds:8,resolution:'480p'});
assert.equal(extend.path,'/v1/video_to_video');
assert.equal(extend.model,'seedance2_5');
assert.equal(extend.body.mode,'extend');
assert.equal(extend.body.ratio,undefined,'extend must omit ratio');
assert.equal(estimateRunwayContinuityCost({mode:'SEEDANCE25_EXTEND',prompt:'x',durationSeconds:4,promptVideoUri:'runway://clip',inputVideoDurationSeconds:8,resolution:'480p'}).credits,160);

const act=buildRunwayContinuityPayload({mode:'ACT_TWO_PERFORMANCE',prompt:'Apply the performance to Moss.',durationSeconds:5,characterUri:'runway://moss.png',performanceVideoUri:'runway://performance.mp4',aspectRatio:'16:9'});
assert.equal(act.path,'/v1/character_performance');
assert.deepEqual(act.body.character,{type:'image',uri:'runway://moss.png'});
assert.deepEqual(act.body.reference,{type:'video',uri:'runway://performance.mp4'});
assert.equal(act.body.bodyControl,true);
assert.equal(estimateRunwayContinuityCost({mode:'ACT_TWO_PERFORMANCE',prompt:'x',durationSeconds:5,characterUri:'runway://moss.png',performanceVideoUri:'runway://performance.mp4'}).credits,25);

const actVideo=buildRunwayContinuityPayload({mode:'ACT_TWO_PERFORMANCE',prompt:'Apply the performance to the Moss video reference.',durationSeconds:5,characterUri:'runway://moss.mp4',characterType:'video',performanceVideoUri:'runway://performance.mp4'});
assert.deepEqual(actVideo.body.character,{type:'video',uri:'runway://moss.mp4'});

assert.throws(()=>buildRunwayContinuityPayload({mode:'WAN3_FIRST_LAST',prompt:'x',durationSeconds:5,firstFrameUri:'runway://first'}),/lastFrameUri/);
assert.throws(()=>buildRunwayContinuityPayload({mode:'SEEDANCE25_EXTEND',prompt:'x',durationSeconds:4}),/promptVideoUri/);
console.log('✓ Runway continuity payloads, pricing preflight and fail-closed inputs');
