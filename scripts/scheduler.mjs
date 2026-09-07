import { spawn } from 'node:child_process';
import os from 'node:os';

const num=(name,fallback)=>{const value=Number(process.env[name]??fallback);if(!Number.isFinite(value))throw new Error(`${name} must be numeric`);return value;};
const intervalMs=Math.max(60_000,num('SCHEDULER_INTERVAL_MS',15*60_000));
const runImmediately=process.env.SCHEDULER_RUN_IMMEDIATELY!=='false';
const schedulerId=`${os.hostname()}:${process.pid}`;
let stopping=false;
process.on('SIGTERM',()=>{stopping=true;});
process.on('SIGINT',()=>{stopping=true;});
const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));

function run(script){
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[script],{cwd:process.cwd(),env:process.env,stdio:'inherit'});
    child.on('error',reject);
    child.on('exit',(code,signal)=>code===0?resolve():reject(new Error(`${script} failed code=${code} signal=${signal??'none'}`)));
  });
}

async function tick(){
  const startedAt=new Date().toISOString();
  const results=[];
  for(const script of ['scripts/schedule-production.mjs','scripts/schedule-maintenance.mjs']){
    try{await run(script);results.push({script,status:'ok'});}
    catch(error){results.push({script,status:'error',error:error instanceof Error?error.message:String(error)});}
  }
  console.log(JSON.stringify({schedulerId,startedAt,completedAt:new Date().toISOString(),results},null,2));
}

if(runImmediately) await tick();
while(!stopping){
  await sleep(intervalMs);
  if(stopping) break;
  await tick();
}
console.log(JSON.stringify({schedulerId,stopped:true},null,2));
