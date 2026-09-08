import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { GoogleDriveLibraryProvider } from '@auto-ytb/providers';
import { GoogleOAuthTokenProvider } from '@auto-ytb/youtube';
import { NodePostgresSqlClient } from '../packages/runtime-node/index.mjs';

const arg=(name,fallback)=>process.argv.find((value)=>value.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const req=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;};
const productionRunId=arg('production-run-id');if(!productionRunId)throw new Error('Use --production-run-id=<uuid>');
const configPath=resolve(arg('channel-config','config/channels/future-tech-business.example.json'));
const channel=JSON.parse(await readFile(configPath,'utf8'));
const channelKey=String(channel.channelKey??channel.id),channelFolder=String(channel.library?.channelFolder??channelKey),rootFolder=String(channel.library?.rootFolder??process.env.DRIVE_ROOT_FOLDER??'AUTO-YTB');
const db=new NodePostgresSqlClient(req('DATABASE_URL'),{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
const oauth=new GoogleOAuthTokenProvider({clientId:req('YOUTUBE_CLIENT_ID'),clientSecret:req('YOUTUBE_CLIENT_SECRET'),refreshToken:req('YOUTUBE_REFRESH_TOKEN')});
const library=new GoogleDriveLibraryProvider({getAccessToken:()=>oauth.getAccessToken(),rootFolderName:rootFolder});
const safe=(value)=>String(value??'series').normalize('NFKD').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toLowerCase().slice(0,84)||'series';

async function put(relativePath,pathSegments,fileName,value,metadata){
  const exists=(await db.query(`select id,external_id,uri from content_library_items where provider='google-drive' and relative_path=$1 limit 1`,[relativePath])).rows[0];
  if(exists)return{skipped:true,...exists};
  const result=await library.writeJson({pathSegments,fileName,value,metadata});
  await db.query(`insert into content_library_items (production_run_id,channel_id,channel_key,stage,provider,external_id,uri,relative_path,content_type,bytes,metadata) values ($1,$2,$3,'archive','google-drive',$4,$5,$6,'application/json',$7,$8::jsonb) on conflict (provider,relative_path) do nothing`,[productionRunId,metadata.channelId,channelKey,result.externalId,result.uri,relativePath,result.bytes??null,JSON.stringify(metadata)]);
  return result;
}

try{
  const row=(await db.query(`select se.id as episode_id,se.episode_key,se.season_number,se.episode_number,se.continuity_status,se.memory_compiled_at,se.continuity_snapshot,
      s.id as series_id,s.series_key,s.title as series_title,s.audience_mode,s.current_bible_version,c.id as channel_id,
      smc.summary,smc.canonical_facts,smc.arc_updates,smc.next_episode_seeds,smc.conflicts,smc.model,smc.created_at as compiled_at,
      b.continuity_key as bible_continuity_key
    from series_episodes se join series s on s.id=se.series_id join channels c on c.id=s.channel_id
    join series_memory_compilations smc on smc.episode_id=se.id
    left join series_bibles b on b.id=se.bible_version_id
    where se.production_run_id=$1 limit 1`,[productionRunId])).rows[0];
  if(!row){console.log(JSON.stringify({productionRunId,archived:false,reason:'not-a-compiled-series-episode'},null,2));process.exit(0);}
  if(row.continuity_status!=='passed'||!row.memory_compiled_at)throw new Error(`Series memory is not release-ready: ${row.continuity_status}`);
  const [canonResult,arcsResult,qualityResult]=await Promise.all([
    db.query(`select memory_type,memory_key,payload,importance::float,canonical,active,episode_id,created_at from series_episode_memory where series_id=$1 and active=true and canonical=true order by importance desc,created_at desc limit 100`,[row.series_id]),
    db.query(`select arc_key,title,status,summary,state,updated_at from series_story_arcs where series_id=$1 order by case status when 'active' then 0 when 'planned' then 1 else 2 end,updated_at desc`,[row.series_id]),
    db.query(`select report_type,status,score::float,report,model,updated_at from series_episode_quality_reports where episode_id=$1 order by report_type`,[row.episode_id]),
  ]);
  const canon=canonResult.rows,arcs=arcsResult.rows,qualityReports=qualityResult.rows;
  const base=[channelFolder,'SERIES',safe(row.series_key),'05_EPISODES',safe(row.episode_key),'11_MEMORY'];
  const prefix=base.join('/');
  const meta={channelId:row.channel_id,channelKey,seriesId:row.series_id,seriesKey:row.series_key,episodeId:row.episode_id,episodeKey:row.episode_key,bibleVersion:row.current_bible_version,bibleContinuityKey:row.bible_continuity_key};
  const memoryDoc={series:{id:row.series_id,key:row.series_key,title:row.series_title,audienceMode:row.audience_mode},episode:{id:row.episode_id,key:row.episode_key,season:row.season_number,number:row.episode_number,continuityStatus:row.continuity_status,memoryCompiledAt:row.memory_compiled_at},summary:row.summary,canonicalFacts:row.canonical_facts??[],arcUpdates:row.arc_updates??[],nextEpisodeSeeds:row.next_episode_seeds??[],conflicts:row.conflicts??[],model:row.model,compiledAt:row.compiled_at,continuitySnapshot:row.continuity_snapshot??{}};
  const canonDoc={seriesKey:row.series_key,afterEpisodeKey:row.episode_key,bibleVersion:row.current_bible_version,bibleContinuityKey:row.bible_continuity_key,canonicalMemory:canon,storyArcs:arcs,capturedAt:new Date().toISOString()};
  const qualityDoc={seriesKey:row.series_key,episodeKey:row.episode_key,audienceMode:row.audience_mode,reports:qualityReports,capturedAt:new Date().toISOString()};
  const memoryResult=await put(`${prefix}/memory.json`,base,'memory.json',memoryDoc,{...meta,kind:'episode-memory'});
  const canonArchive=await put(`${prefix}/canon-after-episode.json`,base,'canon-after-episode.json',canonDoc,{...meta,kind:'canonical-series-snapshot'});
  const qualityArchive=await put(`${prefix}/quality-gates.json`,base,'quality-gates.json',qualityDoc,{...meta,kind:'episode-quality-gates'});
  console.log(JSON.stringify({productionRunId,archived:true,seriesKey:row.series_key,episodeKey:row.episode_key,memoryUri:memoryResult.uri??null,canonUri:canonArchive.uri??null,qualityUri:qualityArchive.uri??null},null,2));
} finally {await db.close();}
