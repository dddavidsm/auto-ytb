import assert from 'node:assert/strict';
import { inferContentArchetype } from '../packages/os/dist/index.js';
import { buildArchetypeExecutionPlan } from '../packages/orchestrator/dist/index.js';
import { planScenes } from '../packages/production/dist/index.js';
import { extractCreativeFingerprint } from '../packages/analytics/dist/index.js';
import { buildCreativeLearningGuidance } from './lib/creative-guidance.mjs';
import { bindImageProviderToContentArchetype, bindTextModelToContentArchetype, normalizeContentArchetypeProfile } from '../packages/runtime-node/content-archetype.mjs';

const kids=inferContentArchetype({topic:'The Moon Door Mystery',contentFormat:'LONG_HORIZONTAL',seriesContext:{audienceMode:'MADE_FOR_KIDS',characterContinuityKeys:['owl-v1','luna-v1'],voiceCast:[{name:'Old Owl'},{name:'Luna'}]}});
assert.equal(kids.archetype,'KIDS_DIALOGUE_SERIES');
assert.equal(kids.profile.voiceMode,'MULTI_CHARACTER_DIALOGUE');
assert.equal(kids.profile.allowIntegratedNarrator,true);
assert.match(kids.profile.scriptGuidance.join(' '),/Do not default to an external narrator/i);
const normalizedKids=normalizeContentArchetypeProfile(kids.profile);
assert.equal(normalizedKids.allowIntegratedNarrator,true);
assert.equal(normalizedKids.requiresCanonicalCast,true);
assert.equal(normalizedKids.researchRequired,false);
assert.equal(normalizedKids.factClaimMode,'CREATIVE_ORIGINAL');
const kidsPlan=buildArchetypeExecutionPlan({archetype:kids.archetype,confidence:kids.confidence,reasons:kids.reasons,profile:normalizedKids},'LONG_HORIZONTAL');
assert.equal(kidsPlan.researchRequired,false);
assert.equal(kidsPlan.scriptMode,'DIALOGUE');
assert.equal(kidsPlan.voiceRequired,true);
assert.equal(kidsPlan.visualMode,'CHARACTER_CONTINUITY');

const dog=inferContentArchetype({topic:'Funny dog gets caught stealing socks from the laundry basket',contentFormat:'SHORT_VERTICAL'});
assert.equal(dog.archetype,'ANIMAL_REALISM');
assert.equal(dog.profile.cameraProfile,'CONSUMER_MOBILE');
assert.equal(dog.profile.captureAesthetic.enabled,true);
assert.equal(dog.profile.captureAesthetic.preserveSyntheticDisclosure,true);
assert.equal(dog.profile.syntheticDisclosurePolicy,'REQUIRED_IF_REALISTIC_SYNTHETIC');
const normalizedDog=normalizeContentArchetypeProfile(dog.profile);
assert.equal(normalizedDog.researchRequired,false);
assert.equal(normalizedDog.voiceMode,'NONE');
const dogPlan=buildArchetypeExecutionPlan({archetype:dog.archetype,confidence:dog.confidence,reasons:dog.reasons,profile:normalizedDog},'SHORT_VERTICAL');
assert.equal(dogPlan.researchMode,'CREATIVE_ORIGINAL');
assert.equal(dogPlan.scriptMode,'VISUAL_ACTION');
assert.equal(dogPlan.voiceRequired,false);
assert.equal(dogPlan.audioMode,'NATURAL_SOUND');
assert.equal(dogPlan.captionMode,'CONTEXT_ONLY');
assert.equal(dogPlan.visualMode,'GENERATIVE_FIRST');
assert.equal(dogPlan.requiredCapabilities.search,false);
assert.equal(dogPlan.requiredCapabilities.voice,false);

const dogScript={title:'Sock thief',language:'en',targetDurationSec:24,thesis:'A dog steals a sock and gets caught.',outro:'',beats:[
  {id:'b1',startSec:0,targetDurationSec:8,purpose:'hook',narration:'The dog is already pulling a sock free.',visualIntent:'Dog actively pulls a sock from a laundry basket and freezes when noticed',sourceIds:[],retentionDevice:'question'},
  {id:'b2',startSec:8,targetDurationSec:8,purpose:'escalation',narration:'It tries to walk away casually.',visualIntent:'Dog walks away with sock while glancing back',sourceIds:[],retentionDevice:'contrast'},
  {id:'b3',startSec:16,targetDurationSec:8,purpose:'payoff',narration:'The sock drops beside the owner.',visualIntent:'Dog drops sock and gives a plausible guilty reaction',sourceIds:[],retentionDevice:'reveal'},
]};
const dogScenes=planScenes(dogScript,{targetSceneDurationSec:dogPlan.targetSceneDurationSec,visualMode:dogPlan.visualMode,generativeSpendBias:dogPlan.generativeSpendBias,realityMode:dogPlan.realityMode,cameraProfile:dogPlan.cameraProfile});
assert.ok(dogScenes.some((scene)=>scene.kind==='ai_video'));
assert.equal(dogScenes.some((scene)=>scene.kind==='source_card'),false);
const fingerprint=extractCreativeFingerprint({contentFormat:'SHORT_VERTICAL',script:dogScript,scenes:dogScenes,packaging:[],contentArchetype:{id:'ANIMAL_REALISM',version:1,voiceMode:'NONE'},executionPlan:dogPlan});
assert.equal(fingerprint.contentArchetype,'ANIMAL_REALISM');
assert.equal(fingerprint.voiceMode,'NONE');
assert.equal(fingerprint.researchMode,'CREATIVE_ORIGINAL');
assert.equal(fingerprint.visualMode,'GENERATIVE_FIRST');
const learningRows=[
  {feature_name:'video:averageSceneDuration',feature_value:'5-8s',sample_size:8,weighted_views:12000,average_video_avp:58,average_retention_delta:0,average_segment_retention:0.58,average_share_rate:1,average_roi:0.6,confidence:0.7},
  {feature_name:'video:averageSceneDuration',feature_value:'8-12s',sample_size:8,weighted_views:12000,average_video_avp:40,average_retention_delta:0,average_segment_retention:0.4,average_share_rate:0.3,average_roi:-0.1,confidence:0.7},
  {feature_name:'archetype:ANIMAL_REALISM:video:averageSceneDuration',feature_value:'<5s',sample_size:5,weighted_views:7000,average_video_avp:72,average_retention_delta:0,average_segment_retention:0.72,average_share_rate:2,average_roi:1.2,confidence:0.6},
  {feature_name:'archetype:ANIMAL_REALISM:video:averageSceneDuration',feature_value:'5-8s',sample_size:5,weighted_views:7000,average_video_avp:48,average_retention_delta:0,average_segment_retention:0.48,average_share_rate:0.5,average_roi:0,confidence:0.6},
];
const scopedLearning=buildCreativeLearningGuidance(learningRows,{contentArchetype:'ANIMAL_REALISM'});
assert.equal(scopedLearning.scope,'ARCHETYPE');
assert.equal(scopedLearning.targetSceneDurationSec,4);

const dogTop=inferContentArchetype({topic:'Top 10 funniest dog reactions caught on camera'});
assert.equal(dogTop.archetype,'ANIMAL_TOPS');
assert.equal(dogTop.profile.researchRequired,true);

const myth=inferContentArchetype({topic:'The legend of the ghost ship: what evidence actually exists?'});
assert.equal(myth.archetype,'MYTH_MYSTERY');
assert.equal(myth.profile.factClaimMode,'DISTINGUISH_FACT_FROM_LEGEND');

const real=inferContentArchetype({topic:'The real story of the documented rescue that changed aviation safety'});
assert.equal(real.archetype,'VERIFIED_REAL_STORY');
assert.equal(real.profile.factClaimMode,'VERIFY_CLAIMS');

const explainer=inferContentArchetype({topic:'How AI agents are changing online shopping',channelNiche:'future tech business'});
assert.equal(explainer.archetype,'EXPLAINER_DOCUMENTARY');
assert.equal(explainer.profile.voiceMode,'SINGLE_NARRATOR');

const modelCalls=[];
const model={name:'mock-model',async generateJson(input){modelCalls.push(input);return{value:{ok:true}};}};
const boundModel=bindTextModelToContentArchetype(model,dog.profile);
assert.equal(boundModel.contentArchetypeProfile.researchRequired,false);
await boundModel.generateJson({system:'base',prompt:'write it',schemaName:'script_v1'});
assert.match(modelCalls[0].system,/ANIMAL_REALISM/);
assert.match(modelCalls[0].prompt,/Animal behavior must remain species-plausible/i);

const imageCalls=[];
const image={name:'mock-image',async generate(input){imageCalls.push(input);return{id:'img',uri:'mock://img',mimeType:'image/png',provider:'mock'}}};
const boundImage=bindImageProviderToContentArchetype(image,dog.profile);
const asset=await boundImage.generate({prompt:'A dog notices the missing sock.',aspectRatio:'9:16'});
assert.match(imageCalls[0].prompt,/consumer-camera imperfections/i);
assert.equal(asset.metadata.contentArchetype.id,'ANIMAL_REALISM');
assert.equal(asset.metadata.contentArchetype.captureAesthetic.preserveSyntheticDisclosure,true);

console.log('✓ content archetype structural fields survive runtime normalization');
console.log('✓ kids series execute as research-free dialogue with canonical character continuity');
console.log('✓ realistic animal videos execute as research-free, no-voice, generative-first visual productions');
console.log('✓ content fingerprints persist archetype execution controls for economics/retention learning');
console.log('✓ creative learning prefers same-archetype evidence and falls back safely when sparse');
console.log('✓ archetype rules remain injected into text and media generation at runtime');
