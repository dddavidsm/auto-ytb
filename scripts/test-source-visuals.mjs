import assert from 'node:assert/strict';
import { classifyVisualSource, planScenes } from '../packages/production/dist/index.js';
import { runQa } from '../packages/qa/dist/index.js';

const official={id:'s1',title:'Official AI safety report',url:'https://example.gov/report',snippet:'The report documents a deployment-policy change.',sourceType:'official',authority:95,freshness:90,primaryEvidence:true,qualityScore:96};
const media={id:'s2',title:'Public media asset',url:'https://upload.wikimedia.org/example.png',snippet:'image',sourceType:'reference',authority:80,freshness:70,primaryEvidence:false,qualityScore:82};
const community={id:'s3',title:'Community post',url:'https://reddit.com/r/test/1',snippet:'post',sourceType:'community',authority:45,freshness:95,primaryEvidence:false,qualityScore:55};
assert.equal(classifyVisualSource(official).policy,'SOURCE_CARD');
assert.equal(classifyVisualSource(media).policy,'DIRECT_ASSET_ALLOWED');
assert.equal(classifyVisualSource(community).policy,'PROCEDURAL_ONLY');

const script={title:'Why the Deployment Rule Suddenly Changed',language:'en',targetDurationSec:80,thesis:'A documented deployment-policy shift changed the incentives because the old risk assumption stopped holding.',beats:[
  {id:'b1',startSec:0,targetDurationSec:10,purpose:'hook',narration:'The deployment rule looked stable until one documented risk made the old policy impossible to defend. The reason matters more than the rule itself.',visualIntent:'Immediate before-and-after policy contrast with the hidden risk highlighted',sourceIds:['s1'],retentionDevice:'open_loop'},
  {id:'b2',startSec:10,targetDurationSec:20,purpose:'evidence',narration:'The official report documents the exact policy change and the evidence behind it. The old assumption no longer matched the observed deployment risk.',visualIntent:'Show the official finding, summarize the evidence and explain why it matters',sourceIds:['s1'],retentionDevice:'question'},
  {id:'b3',startSec:30,targetDurationSec:20,purpose:'escalation',narration:'Once that mismatch became visible, keeping the old rule created a larger operational risk than changing it.',visualIntent:'Escalating decision diagram comparing the cost of keeping versus changing the rule',sourceIds:['s1'],retentionDevice:'contrast'},
  {id:'b4',startSec:50,targetDurationSec:15,purpose:'reveal',narration:'The surprising part is that the new policy was not driven by a new capability. It was driven by a changed understanding of the existing risk.',visualIntent:'Reveal the risk assumption underneath the policy decision',sourceIds:['s1'],retentionDevice:'reveal'},
  {id:'b5',startSec:65,targetDurationSec:15,purpose:'payoff',narration:'That is why the deployment rule changed: once the evidence changed the risk calculation, the old policy became the less defensible option.',visualIntent:'Resolve the opening policy contrast with the evidence-to-decision chain',sourceIds:['s1'],retentionDevice:'reveal'}
],outro:'The visible rule was only the final consequence.'};
const scenes=planScenes(script,{targetSceneDurationSec:8,sources:[official,media,community]});
const sourceFootage={id:'footage-1',uri:'file:///owned/fencing.mp4',sourceUrl:'https://creator.example/fencing',sourceId:'s1',beatIds:['b1'],startSec:4,endSec:9,license:'owned-or-licensed',rightsStatus:'CLEARED',cropMode:'SMART_CENTER'};
const footageScenes=planScenes(script,{targetSceneDurationSec:8,sources:[official,media,community],sourceFootage:[sourceFootage]});
assert.equal(footageScenes[0].kind,'broll');
assert.match(footageScenes[0].selectionReason,/footage-1/);
const mixedScenes=planScenes(script,{targetSceneDurationSec:8,sources:[official,media,community],visualMixPolicy:'MIXED_MEDIA',sourceFootage:[
  {...sourceFootage,id:'footage-a',uri:'file:///owned/a.mp4'},
  {...sourceFootage,id:'footage-b',uri:'file:///owned/b.mp4'},
  {...sourceFootage,id:'footage-c',uri:'file:///owned/c.mp4'},
  {...sourceFootage,id:'footage-d',uri:'file:///owned/d.mp4'},
]});
const mixedBroll=mixedScenes.filter((scene)=>scene.kind==='broll');
assert.ok(mixedBroll.length>0,'mixed-media planning should retain cleared source footage');
assert.ok(mixedScenes.some((scene)=>scene.kind!=='broll'),'mixed-media planning should interleave a different visual treatment');
for(let i=1;i<mixedScenes.length;i+=1)assert.ok(!(mixedScenes[i-1].kind==='broll'&&mixedScenes[i].kind==='broll'),'source footage should not be adjacent under the mixed-media cadence');
const sourceScene=scenes.find((scene)=>scene.kind==='source_card');
assert.ok(sourceScene,'non-quantitative evidence should produce a source card');
assert.equal(sourceScene.sourceRefs?.[0]?.sourceId,'s1');
assert.match(sourceScene.instruction,/Source:/);

const dossier={topic:'deployment policy',generatedAt:'x',executiveSummary:'The official report documents a policy shift driven by changed risk evidence.',sources:[official,media,community],claims:[{id:'c1',text:'The deployment policy changed.',importance:'critical',sourceIds:['s1'],confidence:90,disputed:false}],contradictions:[],timeline:[],angles:[],recommendedAngleId:null,researchConfidence:90,blockingIssues:[]};
const packaging=[{id:'p',title:'Why the Deployment Rule Suddenly Changed',thumbnailConcept:'A policy switch flipping after a risk report appears',thumbnailText:'THE RULE CHANGED',promise:'Why the deployment rule changed after new risk evidence',curiosity:92,clarity:94,credibility:94,differentiation:88,score:92}];
const thumbnails=[{id:'t',uri:'mock://thumb',mimeType:'image/jpeg',provider:'mock',packagingId:'p',bytes:100000}];
const assets=scenes.map((scene)=>({id:`a-${scene.id}`,uri:scene.kind==='source_card'?'procedural://source_card/x':`mock://${scene.id}`,mimeType:scene.kind==='source_card'?'application/x-auto-ytb-visual':'image/png',provider:scene.kind==='source_card'?'procedural-ffmpeg':'mock',sceneId:scene.id,generated:scene.generated,sourceIds:scene.sourceIds,sourceUrl:scene.sourceRefs?.[0]?.url,license:scene.kind==='source_card'?'original-transformed-card':undefined,metadata:{sourceRefs:scene.sourceRefs??[]}}));
const voice={id:'voice',uri:'mock://voice.mp3',mimeType:'audio/mpeg',provider:'mock-voice',durationSeconds:80,language:'en',voiceId:'narrator',alignment:{characters:['A','.'],characterStartTimesSeconds:[0,79.5],characterEndTimesSeconds:[0.2,80]}};
const manifest={projectId:'x',createdAt:'x',contentFormat:'LONG_HORIZONTAL',aspectRatio:'16:9',frame:{width:1920,height:1080},script,packaging,thumbnails,selectedPackagingId:'p',scenes,assets,voice,estimatedCostUsd:1,actualCostUsd:1,containsSyntheticMedia:scenes.some((scene)=>scene.generated)};
const qa=runQa({dossier,script,manifest,maxCostUsd:20});
assert.equal(qa.passed,true,JSON.stringify(qa,null,2));
assert.ok(qa.checks.some((check)=>check.id==='source-rights'&&check.status==='PASS'));

const directManifest={...manifest,assets:manifest.assets.map((asset)=>asset.sceneId===sourceScene.id?{...asset,provider:'source-backed-direct',uri:'https://upload.wikimedia.org/example.png',mimeType:'image/jpeg',license:'verify-before-public'}:asset)};
const directQa=runQa({dossier,script,manifest:directManifest,maxCostUsd:20});
assert.equal(directQa.passed,true);
assert.ok(directQa.checks.some((check)=>check.id==='source-rights'&&check.status==='WARN'));

const brokenScenes=scenes.map((scene)=>scene.id===sourceScene.id?{...scene,sourceRefs:undefined}:scene);
const brokenQa=runQa({dossier,script,manifest:{...manifest,scenes:brokenScenes},maxCostUsd:20});
assert.equal(brokenQa.passed,false);
assert.ok(brokenQa.blockers.includes('source-rights'));
console.log('✓ conservative source visual classification');
console.log('✓ attention-ready source-card provenance and visible attribution');
console.log('✓ unresolved direct licenses warn without blocking private review');
console.log('✓ missing source provenance blocks QA');
console.log('✓ mixed-media cadence interleaves cleared source footage with other visual treatments');
