import { NodePostgresSqlClient } from '../packages/runtime-node/index.mjs';
import { createDistributionPublisher, publicMediaUrlFor } from '../packages/runtime-node/distribution.mjs';

const arg=(name)=>process.argv.find((value)=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const req=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;};
const publicationId=arg('publication-id'),platform=String(arg('platform')??'').toLowerCase();
if(!publicationId||!['youtube','tiktok','instagram','facebook'].includes(platform))throw new Error('Use --publication-id=<uuid> --platform=<youtube|tiktok|instagram|facebook>');
const db=new NodePostgresSqlClient(req('DATABASE_URL'),{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
const now=()=>new Date().toISOString();
const isConfigurationBlock=(message)=>/\brequired\b|requires |consent|privacy level|not allowed|public HTTPS|unsupported distribution/i.test(message);

async function upsert(state,patch={}){
  const metadata={...(patch.metadata??{}),updatedBy:'distribute-publication',updatedAt:now()};
  await db.query(`insert into distribution_attempts (publication_id,platform,state,external_id,external_url,publish_at,attempts,last_error,metadata) values ($1,$2,$3,$4,$5,$6,case when $3='publishing' then 1 else 0 end,$7,$8::jsonb)
    on conflict (publication_id,platform) do update set state=excluded.state,external_id=coalesce(excluded.external_id,distribution_attempts.external_id),external_url=coalesce(excluded.external_url,distribution_attempts.external_url),publish_at=coalesce(excluded.publish_at,distribution_attempts.publish_at),attempts=distribution_attempts.attempts+case when excluded.state='publishing' then 1 else 0 end,last_error=excluded.last_error,metadata=distribution_attempts.metadata||excluded.metadata,updated_at=now()`,[publicationId,platform,state,patch.externalId??null,patch.externalUrl??null,patch.publishAt??null,patch.lastError??null,JSON.stringify(metadata)]);
}

try{
  const row=(await db.query(`select p.id,p.youtube_video_id,p.state,p.publish_at,p.contains_synthetic_media,p.content_format,p.metadata as publication_metadata,pr.id as production_run_id,pr.metadata as production_metadata,ci.id as content_idea_id from publications p left join production_runs pr on pr.id=p.production_run_id left join content_ideas ci on ci.id=pr.content_idea_id where p.id=$1`,[publicationId])).rows[0];
  if(!row)throw new Error(`Publication ${publicationId} not found`);
  if(platform==='youtube'){
    const state=row.state==='public'?'published':row.state==='scheduled'?'scheduled':row.youtube_video_id?'processing':'blocked';
    await upsert(state,{externalId:row.youtube_video_id??null,publishAt:row.publish_at??null,metadata:{source:'canonical-youtube-publication'}});
    console.log(JSON.stringify({publicationId,platform,state,externalId:row.youtube_video_id??null},null,2));
    process.exitCode=0;
  }else{
    if(row.content_format!=='SHORT_VERTICAL'){
      await upsert('blocked',{lastError:`${platform} Reels/short-video distribution requires a native SHORT_VERTICAL derivative; horizontal masters are never blindly cross-posted.`,metadata:{contentFormat:row.content_format}});
      console.log(JSON.stringify({publicationId,platform,state:'blocked',reason:'native-short-derivative-required'},null,2));
    }else{
      const selectedId=row.publication_metadata?.selectedPackagingId??row.production_metadata?.packagingSelection?.selectedPackagingId??null;
      const packaging=(await db.query(`select title,payload from packaging_variants where content_idea_id=$1 order by case when variant_key=$2 then 0 else 1 end,score desc limit 1`,[row.content_idea_id,selectedId])).rows[0]??{};
      const title=String(packaging.title??row.production_metadata?.topic??'').trim();
      const caption=String(packaging.payload?.socialCaption??packaging.payload?.title??title).trim();
      const renderUri=String(row.publication_metadata?.renderUri??row.production_metadata?.renderUri??'').trim();
      if(!renderUri)throw new Error('Distribution requires a persisted final render URI');
      const durationSeconds=Number(row.publication_metadata?.finalInspection?.durationSeconds??row.production_metadata?.finalInspection?.durationSeconds??0)||undefined;
      await upsert('publishing',{metadata:{contentFormat:row.content_format,productionRunId:row.production_run_id,contentArchetype:row.production_metadata?.contentArchetype??null}});
      try{
        const publisher=createDistributionPublisher(platform,process.env);
        const publicMediaUrl=platform==='instagram'?publicMediaUrlFor({renderUri,productionRunId:row.production_run_id,env:process.env}):null;
        const result=await publisher.publish({fileUri:renderUri,publicMediaUrl,title,caption,durationSeconds,containsSyntheticMedia:Boolean(row.contains_synthetic_media),privacyLevel:process.env.TIKTOK_PRIVACY_LEVEL,disableDuet:process.env.TIKTOK_DISABLE_DUET==='true',disableComment:process.env.TIKTOK_DISABLE_COMMENT==='true',disableStitch:process.env.TIKTOK_DISABLE_STITCH==='true',brandContent:process.env.TIKTOK_BRAND_CONTENT==='true',brandOrganic:process.env.TIKTOK_BRAND_ORGANIC==='true'});
        await upsert(result.state,{externalId:result.externalId,externalUrl:result.externalUrl??null,metadata:{...result.metadata,contentFormat:row.content_format,productionRunId:row.production_run_id}});
        console.log(JSON.stringify({publicationId,platform,...result},null,2));
      }catch(error){
        const message=error instanceof Error?error.message:String(error),blocked=isConfigurationBlock(message);
        await upsert(blocked?'blocked':'retry',{lastError:message,metadata:{contentFormat:row.content_format,productionRunId:row.production_run_id}});
        if(blocked)console.log(JSON.stringify({publicationId,platform,state:'blocked',reason:message},null,2));else throw error;
      }
    }
  }
}finally{await db.close();}
