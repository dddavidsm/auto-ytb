import { spawn } from 'node:child_process';
import os from 'node:os';
import { NodePostgresSqlClient } from '../packages/runtime-node/index.mjs';
import { computeRetryDelayMs, shouldRetry } from '@auto-ytb/os';

const req=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;};
const num=(name,fallback)=>{const value=Number(process.env[name]??fallback);if(!Number.isFinite(value))throw new Error(`${name} must be numeric`);return value;};
const once=process.argv.includes('--once');
const maxJobsArg=process.argv.find((arg)=>arg.startsWith('--max-jobs='));
const maxJobs=Math.max(1,Math.floor(Number(maxJobsArg?.slice(11) || (once?1:1000000))));
const pollMs=Math.max(1000,num('JOB_POLL_MS',5000));
const staleMinutes=Math.max(5,num('JOB_STALE_MINUTES',120));
const timeoutMinutes=Math.max(5,num('JOB_TIMEOUT_MINUTES',120));
const workerId=`${os.hostname()}:${process.pid}`;
const db=new NodePostgresSqlClient(req('DATABASE_URL'),{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
let processed=0;
let stopping=false;
process.on('SIGTERM',()=>{stopping=true;});
process.on('SIGINT',()=>{stopping=true;});
const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));

async function emit(jobId,eventType,detail={}){await db.query(`insert into job_events (job_id,event_type,detail) values ($1,$2,$3::jsonb)`,[jobId,eventType,JSON.stringify(detail)]);}
async function recoverStale(){const result=await db.query(`update jobs set state='retry',locked_at=null,locked_by=null,not_before=now(),last_error=coalesce(last_error,'') || case when last_error is null or last_error='' then '' else E'\n' end || 'Recovered stale running job',updated_at=now() where state='running' and locked_at < now()-($1::text || ' minutes')::interval returning id`,[String(staleMinutes)]);for(const row of result.rows)await emit(row.id,'stale_recovered',{workerId,staleMinutes});return result.rows.length;}
async function claim(){const result=await db.query(`with candidate as (select id from jobs where state in ('queued','retry') and not_before<=now() order by priority desc,created_at asc for update skip locked limit 1) update jobs j set state='running',attempts=j.attempts+1,locked_at=now(),locked_by=$1,updated_at=now() from candidate where j.id=candidate.id returning j.*`,[workerId]);const job=result.rows[0];if(job)await emit(job.id,'started',{workerId,attempt:job.attempts,contentFormat:job.payload?.contentFormat});return job;}

function runNode(script,args=[]){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[script,...args],{cwd:process.cwd(),env:process.env,stdio:['ignore','pipe','pipe']});let stdout='';let stderr='';const append=(current,chunk)=>`${current}${chunk.toString()}`.slice(-30000);child.stdout.on('data',(chunk)=>{stdout=append(stdout,chunk);process.stdout.write(chunk);});child.stderr.on('data',(chunk)=>{stderr=append(stderr,chunk);process.stderr.write(chunk);});const timer=setTimeout(()=>{child.kill('SIGTERM');setTimeout(()=>child.kill('SIGKILL'),10000).unref();},timeoutMinutes*60_000);child.on('error',(error)=>{clearTimeout(timer);reject(error);});child.on('exit',(code,signal)=>{clearTimeout(timer);if(code===0)resolve({stdout,stderr});else reject(new Error(`child process failed code=${code} signal=${signal ?? 'none'} stderr=${stderr.slice(-4000)}`));});});}

async function execute(job){
  const payload=job.payload ?? {};
  if(job.kind==='produce_opportunity'){
    const topic=String(payload.topic ?? '').trim();
    if(!topic) throw new Error('produce_opportunity job missing payload.topic');
    const contentFormat=String(payload.contentFormat ?? 'LONG_HORIZONTAL');
    const channelConfig=String(payload.channelConfig ?? process.env.CHANNEL_CONFIG ?? 'config/channels/future-tech-business.example.json');
    await runNode('scripts/live-pipeline.mjs',[`--topic=${topic}`,`--opportunity-id=${job.opportunity_id}`,`--format=${contentFormat}`,`--channel-config=${channelConfig}`]);
    const runResult=await db.query(`select pr.id,coalesce(pr.total_cost_usd,0)::float as cost from production_runs pr join content_ideas ci on ci.id=pr.content_idea_id where ci.opportunity_id=$1 order by pr.created_at desc limit 1`,[job.opportunity_id]);
    const productionRunId=runResult.rows[0]?.id;
    if(productionRunId && process.env.AUTO_UPLOAD_PRIVATE==='true') await runNode('scripts/auto-publish.mjs',[`--production-run-id=${productionRunId}`,`--channel-config=${channelConfig}`]);
    return {actualCostUsd:Number(runResult.rows[0]?.cost ?? 0),contentFormat,productionRunId};
  }
  if(job.kind==='analytics_sync'){
    await runNode('scripts/analytics-sync.mjs',[`--days=${Number(payload.days ?? 28)}`]);
    return {};
  }
  if(job.kind==='market_cycle'){
    const args=[];
    if(payload.niche) args.push(`--niche=${String(payload.niche)}`);
    if(payload.maxQueries) args.push(`--max-queries=${Math.max(1,Math.floor(Number(payload.maxQueries)))}`);
    if(payload.days) args.push(`--days=${Math.max(1,Math.floor(Number(payload.days)))}`);
    await runNode('scripts/market-cycle.mjs',args);
    return {};
  }
  if(job.kind==='schedule_publication'){
    const publicationId=String(payload.publicationId ?? '').trim();
    const publishAt=String(payload.publishAt ?? '').trim();
    if(!publicationId||!publishAt) throw new Error('schedule_publication job missing publicationId or publishAt');
    await runNode('scripts/schedule-publication.mjs',[`--publication-id=${publicationId}`,`--publish-at=${publishAt}`]);
    return {};
  }
  throw new Error(`Unsupported job kind ${job.kind}`);
}

async function settleBudget(job,actualCostUsd,releaseOnly=false){const payload=job.payload ?? {};const channelKey=String(payload.channelKey ?? 'future-tech-business');const reserved=Math.max(0,Number(payload.reservedCostUsd ?? 0));if(!reserved)return;const budgetDate=String(payload.budgetDate ?? new Date().toISOString().slice(0,10));await db.query(`update daily_budget_ledger set reserved_usd=greatest(0,reserved_usd-$3),actual_usd=actual_usd+$4,updated_at=now() where channel_key=$1 and spend_date=$2::date`,[channelKey,budgetDate,reserved,releaseOnly?0:Math.max(0,actualCostUsd)]);}
async function complete(job,result){await db.query(`update jobs set state='succeeded',locked_at=null,locked_by=null,completed_at=now(),updated_at=now(),last_error=null where id=$1`,[job.id]);await settleBudget(job,result.actualCostUsd ?? 0,false);await emit(job.id,'succeeded',{workerId,attempt:job.attempts,actualCostUsd:result.actualCostUsd ?? 0,contentFormat:result.contentFormat ?? job.payload?.contentFormat,productionRunId:result.productionRunId});}
async function fail(job,error){const message=(error instanceof Error?error.message:String(error)).slice(0,8000);if(shouldRetry(Number(job.attempts),Number(job.max_attempts))){const delayMs=computeRetryDelayMs(Number(job.attempts),{baseDelayMs:num('JOB_RETRY_BASE_MS',60000),maxDelayMs:num('JOB_RETRY_MAX_MS',6*60*60_000),jitterRatio:0.15});await db.query(`update jobs set state='retry',locked_at=null,locked_by=null,not_before=now()+($2::text || ' milliseconds')::interval,last_error=$3,updated_at=now() where id=$1`,[job.id,String(delayMs),message]);await emit(job.id,'retry_scheduled',{workerId,attempt:job.attempts,delayMs,error:message,contentFormat:job.payload?.contentFormat});}else{await db.query(`update jobs set state='dead',locked_at=null,locked_by=null,completed_at=now(),last_error=$2,updated_at=now() where id=$1`,[job.id,message]);await settleBudget(job,0,true);await emit(job.id,'dead_letter',{workerId,attempt:job.attempts,error:message,contentFormat:job.payload?.contentFormat});}}

try{const recovered=await recoverStale();if(recovered)console.log(`Recovered ${recovered} stale jobs`);while(!stopping&&processed<maxJobs){const job=await claim();if(!job){if(once)break;await sleep(pollMs);continue;}try{const result=await execute(job);await complete(job,result);}catch(error){await fail(job,error);}processed+=1;if(once)break;}}finally{await db.close();}
console.log(JSON.stringify({workerId,processed,stopping},null,2));
