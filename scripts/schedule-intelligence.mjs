import { NodePostgresSqlClient } from '../packages/runtime-node/index.mjs';

const req=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;};
const num=(name,fallback)=>{const value=Number(process.env[name]??fallback);if(!Number.isFinite(value))throw new Error(`${name} must be numeric`);return value;};
const intervalHours=Math.max(1,Math.min(24,Math.floor(num('MARKET_CYCLE_INTERVAL_HOURS',6))));
const priority=Math.max(0,Math.min(100,Math.floor(num('MARKET_JOB_PRIORITY',70))));
const maxAttempts=Math.max(1,Math.min(20,Math.floor(num('JOB_MAX_ATTEMPTS',4))));
const now=new Date();
const hour=now.getUTCHours();
const slotHour=Math.floor(hour/intervalHours)*intervalHours;
const slot=`${now.toISOString().slice(0,10)}T${String(slotHour).padStart(2,'0')}`;
const db=new NodePostgresSqlClient(req('DATABASE_URL'),{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
try{
  const payload={slot,niche:process.env.PRIMARY_CHANNEL_KEY||'future-tech-business'};
  const result=await db.query(`insert into jobs (job_key,kind,state,priority,max_attempts,payload) values ($1,'market_cycle','queued',$2,$3,$4::jsonb) on conflict (job_key) do nothing returning id`,[`market-cycle:${slot}`,priority,maxAttempts,JSON.stringify(payload)]);
  if(result.rows[0]){
    await db.query(`insert into job_events (job_id,event_type,detail) values ($1,'scheduled',$2::jsonb)`,[result.rows[0].id,JSON.stringify(payload)]);
    console.log(JSON.stringify({scheduled:1,jobId:result.rows[0].id,kind:'market_cycle',slot,intervalHours},null,2));
  } else console.log(JSON.stringify({scheduled:0,reason:'market cycle already scheduled for slot',slot},null,2));
} finally {await db.close();}
