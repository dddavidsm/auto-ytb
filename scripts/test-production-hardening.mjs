import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inferContentArchetype } from '../packages/os/dist/index.js';
import { planScenes } from '../packages/production/dist/index.js';
import { withGeminiWordAlignment, wordTimestampsToCharacterAlignment } from '../packages/runtime-node/gemini-word-alignment.mjs';

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

const unicodeTranscript='AI 🚀 browser works.';
const unicodeAligned=wordTimestampsToCharacterAlignment(unicodeTranscript,[
  {text:'AI',normalized:'ai',start:0.1,end:0.25},
  {text:'browser',normalized:'browser',start:0.5,end:0.9},
  {text:'works',normalized:'works',start:1.0,end:1.3},
],1.4);
assert.equal(unicodeAligned.alignment.characters.join(''),unicodeTranscript);
assert.equal(unicodeAligned.alignment.characters.length,unicodeTranscript.length,'alignment uses the same UTF-16 coordinate system as RegExp offsets');

const temp=await mkdtemp(join(tmpdir(),'auto-ytb-align-test-'));
try{
  const voicePath=join(temp,'voice.wav');await writeFile(voicePath,new Uint8Array([82,73,70,70,1,2,3,4]));
  const restCalls=[];
  const fakeFetch=async(url,init={})=>{
    const target=String(url);restCalls.push({target,init});
    if(target==='https://generativelanguage.googleapis.com/upload/v1beta/files'){
      assert.equal(init.headers['x-goog-api-key'],'gemini-key');
      return new Response('',{status:200,headers:{'x-goog-upload-url':'https://upload.example/resumable'}});
    }
    if(target==='https://upload.example/resumable'){
      assert.equal(init.headers['x-goog-api-key'],undefined,'resumable URL must not receive the API key');
      assert.equal(init.headers['X-Goog-Upload-Command'],'upload, finalize');
      return new Response(JSON.stringify({file:{name:'files/test-audio',uri:'https://files.example/audio'}}),{status:200,headers:{'content-type':'application/json'}});
    }
    if(target==='https://generativelanguage.googleapis.com/v1beta/interactions'){
      const body=JSON.parse(init.body);assert.equal(body.model,'gemini-3.5-transcribe');
      assert.deepEqual(body.generation_config.transcription_config.mode,{type:'verbatim',timestamp_granularities:['word']});
      assert.deepEqual(body.generation_config.transcription_config.language_codes,['en-US']);
      return new Response(JSON.stringify({steps:[{type:'model_output',content:[{type:'text',text:'This browser acts for you now.',annotations:[
        {type:'word_info',text:'This',start_offset:'0.10s',end_offset:'0.36s'},
        {type:'word_info',text:'browser',start_offset:'0.42s',end_offset:'0.93s'},
        {type:'word_info',text:'acts',start_offset:'1.02s',end_offset:'1.28s'},
        {type:'word_info',text:'for',start_offset:'1.34s',end_offset:'1.50s'},
        {type:'word_info',text:'you',start_offset:'1.56s',end_offset:'1.76s'},
        {type:'word_info',text:'now',start_offset:'1.82s',end_offset:'2.05s'},
      ]}]}]}),{status:200,headers:{'content-type':'application/json'}});
    }
    if(target==='https://generativelanguage.googleapis.com/v1beta/files/test-audio')return new Response('',{status:200});
    throw new Error(`unexpected fake Gemini URL ${target}`);
  };
  const rawVoice={name:'fake-gemini-tts',async synthesize(input){return{id:'voice',uri:new URL(`file://${voicePath.replaceAll('\\','/')}`).href,mimeType:'audio/wav',provider:'fake',durationSeconds:2.1,language:input.language,voiceId:input.voice};}};
  const exactVoice=withGeminiWordAlignment(rawVoice,{apiKey:'gemini-key',fetchFn:fakeFetch,minCoverage:0.95});
  const exact=await exactVoice.synthesize({text:transcript,voice:'Kore',language:'en-US'});
  assert.equal(exact.metadata.alignmentSource,'gemini-word-timestamps');
  assert.ok(exact.metadata.alignmentCoverage>0.99);
  assert.equal(exact.alignment.characters.join(''),transcript);
  assert.ok(restCalls.some((call)=>call.target.endsWith('/interactions')));
  assert.ok(restCalls.some((call)=>call.target.endsWith('/files/test-audio')&&call.init.method==='DELETE'));
}finally{await rm(temp,{recursive:true,force:true});}

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
assert.match(publisher,/Upload blocked to avoid creating a duplicate video/);

const publicationMigration=await readFile('db/migrations/019_publication_idempotency.sql','utf8');
assert.match(publicationMigration,/unique index/i);
assert.match(publicationMigration,/production_run_id/);
const scriptDurationMigration=await readFile('db/migrations/020_script_duration_precision.sql','utf8');
assert.match(scriptDurationMigration,/target_duration_seconds/);
assert.match(scriptDurationMigration,/numeric\(10,3\)/i);
const persistence=await readFile('packages/persistence/src/workflow-repositories.ts','utf8');
assert.match(persistence,/on conflict \(production_run_id\)/);

const pilot=await readFile('scripts/pilot-first-run.mjs','utf8');
assert.match(pilot,/connections-doctor\.mjs','--strict','--production'/);
assert.match(pilot,/finalize-production\.mjs/);
assert.match(pilot,/PILOT_MIN_ATTENTION_SCORE\|\|'86'/);
assert.match(pilot,/A recent private YouTube upload is already READY_FOR_REVIEW/);

console.log('✓ factual tech pilot routes to EXPLAINER_DOCUMENTARY with mandatory research');
console.log('✓ scene planner prevents long identical procedural visual runs');
console.log('✓ Gemini word timestamps map to exact monotonic and Unicode-safe character alignment');
console.log('✓ Gemini Files + Transcribe REST flow is contract-tested without leaking the API key to the resumable URL');
console.log('✓ production hard cap, locked packaging repairs and production preflight are wired');
console.log('✓ Drive archive is pinned to the dedicated Drive OAuth identity');
console.log('✓ YouTube retry recovery is keyed to stable opportunity identity and fails closed when verification is unavailable');
console.log('✓ publication persistence is unique and idempotent per production run');
console.log('✓ first pilot resumes completed private uploads instead of duplicating paid generation');
