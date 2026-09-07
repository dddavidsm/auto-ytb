import assert from 'node:assert/strict';
import { planScenes, estimateProductionCost } from '../packages/production/dist/index.js';
import { runQa } from '../packages/qa/dist/index.js';

const script={
  title:'Hybrid visual test',language:'en',targetDurationSec:80,thesis:'t',outro:'x',
  beats:[
    {id:'hook',startSec:0,targetDurationSec:20,purpose:'hook',narration:'A race is reshaping the future.',visualIntent:'future technology race transformation',sourceIds:['s1'],retentionDevice:'open_loop'},
    {id:'evidence',startSec:20,targetDurationSec:30,purpose:'evidence',narration:'Revenue grew 42 percent from 10 million to 14.2 million in 2026.',visualIntent:'show the growth data comparison',sourceIds:['s1']},
    {id:'payoff',startSec:50,targetDurationSec:30,purpose:'payoff',narration:'The important part is what the numbers imply.',visualIntent:'clear conceptual payoff',sourceIds:['s1'],onScreenText:'WHAT THE DATA MEANS'}
  ]
};
const scenes=planScenes(script,{targetSceneDurationSec:10});
assert.ok(scenes.some((scene)=>scene.kind==='ai_video' || scene.kind==='ai_image'),'high-value scene should justify generative media');
assert.ok(scenes.some((scene)=>scene.kind==='chart'),'quantitative evidence should become a chart');
assert.ok(scenes.some((scene)=>scene.kind==='motion_graphic'),'supporting scenes should use procedural graphics');
assert.ok(scenes.some((scene)=>scene.generated===false),'hybrid planner must create non-generative scenes');
const hybridCost=estimateProductionCost({narrationSeconds:80,scenes});
const allPremium=scenes.map((scene)=>({...scene,kind:'ai_video',generated:true}));
const premiumCost=estimateProductionCost({narrationSeconds:80,scenes:allPremium});
assert.ok(hybridCost < premiumCost*0.6,`hybrid cost ${hybridCost} should be materially below all-premium ${premiumCost}`);

const source={id:'s1',title:'Official',url:'https://example.com',snippet:'x',sourceType:'official',qualityScore:95,authorityScore:95,recencyScore:95};
const dossier={topic:'x',generatedAt:'x',executiveSummary:'x',sources:[source],claims:[{id:'c',text:'x',importance:'critical',sourceIds:['s1'],confidence:90,disputed:false}],contradictions:[],timeline:[],angles:[],recommendedAngleId:null,researchConfidence:90,blockingIssues:[]};
const packaging={id:'p',title:'Title',thumbnailConcept:'Concept',thumbnailText:'THE SHIFT',promise:'Promise',curiosity:90,clarity:90,credibility:90,differentiation:90,score:90};
const assets=scenes.map((scene)=>scene.generated
  ? {id:`asset-${scene.id}`,uri:`mock://${scene.id}`,mimeType:scene.kind==='ai_video'?'video/mp4':'image/png',provider:'mock-ai',sceneId:scene.id,generated:true,sourceIds:scene.sourceIds,costUsd:0}
  : {id:`procedural-${scene.id}`,uri:`procedural://${scene.kind}/${scene.id}`,mimeType:'application/x-auto-ytb-visual',provider:'procedural-ffmpeg',sceneId:scene.id,generated:false,sourceIds:scene.sourceIds,costUsd:0.002});
const manifest={projectId:'x',createdAt:'x',contentFormat:'LONG_HORIZONTAL',aspectRatio:'16:9',frame:{width:1920,height:1080},script,packaging:[packaging],thumbnails:[{id:'thumb',uri:'mock://thumb.jpg',mimeType:'image/jpeg',provider:'mock',packagingId:'p',bytes:250000,costUsd:0}],selectedPackagingId:'p',scenes,assets,estimatedCostUsd:hybridCost,actualCostUsd:hybridCost,containsSyntheticMedia:true};
const qa=runQa({dossier,script,manifest,maxCostUsd:20});
assert.equal(qa.passed,true);
assert.ok(qa.checks.some((check)=>check.id==='hybrid-visual-balance'));
assert.equal(qa.containsSyntheticMedia,true);

const proceduralOnlyScenes=scenes.map((scene)=>({...scene,kind:'motion_graphic',generated:false}));
const proceduralOnlyAssets=proceduralOnlyScenes.map((scene)=>({id:`p-${scene.id}`,uri:`procedural://motion_graphic/${scene.id}`,mimeType:'application/x-auto-ytb-visual',provider:'procedural-ffmpeg',sceneId:scene.id,generated:false,sourceIds:scene.sourceIds,costUsd:0.002}));
const proceduralQa=runQa({dossier,script,manifest:{...manifest,scenes:proceduralOnlyScenes,assets:proceduralOnlyAssets,containsSyntheticMedia:false},maxCostUsd:20});
assert.equal(proceduralQa.containsSyntheticMedia,false,'AI thumbnail alone must not mark video contents as synthetic');
console.log('✓ hybrid visual routing');
console.log('✓ hybrid visual cost discipline');
console.log('✓ procedural coverage + synthetic disclosure precision');
