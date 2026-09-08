import { spawn } from 'node:child_process';
import os from 'node:os';
import { NodePostgresSqlClient } from '../packages/runtime-node/index.mjs';
import { createRuntimeHeartbeat } from './lib/runtime-heartbeat.mjs';

const req=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;};
const num=(name,fallback)=>{const value=Number(process.env[name]??fallback);if(!Number.isFinite(value))throw new Error(`${name} must be numeric`);return value;};
const intervalMs=Math.max(60_000,num('SCHEDULER_INTERVAL_MS',15*60_000));
const runImmediately=process.env.SCHEDULER_RUN_IMMEDIATELY!=='false';
const schedulerId=`${os.hostname()}:${process.pid}`;
const db=new NodePostgresSqlClient(req('DATABASE_URL'),{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
const heartbeat=createRuntimeHeartbeat(db,{role:'scheduler',instanceId:schedulerId,minIntervalMs:15_000});
let stopping=false;
process.on('SIGTERM',()=>{stopping=true;});
process.on('SIGINT',()=>{stopping=true;});
const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));

function run(script){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[script],{cwd:process.cwd(),env:process.env,stdio:'inherit'});child.on('error',reject);child.on('exit',(code,signal)=>code===0?resolve():reject(new Error(`${script} failed code=${code} signal=${signal??'none'}`)));});}
const scripts=['scripts/schedule-branding.mjs','scripts/schedule-intelligence.mjs','scripts/series-memory-sync.mjs','scripts/series-performance-sync.mjs','scripts/recheck-series-publication.mjs','scripts/series-episode-planner.mjs','scripts/schedule-production-series.mjs','scripts/schedule-maintenance.mjs'];
async function tick(){
  const startedAt=new Date().toISOString(),results=[];
  await heartbeat('running',{startedAt,intervalMs},true);
  for(const script of scripts){
    try{await run(script);results.push({script,status:'ok'});}catch(error){results.push({script,status:'error',error:error instanceof Error?error.message:String(error)});}
    await heartbeat('running',{startedAt,currentScript:script,completed:results.length,total:scripts.length});
  }
  const completedAt=new Date().toISOString();
  const failures=results.filter((item)=>item.status==='error').length;
  await heartbeat(failures?'degraded':'idle',{startedAt,completedAt,results,failures,nextTickInMs:intervalMs},true);
  console.log(JSON.stringify({schedulerId,startedAt,completedAt,results},null,2));
}
try{
  await heartbeat('starting',{intervalMs,runImmediately},true);
  if(runImmediately)await tick();
  while(!stopping){await heartbeat('idle',{nextTickInMs:intervalMs});await sleep(Math.min(intervalMs,15_000));if(stopping)break;let remaining=intervalMs-15_000;while(remaining>0&&!stopping){await heartbeat('idle',{nextTickInMs:remaining});const slice=Math.min(15_000,remaining);await sleep(slice);remaining-=slice;}if(stopping)break;await tick();}
  await heartbeat('stopping',{},true);
}finally{await db.close();}
console.log(JSON.stringify({schedulerId,stopped:true},null,2));
