import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { NodePostgresSqlClient } from '../packages/runtime-node/index.mjs';

const arg=(name,fallback)=>process.argv.find((value)=>value.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const has=(name)=>process.argv.includes(`--${name}`);
const req=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;};
const budget=Math.min(3,Math.max(2,Number(arg('budget','3'))||3));
const execute=has('execute');
const primary=process.env.PRIMARY_CHANNEL_KEY?.trim()||'future-tech-business';
const channelConfig=arg('channel-config','config/channels/future-tech-business.example.json');

function run(command,args,{env=process.env,label=command}={}){
  console.log(`\n=== ${label} ===`);
  const result=spawnSync(command,args,{stdio:'inherit',env,windowsHide:false,shell:false});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error(`${label} failed with exit code ${result.status}`);
}

console.log('AUTO-YTB FIRST PILOT');
console.log(`Mode: ${execute?'EXECUTE (real generation, private upload)':'PLAN ONLY (no media generation)'}`);
console.log(`Primary channel profile: ${primary}`);
console.log(`Hard production cap: $${budget.toFixed(2)}`);

run(process.execPath,['scripts/connections-doctor.mjs','--strict'],{label:'Core connection doctor'});
run(process.platform==='win32'?(process.env.ComSpec||'cmd.exe'):'npm',process.platform==='win32'?['/d','/s','/c','npm run build']:['run','build'],{label:'Build'});
run(process.execPath,['apps/cli/dist/niche-live.js'],{label:'Cross-niche opportunity radar'});

let radar=null;
try{radar=JSON.parse(await readFile('.data/niche-live-latest.json','utf8'));}catch{}
const radarWinner=radar?.decision?.winner??null;
const radarLabel=radar?.decision?.label??null;

run(process.execPath,['scripts/market-cycle.mjs'],{env:{...process.env,PRIMARY_CHANNEL_KEY:primary},label:`Current market cycle: ${primary}`});

const db=new NodePostgresSqlClient(req('DATABASE_URL'),{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
let opportunity;
try{
  const rows=await db.query(`select o.id,o.angle,o.score::float,o.grade,o.decision,o.status,t.canonical_name,t.niche from opportunities o join topics t on t.id=o.topic_id where t.niche=$1 and o.expires_at>now() and o.status not in ('rejected','produced') order by case when o.decision='PRODUCE' then 0 when o.decision='RESEARCH' then 1 else 2 end,o.score desc,o.detected_at desc limit 1`,[primary]);
  opportunity=rows.rows[0]??null;
} finally {await db.close();}

console.log('\n=== Pilot decision ===');
console.log(JSON.stringify({radarWinner,radarLabel,primaryChannelProfile:primary,radarMatchesPrimary:radarWinner?radarWinner===primary:null,selectedOpportunity:opportunity??null,format:'SHORT_VERTICAL',maxProductionCostUsd:budget,uploadPrivacy:'private'},null,2));

if(!opportunity){
  console.log('\nNo eligible live opportunity was found for the connected primary channel. No generation was attempted.');
  process.exit(0);
}

if(!execute){
  console.log('\nPLAN READY. No TTS/image/video generation call was made.');
  console.log(`To execute this exact controlled pilot: npm run pilot:first -- --execute --budget=${budget}`);
  process.exit(0);
}

console.log('\nREAL PILOT STARTING. Media generation can incur charges, but MAX_PRODUCTION_COST_USD is capped for this run and upload is forced private.');
const env={...process.env,PRIMARY_CHANNEL_KEY:primary,MAX_PRODUCTION_COST_USD:String(budget),AUTO_UPLOAD_PRIVATE:'true',AUTO_PRODUCTION_MAX_PER_DAY:'1',PORTFOLIO_MAX_VIDEOS_PER_DAY:'1'};
run(process.execPath,['scripts/live-pipeline.mjs',`--topic=${opportunity.angle||opportunity.canonical_name}`,`--opportunity-id=${opportunity.id}`,'--format=SHORT_VERTICAL',`--channel-config=${channelConfig}`],{env,label:'Research -> script -> voice -> visuals -> captions -> render -> QA -> private YouTube'});

console.log('\nFIRST PILOT FINISHED. Refresh the AUTO-YTB dashboard to inspect the production, QA, costs and publication state.');
