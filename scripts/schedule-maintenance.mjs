import { NodePostgresSqlClient } from '../packages/runtime-node/index.mjs';

const req=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;};
const num=(name,fallback)=>{const value=Number(process.env[name]??fallback);if(!Number.isFinite(value))throw new Error(`${name} must be numeric`);return value;};
const days=Math.max(1,Math.min(90,Math.floor(num('ANALYTICS_SYNC_DAYS',28))));
const priority=Math.max(0,Math.min(100,Math.floor(num('ANALYTICS_JOB_PRIORITY',35))));
const maxAttempts=Math.max(1,Math.min(20,Math.floor(num('JOB_MAX_ATTEMPTS',4))));
const today=new Date().toISOString().slice(0,10);
const db=new NodePostgresSqlClient(req('DATABASE_URL'),{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
try{
  const channels=(await db.query(`select c.id,c.channel_key,c.credentials_ref,count(p.id)::int as publications from channels c join publications p on p.channel_id=c.id and p.youtube_video_id is not null and p.state in ('private','reviewed','scheduled','public') where c.is_owned=true and c.automation_enabled is distinct from false group by c.id,c.channel_key,c.credentials_ref order by c.channel_key`)).rows;
  if(!channels.length){console.log(JSON.stringify({scheduled:0,reason:'no YouTube publications to sync',date:today},null,2));}
  else{
    const scheduled=[];
    for(const channel of channels){
      const payload={days,scheduledDate:today,channelId:channel.id,channelKey:channel.channel_key,credentialsRef:channel.credentials_ref??'PRIMARY'};
      const result=await db.query(`insert into jobs (job_key,kind,channel_id,state,priority,max_attempts,payload) values ($1,'analytics_sync',$2,'queued',$3,$4,$5::jsonb) on conflict (job_key) do nothing returning id`,[`analytics-sync:${channel.id}:${today}`,channel.id,priority,maxAttempts,JSON.stringify(payload)]);
      if(result.rows[0]){await db.query(`insert into job_events (job_id,event_type,detail) values ($1,'scheduled',$2::jsonb)`,[result.rows[0].id,JSON.stringify(payload)]);scheduled.push({jobId:result.rows[0].id,channelId:channel.id,channelKey:channel.channel_key,publications:Number(channel.publications)});}
    }
    console.log(JSON.stringify({scheduled:scheduled.length,days,date:today,jobs:scheduled},null,2));
  }
} finally {await db.close();}
