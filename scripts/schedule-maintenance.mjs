import { NodePostgresSqlClient } from '../packages/runtime-node/index.mjs';

const req=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;};
const num=(name,fallback)=>{const value=Number(process.env[name]??fallback);if(!Number.isFinite(value))throw new Error(`${name} must be numeric`);return value;};
const days=Math.max(1,Math.min(90,Math.floor(num('ANALYTICS_SYNC_DAYS',28))));
const priority=Math.max(0,Math.min(100,Math.floor(num('ANALYTICS_JOB_PRIORITY',35))));
const maxAttempts=Math.max(1,Math.min(20,Math.floor(num('JOB_MAX_ATTEMPTS',4))));
const today=new Date().toISOString().slice(0,10);
const db=new NodePostgresSqlClient(req('DATABASE_URL'),{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
try{
  const publications=await db.query(`select count(*)::int as count from publications where youtube_video_id is not null and state in ('private','reviewed','scheduled','public')`);
  if(Number(publications.rows[0]?.count ?? 0)===0){
    console.log(JSON.stringify({scheduled:0,reason:'no YouTube publications to sync',date:today},null,2));
  } else {
    const payload={days,scheduledDate:today};
    const result=await db.query(`insert into jobs (job_key,kind,state,priority,max_attempts,payload) values ($1,'analytics_sync','queued',$2,$3,$4::jsonb) on conflict (job_key) do nothing returning id`,[`analytics-sync:${today}`,priority,maxAttempts,JSON.stringify(payload)]);
    if(result.rows[0]){
      await db.query(`insert into job_events (job_id,event_type,detail) values ($1,'scheduled',$2::jsonb)`,[result.rows[0].id,JSON.stringify(payload)]);
      console.log(JSON.stringify({scheduled:1,jobId:result.rows[0].id,kind:'analytics_sync',days,date:today},null,2));
    } else {
      console.log(JSON.stringify({scheduled:0,reason:'maintenance job already exists',date:today},null,2));
    }
  }
} finally { await db.close(); }
