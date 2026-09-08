import assert from 'node:assert/strict';
import { classifyVisualSource, planScenes } from '../packages/production/dist/index.js';
import { runQa } from '../packages/qa/dist/index.js';

const official={id:'s1',title:'Official AI safety report',url:'https://example.gov/report',snippet:'evidence',sourceType:'official',authority:95,freshness:90,primaryEvidence:true,qualityScore:96};
const media={id:'s2',title:'Public media asset',url:'https://upload.wikimedia.org/example.png',snippet:'image',sourceType:'reference',authority:80,freshness:70,primaryEvidence:false,qualityScore:82};
const community={id:'s3',title:'Community post',url:'https://reddit.com/r/test/1',snippet:'post',sourceType:'community',authority:45,freshness:95,primaryEvidence:false,qualityScore:55};
assert.equal(classifyVisualSource(official).policy,'SOURCE_CARD');
assert.equal(classifyVisualSource(media).policy,'DIRECT_ASSET_ALLOWED');
assert.equal(classifyVisualSource(community).policy,'PROCEDURAL_ONLY');

const script={title:'Evidence story',language:'en',targetDurationSec:30,thesis:'t',beats:[{id:'b1',startSec:0,targetDurationSec:15,purpose:'evidence',narration:'The official report documents a clear change in deployment policy.',visualIntent:'show the official finding and why it matters',sourceIds:['s1'],retentionDevice:'contrast'},{id:'b2',startSec:15,targetDurationSec:15,purpose:'payoff',narration:'That shift changes the incentives.',visualIntent:'future transformation',sourceIds:['s1'],retentionDevice:'reveal'}],outro:'x'};
const scenes=planScenes(script,{targetSceneDurationSec:10,sources:[official,media,community]});
const sourceScene=scenes.find((scene)=>scene.kind==='source_card');
assert.ok(sourceScene,'non-quantitative evidence should produce a source card');
assert.equal(sourceScene.sourceRefs?.[0]?.sourceId,'s1');
assert.match(sourceScene.instruction,/Source:/);

const dossier={topic:'x',generatedAt:'x',executiveSummary:'x',sources:[official,media,community],claims:[{id:'c1',text:'x',importance:'critical',sourceIds:['s1'],confidence:90,disputed:false}],contradictions:[],timeline:[],angles:[],recommendedAngleId:null,researchConfidence:90,blockingIssues:[]};
const packaging=[{id:'p',title:'Title',thumbnailConcept:'Concept',thumbnailText:'SHIFT',promise:'P',curiosity:90,clarity:90,credibility:90,differentiation:90,score:90}];
const thumbnails=[{id:'t',uri:'mock://thumb',mimeType:'image/jpeg',provider:'mock',packagingId:'p',bytes:100000}];
const assets=scenes.map((scene)=>({id:`a-${scene.id}`,uri:scene.kind==='source_card'?'procedural://source_card/x':'mock://visual',mimeType:scene.kind==='source_card'?'application/x-auto-ytb-visual':'image/png',provider:scene.kind==='source_card'?'procedural-ffmpeg':'mock',sceneId:scene.id,generated:scene.generated,sourceIds:scene.sourceIds,sourceUrl:scene.sourceRefs?.[0]?.url,license:scene.kind==='source_card'?'original-transformed-card':undefined,metadata:{sourceRefs:scene.sourceRefs??[]}}));
const manifest={projectId:'x',createdAt:'x',contentFormat:'LONG_HORIZONTAL',aspectRatio:'16:9',frame:{width:1920,height:1080},script,packaging,thumbnails,selectedPackagingId:'p',scenes,assets,estimatedCostUsd:1,actualCostUsd:1,containsSyntheticMedia:scenes.some((scene)=>scene.generated)};
const qa=runQa({dossier,script,manifest,maxCostUsd:20});
assert.equal(qa.passed,true);
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
console.log('✓ source-card provenance and visible attribution');
console.log('✓ unresolved direct licenses warn without blocking private review');
console.log('✓ missing source provenance blocks QA');
