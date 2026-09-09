import { readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { NodePostgresSqlClient } from '../packages/runtime-node/index.mjs';

const arg=(name,fallback)=>process.argv.find((value)=>value.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const has=(name)=>process.argv.includes(`--${name}`);
const req=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;};
const budget=Math.min(3,Math.max(2,Number(arg('budget','3'))||3));
const execute=has('execute');
const refreshMarket=has('refresh-market');
const primary=process.env.PRIMARY_CHANNEL_KEY?.trim()||'future-tech-business';
const channelConfig=arg('channel-config','config/channels/future-tech-business.example.json');
const channelSpec=JSON.parse(await readFile(channelConfig,'utf8'));
const channelKey=String(channelSpec.channelKey||channelSpec.id);

function run(command,args,{env=process.env,label=command,allowFailure=false}={}){
  console.log(`\n=== ${label} ===`);
  const result=spawnSync(command,args,{stdio:'inherit',env,windowsHide:false,shell:false});
  if(result.error){if(allowFailure){console.warn(`${label} skipped after error: ${result.error.message}`);return false;}throw result.error;}
  if(result.status!==0){if(allowFailure){console.warn(`${label} unavailable (exit ${result.status}); continuing with cached/persisted intelligence.`);return false;}throw new Error(`${label} failed with exit code ${result.status}`);}
  return true;
}

async function readJsonIfFresh(path,maxAgeMs){
  try{const info=await stat(path);if(Date.now()-info.mtimeMs>maxAgeMs)return null;return JSON.parse(await readFile(path,'utf8'));}catch{return null;}
}
function dbClient(){return new NodePostgresSqlClient(req('DATABASE_URL'),{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});}
async function loadOpportunity(db){
  const rows=await db.query(`select o.id,o.angle,o.score::float,o.grade,o.decision,o.status,t.canonical_name,t.niche from opportunities o join topics t on t.id=o.topic_id where t.niche=$1 and o.expires_at>now() and o.status not in ('rejected','produced') order by case when o.decision='PRODUCE' then 0 when o.decision='RESEARCH' then 1 else 2 end,o.score desc,o.detected_at desc limit 1`,[primary]);
  return rows.rows[0]??null;
}
async function loadLatestRunForOpportunity(opportunityId){
  const db=dbClient();
  try{
    const rows=await db.query(`select pr.id,pr.state,pr.total_cost_usd::float,pr.metadata,pr.created_at,pr.updated_at,p.youtube_video_id,p.state as publication_state from production_runs pr join content_ideas ci on ci.id=pr.content_idea_id left join publications p on p.production_run_id=pr.id where ci.opportunity_id=$1 order by pr.created_at desc,p.created_at desc nulls last limit 1`,[opportunityId]);
    return rows.rows[0]??null;
  } finally {await db.close();}
}
async function loadRecoverableRun(){
  const db=dbClient();
  try{
    const rows=await db.query(`select pr.id,pr.state,pr.total_cost_usd::float,pr.metadata,pr.created_at,pr.updated_at,p.youtube_video_id,p.state as publication_state from production_runs pr join publications p on p.production_run_id=pr.id where upper(pr.state)='READY_FOR_REVIEW' and p.state='private' and pr.metadata->>'channelKey'=$1 and pr.created_at>now()-interval '72 hours' and coalesce(pr.metadata->'library'->>'finalizedAt','')='' order by pr.created_at desc limit 1`,[channelKey]);
    return rows.rows[0]??null;
  } finally {await db.close();}
}
async function loadRun(id){
  const db=dbClient();
  try{return (await db.query(`select pr.id,pr.state,pr.total_cost_usd::float,pr.metadata,pr.updated_at,p.youtube_video_id,p.state as publication_state from production_runs pr left join publications p on p.production_run_id=pr.id where pr.id=$1 order by p.created_at desc nulls last limit 1`,[id])).rows[0]??null;}
  finally{await db.close();}
}
function summarizeRun(run){return run?{productionRunId:run.id,state:run.state,totalCostUsd:run.total_cost_usd,youtubeVideoId:run.youtube_video_id??null,publicationState:run.publication_state??null,libraryFinalizedAt:run.metadata?.library?.finalizedAt??null,contentArchetype:run.metadata?.contentArchetype?.id??run.metadata?.contentArchetype?.archetype??null,qaBlockers:run.metadata?.qaBlockers??[],attentionScore:run.metadata?.attention?.score??null,attentionIssues:run.metadata?.attention?.issues??[],lastEvents:(run.metadata?.events??[]).slice(-8),updatedAt:run.updated_at}:null;}
function finalize(runId){run(process.execPath,['scripts/finalize-production.mjs',`--production-run-id=${runId}`,`--channel-config=${channelConfig}`],{label:'Google Drive final archive'});}

console.log('AUTO-YTB FIRST PILOT');
console.log(`Mode: ${execute?'EXECUTE (real generation, private upload)':'PLAN ONLY (no media generation)'}`);
console.log(`Primary channel profile: ${primary}`);
console.log(`Hard production cap: $${budget.toFixed(2)}`);

run(process.execPath,['scripts/connections-doctor.mjs','--strict','--production'],{label:'Production preflight'});
run(process.platform==='win32'?(process.env.ComSpec||'cmd.exe'):'npm',process.platform==='win32'?['/d','/s','/c','npm run build']:['run','build'],{label:'Build'});

if(execute){
  const recoverable=await loadRecoverableRun();
  if(recoverable){
    console.log('\n=== Resume safety ===');
    console.log('A recent private YouTube upload is already READY_FOR_REVIEW but not fully archived. Reusing it instead of regenerating paid media or creating a duplicate upload.');
    console.log(JSON.stringify(summarizeRun(recoverable),null,2));
    finalize(recoverable.id);
    const resumed=await loadRun(recoverable.id);
    console.log('\n=== Resumed pilot result ===');
    console.log(JSON.stringify(summarizeRun(resumed),null,2));
    if(!resumed?.metadata?.library?.finalizedAt)throw new Error(`Production ${recoverable.id} finished private upload but Drive finalization was not persisted.`);
    console.log('\nFIRST PILOT COMPLETE — existing private upload verified and Drive archive finalized without duplicate generation.');
    process.exit(0);
  }
}

let radar=await readJsonIfFresh('.data/niche-live-latest.json',6*60*60*1000);
if(radar&&!refreshMarket){
  console.log('\n=== Cross-niche opportunity radar ===');
  console.log('Using fresh cached radar (<6h) to preserve YouTube daily search quota. Use --refresh-market to force a refresh.');
}else{
  const ok=run(process.execPath,['apps/cli/dist/niche-live.js'],{label:'Cross-niche opportunity radar',allowFailure:true});
  if(ok)try{radar=JSON.parse(await readFile('.data/niche-live-latest.json','utf8'));}catch{}
}
const radarWinner=radar?.decision?.winner??null;
const radarLabel=radar?.decision?.label??null;

const db=dbClient();
let opportunity;
try{
  opportunity=await loadOpportunity(db);
  if(opportunity&&!refreshMarket){
    console.log(`\n=== Current market cycle: ${primary} ===`);
    console.log('Using an unexpired opportunity already persisted in PostgreSQL to preserve YouTube daily search quota.');
  }else{
    run(process.execPath,['scripts/market-cycle.mjs'],{env:{...process.env,PRIMARY_CHANNEL_KEY:primary},label:`Current market cycle: ${primary}`,allowFailure:true});
    opportunity=await loadOpportunity(db);
  }
} finally {await db.close();}

console.log('\n=== Pilot decision ===');
console.log(JSON.stringify({radarWinner,radarLabel,primaryChannelProfile:primary,radarMatchesPrimary:radarWinner?radarWinner===primary:null,selectedOpportunity:opportunity??null,format:'SHORT_VERTICAL',maxProductionCostUsd:budget,uploadPrivacy:'private'},null,2));

if(!opportunity){
  console.log('\nNo eligible live or cached opportunity was found for the connected primary channel. No generation was attempted.');
  console.log('When YouTube search quota resets, rerun with --refresh-market to refresh intelligence.');
  process.exit(0);
}
if(!execute){
  console.log('\nPLAN READY. No TTS/image/video generation call was made.');
  console.log(`To execute this exact controlled pilot: node --env-file=.env.local scripts/pilot-first-run.mjs --execute --budget=${budget}`);
  process.exit(0);
}

console.log('\nREAL PILOT STARTING. Paid media is budget-fitted before provider calls, the cap is enforced again before render, and upload is forced private.');
// Keep the production-quality attention threshold. Allow extra autonomous repair passes rather
// than lowering the quality gate; critical attention issues can never be bypassed by score alone.
const env={...process.env,PRIMARY_CHANNEL_KEY:primary,MAX_PRODUCTION_COST_USD:String(budget),AUTO_UPLOAD_PRIVATE:'true',AUTO_PRODUCTION_MAX_PER_DAY:'1',PORTFOLIO_MAX_VIDEOS_PER_DAY:'1',MIN_ATTENTION_SCORE:process.env.PILOT_MIN_ATTENTION_SCORE||'86',MAX_ATTENTION_REVISION_PASSES:process.env.PILOT_MAX_ATTENTION_REVISION_PASSES||'4'};
run(process.execPath,['scripts/live-pipeline.mjs',`--topic=${opportunity.angle||opportunity.canonical_name}`,`--opportunity-id=${opportunity.id}`,'--format=SHORT_VERTICAL',`--channel-config=${channelConfig}`],{env,label:'Research -> script -> voice -> visuals -> captions -> render -> QA -> private YouTube'});

let latestRun=await loadLatestRunForOpportunity(opportunity.id);
console.log('\n=== Pilot result ===');
console.log(JSON.stringify(summarizeRun(latestRun),null,2));
if(!latestRun)throw new Error('Pilot pipeline exited without persisting a production run.');
if(String(latestRun.state).toUpperCase()==='BLOCKED')throw new Error(`Pilot production ${latestRun.id} is BLOCKED. The diagnostic block above contains the exact attention/QA/event reason; no private upload was created.`);
if(String(latestRun.state).toUpperCase()!=='READY_FOR_REVIEW')throw new Error(`Pilot production ${latestRun.id} ended in unexpected state ${latestRun.state}.`);
if(!latestRun.youtube_video_id||latestRun.publication_state!=='private')throw new Error(`Pilot production ${latestRun.id} reached READY_FOR_REVIEW without a persisted private YouTube publication.`);

finalize(latestRun.id);
latestRun=await loadRun(latestRun.id);
console.log('\n=== Final E2E result ===');
console.log(JSON.stringify(summarizeRun(latestRun),null,2));
if(!latestRun?.metadata?.library?.finalizedAt)throw new Error(`Pilot production ${latestRun?.id??'unknown'} uploaded privately but the Drive archive did not finalize.`);

console.log('\nFIRST PILOT COMPLETE — research, quality gates, media generation, synchronization, captions/render, final inspection, private YouTube upload, persistence and Drive archive are all complete.');
