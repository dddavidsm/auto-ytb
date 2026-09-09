import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inferContentArchetype } from '../packages/os/dist/index.js';
import { planScenes } from '../packages/production/dist/index.js';

const factualAi=inferContentArchetype({
  topic:'This AI Agent Built A whole Browser In 7 Days',
  contentFormat:'SHORT_VERTICAL',
  channelNiche:'future-tech-business-en future technology AI business internet platforms',
});
assert.equal(factualAi.archetype,'EXPLAINER_DOCUMENTARY');
assert.equal(factualAi.profile.researchRequired,true);
assert.equal(factualAi.profile.factClaimMode,'VERIFY_CLAIMS');

const repetitiveScript={title:'Visual rhythm regression',language:'en',targetDurationSec:24,thesis:'A short setup should not become an endless identical card sequence.',outro:'',beats:[
  {id:'b1',startSec:0,targetDurationSec:24,purpose:'setup',narration:'A simple assumption changes and the consequences become visible.',visualIntent:'A clean editorial sequence showing the assumption changing step by step',sourceIds:[],retentionDevice:'open_loop'},
]};
const scenes=planScenes(repetitiveScript,{targetSceneDurationSec:2.5,visualMode:'EVIDENCE_FIRST',generativeSpendBias:0.55,realityMode:'FACTUAL',cameraProfile:'POLISHED_DOCUMENTARY'});
let longest=0,current=0,last=null;
for(const scene of scenes){if(scene.kind===last)current+=1;else{last=scene.kind;current=1;}longest=Math.max(longest,current);}
assert.ok(longest<=3,`scene planner emitted ${longest} identical visual kinds in a row`);

const live=await readFile('scripts/live-pipeline.mjs','utf8');
assert.match(live,/AUTO_YTB_CHANNEL_NICHE/);
assert.match(live,/AUTO_YTB_CONTENT_TOPIC/);
assert.match(live,/activeVoiceProvider/);

const orchestrator=await readFile('packages/orchestrator/src/index.ts','utf8');
assert.match(orchestrator,/LOCKED PACKAGING CONTRACT/);
assert.match(orchestrator,/fitScenePlanToBudget/);
assert.match(orchestrator,/Pre-media hard-budget preflight PASS/);
assert.match(orchestrator,/Hard cost guard tripped before render/);

const finalizer=await readFile('scripts/finalize-production.mjs','utf8');
assert.match(finalizer,/DRIVE_CLIENT_ID/);
assert.match(finalizer,/DRIVE_CLIENT_SECRET/);
assert.match(finalizer,/DRIVE_REFRESH_TOKEN/);
assert.doesNotMatch(finalizer,/refreshToken:req\('YOUTUBE_REFRESH_TOKEN'\)/);
assert.match(finalizer,/rootFolderId:req\('DRIVE_ROOT_FOLDER_ID'\)/);

const pilot=await readFile('scripts/pilot-first-run.mjs','utf8');
assert.match(pilot,/connections-doctor\.mjs','--strict','--production'/);
assert.match(pilot,/finalize-production\.mjs/);
assert.match(pilot,/PILOT_MIN_ATTENTION_SCORE\|\|'86'/);
assert.match(pilot,/A recent private YouTube upload is already READY_FOR_REVIEW/);

console.log('✓ factual tech pilot routes to EXPLAINER_DOCUMENTARY with mandatory research');
console.log('✓ scene planner prevents long identical procedural visual runs');
console.log('✓ production hard cap, locked packaging repairs and production preflight are wired');
console.log('✓ Drive archive is pinned to the dedicated Drive OAuth identity');
console.log('✓ first pilot resumes completed private uploads instead of duplicating paid generation');
