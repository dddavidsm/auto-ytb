import assert from 'node:assert/strict';
import { planScenes, estimateProductionCost } from '../packages/production/dist/index.js';
import { runQa, reviewAttentionBlueprint } from '../packages/qa/dist/index.js';

const script={
  title:'Why the 42% Growth Changed the Race',language:'en',targetDurationSec:80,thesis:'A 42 percent growth jump changed the competitive race because it exposed a hidden shift in demand.',outro:'The number mattered because it changed the race.',
  beats:[
    {id:'hook',startSec:0,targetDurationSec:10,purpose:'hook',narration:'One number changed this race: growth jumped 42 percent, and the reason behind it is more important than the headline.',visualIntent:'Immediate race transformation with the 42 percent growth signal as the focal proof',sourceIds:['s1'],retentionDevice:'open_loop'},
    {id:'setup',startSec:10,targetDurationSec:14,purpose:'setup',narration:'Before that jump, the market looked stable and the old strategy still seemed rational. Then demand moved faster than the incumbents expected.',visualIntent:'Before-and-after market structure with a clear demand shift',sourceIds:['s1'],retentionDevice:'contrast'},
    {id:'evidence',startSec:24,targetDurationSec:20,purpose:'evidence',narration:'Revenue grew 42 percent from 10 million to 14.2 million in 2026. The change was large enough to make the old baseline misleading.',visualIntent:'Evidence chart comparing 10 million with 14.2 million and highlighting the 42 percent growth',sourceIds:['s1'],retentionDevice:'question'},
    {id:'escalation',startSec:44,targetDurationSec:16,purpose:'escalation',narration:'That growth did more than lift a chart. It raised the cost of waiting, forcing every competitor to choose between moving now and losing position.',visualIntent:'Competitive pressure escalating across three strategic choices',sourceIds:['s1'],retentionDevice:'open_loop'},
    {id:'reveal',startSec:60,targetDurationSec:10,purpose:'reveal',narration:'The real story was not the 42 percent itself. It was the hidden demand shift underneath it.',visualIntent:'Reveal the hidden demand layer underneath the headline number',sourceIds:['s1'],retentionDevice:'reveal'},
    {id:'payoff',startSec:70,targetDurationSec:10,purpose:'payoff',narration:'That is why the growth changed the race: once demand moved, staying still became the riskier strategy.',visualIntent:'Resolve the opening race image with the winning strategic implication',sourceIds:['s1'],retentionDevice:'reveal'}
  ]
};
const source={id:'s1',title:'Official growth report',url:'https://example.com/report',snippet:'Revenue grew from 10 million to 14.2 million.',sourceType:'official',qualityScore:95,authorityScore:95,recencyScore:95};
const scenes=planScenes(script,{targetSceneDurationSec:8,sources:[source]});
assert.ok(scenes.some((scene)=>scene.kind==='ai_video'||scene.kind==='ai_image'),'high-value scene should justify generative media');
assert.ok(scenes.some((scene)=>scene.kind==='chart'),'quantitative evidence should become a chart');
assert.ok(scenes.some((scene)=>scene.kind==='motion_graphic'||scene.kind==='source_card'),'supporting scenes should use low-cost explanatory media');
assert.ok(scenes.some((scene)=>scene.generated===false),'hybrid planner must create non-generative scenes');
const hybridCost=estimateProductionCost({narrationSeconds:80,scenes});
const allPremium=scenes.map((scene)=>({...scene,kind:'ai_video',generated:true}));
const premiumCost=estimateProductionCost({narrationSeconds:80,scenes:allPremium});
assert.ok(hybridCost<premiumCost*0.6,`hybrid cost ${hybridCost} should be materially below all-premium ${premiumCost}`);

const dossier={topic:'growth race',generatedAt:'x',executiveSummary:'A 42 percent growth jump changed competitive incentives.',sources:[source],claims:[{id:'c',text:'Revenue grew 42 percent.',importance:'critical',sourceIds:['s1'],confidence:90,disputed:false}],contradictions:[],timeline:[],angles:[],recommendedAngleId:null,researchConfidence:90,blockingIssues:[]};
const packaging={id:'p',title:'Why the 42% Growth Changed the Race',thumbnailConcept:'A competitive race split by a dramatic growth chart',thumbnailText:'42% CHANGED IT',promise:'Why the 42 percent growth changed the competitive race',curiosity:92,clarity:96,credibility:92,differentiation:90,score:92};
const attention=reviewAttentionBlueprint({script,packaging:[packaging],scenes,contentFormat:'LONG_HORIZONTAL',selectedPackagingId:'p'});
assert.equal(attention.ready,true,JSON.stringify(attention,null,2));
const assets=scenes.map((scene)=>scene.generated
  ? {id:`asset-${scene.id}`,uri:`mock://${scene.id}`,mimeType:scene.kind==='ai_video'?'video/mp4':'image/png',provider:'mock-ai',sceneId:scene.id,generated:true,sourceIds:scene.sourceIds,costUsd:0}
  : {id:`procedural-${scene.id}`,uri:`procedural://${scene.kind}/${scene.id}`,mimeType:'application/x-auto-ytb-visual',provider:'procedural-ffmpeg',sceneId:scene.id,generated:false,sourceIds:scene.sourceIds,costUsd:0.002,license:'original-transformed-card'});
const voice={id:'voice',uri:'mock://voice.mp3',mimeType:'audio/mpeg',provider:'mock-voice',durationSeconds:80,language:'en',voiceId:'narrator',alignment:{characters:['A','.'],characterStartTimesSeconds:[0,79.5],characterEndTimesSeconds:[0.2,80]}};
const manifest={projectId:'x',createdAt:'x',contentFormat:'LONG_HORIZONTAL',aspectRatio:'16:9',frame:{width:1920,height:1080},script,packaging:[packaging],thumbnails:[{id:'thumb',uri:'mock://thumb.jpg',mimeType:'image/jpeg',provider:'mock',packagingId:'p',text:'42% CHANGED IT',bytes:250000,costUsd:0}],selectedPackagingId:'p',scenes,assets,voice,estimatedCostUsd:hybridCost,actualCostUsd:hybridCost,containsSyntheticMedia:true};
const qa=runQa({dossier,script,manifest,maxCostUsd:20});
assert.equal(qa.passed,true,JSON.stringify(qa,null,2));
assert.ok(qa.checks.some((check)=>check.id==='hybrid-visual-balance'));
assert.equal(qa.containsSyntheticMedia,true);

const proceduralOnlyScenes=scenes.map((scene)=>({...scene,kind:'motion_graphic',generated:false}));
const proceduralOnlyAssets=proceduralOnlyScenes.map((scene)=>({id:`p-${scene.id}`,uri:`procedural://motion_graphic/${scene.id}`,mimeType:'application/x-auto-ytb-visual',provider:'procedural-ffmpeg',sceneId:scene.id,generated:false,sourceIds:scene.sourceIds,costUsd:0.002}));
const proceduralQa=runQa({dossier,script,manifest:{...manifest,scenes:proceduralOnlyScenes,assets:proceduralOnlyAssets,containsSyntheticMedia:false},maxCostUsd:20});
assert.equal(proceduralQa.containsSyntheticMedia,false,'AI thumbnail alone must not mark video contents as synthetic');
console.log('✓ hybrid visual routing');
console.log('✓ hybrid visual cost discipline');
console.log('✓ attention-ready procedural coverage + synthetic disclosure precision');
