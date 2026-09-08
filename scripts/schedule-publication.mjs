import { GoogleOAuthTokenProvider } from '@auto-ytb/youtube';
import { NodePostgresSqlClient } from '../packages/runtime-node/index.mjs';

const arg=(name)=>process.argv.find((value)=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const req=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;};
const publicationId=arg('publication-id');
const publishAtRaw=arg('publish-at');
if(!publicationId||!publishAtRaw) throw new Error('Use --publication-id=<uuid> --publish-at=<ISO timestamp>');
const publishAt=new Date(publishAtRaw);
if(!Number.isFinite(publishAt.getTime())||publishAt.getTime()<=Date.now()) throw new Error('publish-at must be a valid future timestamp');

const db=new NodePostgresSqlClient(req('DATABASE_URL'),{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
const oauth=new GoogleOAuthTokenProvider({clientId:req('YOUTUBE_CLIENT_ID'),clientSecret:req('YOUTUBE_CLIENT_SECRET'),refreshToken:req('YOUTUBE_REFRESH_TOKEN')});

try{
  const result=await db.query(`select id,youtube_video_id,state,production_run_id from publications where id=$1`,[publicationId]);
  const publication=result.rows[0];
  if(!publication) throw new Error(`Publication ${publicationId} not found`);
  if(!publication.youtube_video_id) throw new Error('Publication has no YouTube video id');
  if(!['private','reviewed','scheduled'].includes(publication.state)) throw new Error(`Publication state ${publication.state} cannot be scheduled`);

  if(publication.production_run_id){
    const rights=await db.query(`select id,scene_id,source_url,license from production_assets where production_run_id=$1 and provider='source-backed-direct' and (license is null or license='verify-before-public')`,[publication.production_run_id]);
    if(rights.rows.length){
      const refs=rights.rows.slice(0,5).map((row)=>`${row.scene_id ?? row.id}: ${row.source_url ?? 'unknown source'}`).join('; ');
      throw new Error(`Publication blocked: ${rights.rows.length} direct source assets still require license verification before public release. ${refs}`);
    }
  }

  const token=await oauth.getAccessToken();
  const response=await fetch('https://www.googleapis.com/youtube/v3/videos?part=status',{
    method:'PUT',
    headers:{authorization:`Bearer ${token}`,'content-type':'application/json; charset=UTF-8'},
    body:JSON.stringify({id:publication.youtube_video_id,status:{privacyStatus:'private',publishAt:publishAt.toISOString()}}),
  });
  if(!response.ok) throw new Error(`YouTube schedule failed ${response.status}: ${(await response.text()).slice(0,700)}`);
  await db.transaction(async(tx)=>{
    await tx.query(`update publications set state='scheduled',publish_at=$2,updated_at=now() where id=$1`,[publicationId,publishAt]);
    await tx.query(`insert into review_decisions (publication_id,action,publish_at,metadata) values ($1,'schedule',$2,$3::jsonb)`,[publicationId,publishAt,JSON.stringify({youtubeVideoId:publication.youtube_video_id,rightsGate:'passed'})]);
    if(publication.production_run_id){
      const episodes=await tx.query(`select id from series_episodes where production_run_id=$1`,[publication.production_run_id]);
      for(const episode of episodes.rows){
        await tx.query(`update series_episode_memory set canonical=true,active=true where episode_id=$1`,[episode.id]);
        await tx.query(`update series_episodes set status='scheduled',continuity_snapshot=continuity_snapshot||$2::jsonb,updated_at=now() where id=$1`,[episode.id,JSON.stringify({memoryCanonical:true,memoryPromotedAt:new Date().toISOString(),publishAt:publishAt.toISOString()})]);
      }
    }
  });
  console.log(JSON.stringify({publicationId,youtubeVideoId:publication.youtube_video_id,state:'scheduled',publishAt:publishAt.toISOString(),rightsGate:'passed',seriesMemory:'promoted-if-present'},null,2));
} finally { await db.close(); }
