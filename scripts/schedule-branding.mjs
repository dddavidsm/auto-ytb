import { NodePostgresSqlClient } from '../packages/runtime-node/index.mjs';
import { ensureOwnedChannelRows, loadChannelConfigs } from './lib/channel-registry.mjs';

const req=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;};
const db=new NodePostgresSqlClient(req('DATABASE_URL'),{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
const maxAttempts=Math.max(1,Math.min(20,Number(process.env.JOB_MAX_ATTEMPTS??4)));
try{
  const registered=await ensureOwnedChannelRows(db,await loadChannelConfigs(),process.env);
  const queued=[];
  for(const entry of registered){
    if(entry.row.automation_enabled===false)continue;
    const active=(await db.query(`select id,asset_type,metadata,version from channel_brand_assets where channel_id=$1 and active=true`,[entry.row.id])).rows;
    const hasBrand=active.some((asset)=>asset.asset_type==='style_guide')&&active.some((asset)=>asset.asset_type==='banner')&&active.some((asset)=>asset.asset_type==='profile');
    if(!hasBrand){
      const jobKey=`bootstrap-channel-brand:${entry.row.id}`;
      const inserted=await db.query(`insert into jobs (job_key,kind,channel_id,state,priority,max_attempts,payload) values ($1,'bootstrap_channel_brand',$2,'queued',76,$3,$4::jsonb) on conflict (job_key) do nothing returning id`,[jobKey,entry.row.id,maxAttempts,JSON.stringify({channelId:entry.row.id,channelKey:entry.row.channel_key,credentialsRef:entry.row.credentials_ref??entry.config.credentialsRef??'PRIMARY',channelConfigPath:entry.config.__path})]);
      if(inserted.rows[0]){await db.query(`insert into job_events (job_id,event_type,detail) values ($1,'brand_bootstrap_scheduled',$2::jsonb)`,[inserted.rows[0].id,JSON.stringify({channelId:entry.row.id,channelKey:entry.row.channel_key})]);queued.push({jobId:inserted.rows[0].id,kind:'bootstrap_channel_brand',channelKey:entry.row.channel_key});}
      continue;
    }
    const banner=active.find((asset)=>asset.asset_type==='banner');
    const alreadyApplied=Boolean(banner?.metadata?.youtubeAppliedAt);
    if(entry.row.youtube_channel_id&&!alreadyApplied){
      const jobKey=`apply-channel-brand:${entry.row.id}:v${banner?.version??1}`;
      const inserted=await db.query(`insert into jobs (job_key,kind,channel_id,state,priority,max_attempts,payload) values ($1,'apply_channel_brand',$2,'queued',74,$3,$4::jsonb) on conflict (job_key) do nothing returning id`,[jobKey,entry.row.id,maxAttempts,JSON.stringify({channelId:entry.row.id,channelKey:entry.row.channel_key,credentialsRef:entry.row.credentials_ref??entry.config.credentialsRef??'PRIMARY',brandVersion:banner?.version??1})]);
      if(inserted.rows[0]){await db.query(`insert into job_events (job_id,event_type,detail) values ($1,'brand_apply_scheduled',$2::jsonb)`,[inserted.rows[0].id,JSON.stringify({channelId:entry.row.id,channelKey:entry.row.channel_key,brandVersion:banner?.version??1})]);queued.push({jobId:inserted.rows[0].id,kind:'apply_channel_brand',channelKey:entry.row.channel_key});}
    }
  }
  console.log(JSON.stringify({scheduled:queued.length,jobs:queued},null,2));
} finally {await db.close();}
