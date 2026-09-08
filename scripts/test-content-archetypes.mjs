import assert from 'node:assert/strict';
import { inferContentArchetype } from '../packages/os/dist/index.js';
import { bindImageProviderToContentArchetype, bindTextModelToContentArchetype } from '../packages/runtime-node/content-archetype.mjs';

const kids=inferContentArchetype({topic:'The Moon Door Mystery',contentFormat:'LONG_HORIZONTAL',seriesContext:{audienceMode:'MADE_FOR_KIDS',characterContinuityKeys:['owl-v1','luna-v1'],voiceCast:[{name:'Old Owl'},{name:'Luna'}]}});
assert.equal(kids.archetype,'KIDS_DIALOGUE_SERIES');
assert.equal(kids.profile.voiceMode,'MULTI_CHARACTER_DIALOGUE');
assert.equal(kids.profile.allowIntegratedNarrator,true);
assert.match(kids.profile.scriptGuidance.join(' '),/Do not default to an external narrator/i);

const dog=inferContentArchetype({topic:'Funny dog gets caught stealing socks from the laundry basket',contentFormat:'SHORT_VERTICAL'});
assert.equal(dog.archetype,'ANIMAL_REALISM');
assert.equal(dog.profile.cameraProfile,'CONSUMER_MOBILE');
assert.equal(dog.profile.captureAesthetic.enabled,true);
assert.equal(dog.profile.captureAesthetic.preserveSyntheticDisclosure,true);
assert.equal(dog.profile.syntheticDisclosurePolicy,'REQUIRED_IF_REALISTIC_SYNTHETIC');

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

console.log('✓ kids series route to dialogue-first character storytelling rather than default narration');
console.log('✓ realistic animal videos use behavior-first mobile naturalism while preserving synthetic disclosure');
console.log('✓ animal rankings, explainers, myths and verified real stories receive different factual/editorial grammars');
console.log('✓ archetype rules are injected into text and media generation at runtime');
