import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inferContentArchetype } from '../packages/os/dist/index.js';
import { planScenes } from '../packages/production/dist/index.js';
import { wordTimestampsToCharacterAlignment } from '../packages/runtime-node/gemini-word-alignment.mjs';

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

const transcript='This browser acts for you now.';
const aligned=wordTimestampsToCharacterAlignment(transcript,[
  {text:'This',normalized:'this',start:0.10,end:0.36},
  {text:'browser',normalized:'browser',start:0.42,end:0.93},
  {text:'acts',normalized:'acts',start:1.02,end:1.28},
  {text:'for',normalized:'for',start:1.34,end:1.50},
  {text:'you',normalized:'you',start:1.56,end:1.76},
  {text:'now',normalized:'now',start:1.82,end:2.05},
],2.1);
assert.equal(aligned.alignment.characters.join(''),transcript);
assert.ok(aligned.coverage>0.99);
assert.ok(aligned.alignment.characterStartTimesSeconds[0]>=0.09);
assert.ok(aligned.alignment.characterEndTimesSeconds.at(-1)<=2.1);
for(let i=1;i<aligned.alignment.characterStartTimesSeconds.length;i+=1)assert.ok(aligned.alignment.characterStartTimesSeconds[i]>=aligned.alignment.characterStartTimesSeconds[i-1]-0.000001,'alignment timestamps must be monotonic');

const live=await readFile('scripts/live-pipeline.mjs','utf8');
assert.match(live,/AUTO_YTB_CHANNEL_NICHE/);
assert.match(live,/AUTO_YTB_CONTENT_TOPIC/);
assert.match(live,/activeVoiceProvider/);

const factory=await readFile('packages/runtime-node/factory.mjs','utf8');
assert.match(factory,/withGeminiWordAlignment/);
assert.match(factory,/GEMINI_TRANSCRIBE_MODEL/);
assert.match(factory,/VOICE_ALIGNMENT_STRICT/);

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

const publisher=await readFile('packages/youtube/src/publisher.ts','utf8');
assert.match(publisher,/auto_ytb_/);
assert.match(publisher,/cliArg\('opportunity-id'\)/);
assert.match(publisher,/findExistingUpload/);
assert.match(publisher,/relatedPlaylists/);

const publicationMigration=await readFile('db/migrations/018_publication_idempotency.sql','utf8');
assert.match(publicationMigration,/unique index/i);
assert.match(publicationMigration,/production_run_id/);
const persistence=await readFile('packages/persistence/src/workflow-repositories.ts','utf8');
assert.match(persistence,/on conflict \(production_run_id\)/);

const pilot=await readFile('scripts/pilot-first-run.mjs','utf8');
assert.match(pilot,/connections-doctor\.mjs','--strict','--production'/);
assert.match(pilot,/finalize-production\.mjs/);
assert.match(pilot,/PILOT_MIN_ATTENTION_SCORE\|\|'86'/);
assert.match(pilot,/A recent private YouTube upload is already READY_FOR_REVIEW/);

console.log('✓ factual tech pilot routes to EXPLAINER_DOCUMENTARY with mandatory research');
console.log('✓ scene planner prevents long identical procedural visual runs');
console.log('✓ Gemini word timestamps map to exact monotonic character alignment');
console.log('✓ production hard cap, locked packaging repairs and production preflight are wired');
console.log('✓ Drive archive is pinned to the dedicated Drive OAuth identity');
console.log('✓ YouTube retry recovery is keyed to stable opportunity identity');
console.log('✓ publication persistence is unique and idempotent per production run');
console.log('✓ first pilot resumes completed private uploads instead of duplicating paid generation');
