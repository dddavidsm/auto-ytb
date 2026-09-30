import { createHash, createDecipheriv } from 'node:crypto';
import { createLiveRuntime } from '../packages/runtime-node/factory.mjs';
import { NodePostgresSqlClient } from '../packages/runtime-node/index.mjs';
import { PublicationRepository } from '@auto-ytb/persistence';

const arg=(name)=>process.argv.find((value)=>value.startsWith(`--${name}=`))?.slice(name.length+3)?.trim();
const productionRunId=arg('production-run-id');
if(!productionRunId)throw new Error('upload_private_production requires --production-run-id=<uuid>');
const baseDb=new NodePostgresSqlClient(String(process.env.DATABASE_URL||''),{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
let runtime=null;
function decryptChannelToken(encoded){
  const parts=String(encoded||'').split('.');
  if(parts.length!==4||parts[0]!=='v1')throw new Error('Invalid stored YouTube refresh token format');
  const key=createHash('sha256').update(String(process.env.SESSION_SECRET||process.env.CONTROL_PLANE_TOKEN||'')).digest();
  const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(parts[1],'base64url'));decipher.setAuthTag(Buffer.from(parts[2],'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(parts[3],'base64url')),decipher.final()]).toString('utf8');
}
try{
  const row=(await baseDb.query(`select pr.id,pr.metadata,ci.working_title,ci.premise,ci.format,coalesce(pr.metadata->>'language','es') as language,coalesce(pr.metadata->>'renderUri','') as render_uri,coalesce(p.content_format,case when lower(ci.format) in ('short','short_vertical') then 'SHORT_VERTICAL' else 'LONG_HORIZONTAL' end) as content_format,coalesce(p.contains_synthetic_media,false) as contains_synthetic_media,c.id as channel_id,c.channel_key,cc.refresh_token_ciphertext from production_runs pr join content_ideas ci on ci.id=pr.content_idea_id left join publications p on p.production_run_id=pr.id left join channels c on c.id=coalesce(p.channel_id,(select id from channels where is_owned=true order by updated_at desc limit 1)) left join channel_connections cc on cc.channel_id=c.id and cc.provider='youtube' and cc.status='connected' where pr.id=$1 and pr.deleted_at is null order by p.updated_at desc nulls last limit 1`,[productionRunId])).rows[0];
  if(!row)throw new Error(`Production run ${productionRunId} not found or deleted`);
  if(!row.render_uri)throw new Error('The production has no durable render URI; upload blocked.');
  if(!row.channel_id)throw new Error('No owned channel is connected to this production.');
  const refreshToken=row.refresh_token_ciphertext?decryptChannelToken(row.refresh_token_ciphertext):String(process.env.YOUTUBE_REFRESH_TOKEN||'');
  if(!refreshToken)throw new Error('YouTube is not connected. Connect a channel from Canales or configure the worker refresh token.');
  runtime=createLiveRuntime({...process.env,YOUTUBE_REFRESH_TOKEN:refreshToken,AUTO_YTB_CONTENT_TOPIC:String(row.working_title||`production ${productionRunId}`),AUTO_YTB_CONTENT_FORMAT:String(row.content_format||'LONG_HORIZONTAL')});
  const db=runtime.db;
  if(!db)throw new Error('YouTube upload requires DATABASE_URL');
  if(!runtime.publisher)throw new Error('YouTube publisher is unavailable on the Cloudflare worker.');
  const existing=(await db.query(`select youtube_video_id from publications where production_run_id=$1 and youtube_video_id is not null order by updated_at desc limit 1`,[productionRunId])).rows[0];
  if(existing?.youtube_video_id){console.log(JSON.stringify({productionRunId,youtubeVideoId:existing.youtube_video_id,state:'already_uploaded'},null,2));}
  else{
    const title=String(row.working_title||`AUTO-YTB ${productionRunId.slice(0,8)}`).slice(0,100);
    const description=String(row.premise||'Vídeo producido con AUTO-YTB.').slice(0,4500);
    const tags=[...new Set(['AUTO-YTB',String(row.channel_key||''),String(row.content_format||'').toLowerCase()].filter(Boolean))].slice(0,20);
    const upload=await runtime.publisher.uploadPrivate({fileUri:row.render_uri,title,description,tags,language:String(row.language||'es'),containsSyntheticMedia:Boolean(row.contains_synthetic_media)});
    const publicationId=await new PublicationRepository(db).create({productionRunId,channelId:row.channel_id,youtubeVideoId:upload.externalId,state:'private',contentFormat:row.content_format,containsSyntheticMedia:Boolean(row.contains_synthetic_media),metadata:{uploadSource:'gallery-manual',youtubeUrl:upload.url??null,uploadedAt:new Date().toISOString(),renderUri:row.render_uri}});
    await db.query(`update production_runs set metadata=metadata||$2::jsonb,updated_at=now() where id=$1`,[productionRunId,JSON.stringify({youtubeUpload:{state:'private',youtubeVideoId:upload.externalId,publicationId,uploadedAt:new Date().toISOString()}})]);
    console.log(JSON.stringify({productionRunId,publicationId,youtubeVideoId:upload.externalId,state:'private',url:upload.url??null},null,2));
  }
}finally{if(runtime?.db)await runtime.db.close();await baseDb.close();}
