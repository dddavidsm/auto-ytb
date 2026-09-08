import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { GoogleDriveLibraryProvider } from '@auto-ytb/providers';
import { GoogleOAuthTokenProvider } from '@auto-ytb/youtube';
import { NodePostgresSqlClient, NodeUploadAssetLoader } from '../packages/runtime-node/index.mjs';

const arg=(name,fallback)=>process.argv.find((value)=>value.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const req=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;};
const productionRunId=arg('production-run-id');
if(!productionRunId)throw new Error('Use --production-run-id=<uuid>');
const provider=(process.env.CONTENT_LIBRARY_PROVIDER||'google-drive').toLowerCase();
if(provider!=='google-drive')throw new Error(`Unsupported CONTENT_LIBRARY_PROVIDER=${provider}`);
const db=new NodePostgresSqlClient(req('DATABASE_URL'),{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
const oauth=new GoogleOAuthTokenProvider({clientId:req('YOUTUBE_CLIENT_ID'),clientSecret:req('YOUTUBE_CLIENT_SECRET'),refreshToken:req('YOUTUBE_REFRESH_TOKEN')});
const loader=new NodeUploadAssetLoader();
const configPath=resolve(arg('channel-config','config/channels/future-tech-business.example.json'));
const channelConfig=JSON.parse(await readFile(configPath,'utf8'));
const channelKey=String(channelConfig.channelKey??channelConfig.id);
const channelFolder=String(channelConfig.library?.channelFolder??channelKey);
const library=new GoogleDriveLibraryProvider({getAccessToken:()=>oauth.getAccessToken(),rootFolderName:String(channelConfig.library?.rootFolder??process.env.DRIVE_ROOT_FOLDER??'AUTO-YTB')});

const stageFolders={
  opportunity:'01_OPPORTUNITIES',research:'02_RESEARCH',script:'03_SCRIPTS',audio:'04_AUDIO',alignment:'05_ALIGNMENT',visuals:'06_VISUALS',thumbnails:'07_THUMBNAILS',render:'08_RENDERS',published:'09_PUBLISHED',analytics:'10_ANALYTICS',archive:'99_ARCHIVE',
};
const stageDb={opportunity:'research',research:'research',script:'script',audio:'audio',alignment:'alignment',visuals:'visuals',thumbnails:'thumbnails',render:'render',published:'published',analytics:'analytics',archive:'archive'};
function safe(value,max=72){return String(value??'video').normalize('NFKD').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toLowerCase().slice(0,max)||'video';}
function extension(mime,uri=''){const known={'audio/mpeg':'.mp3','audio/wav':'.wav','video/mp4':'.mp4','video/webm':'.webm','image/jpeg':'.jpg','image/png':'.png','application/json':'.json'};return known[mime]??extname(String(uri).split('?')[0])??'';}
function pathFromUri(uri){if(String(uri).startsWith('file://'))return new URL(uri).pathname;if(String(uri).startsWith('/')||String(uri).startsWith('.'))return resolve(String(uri));return null;}

async function existing(relativePath){return (await db.query(`select id,external_id,uri from content_library_items where provider='google-drive' and relative_path=$1 limit 1`,[relativePath])).rows[0]??null;}
async function persistItem({stage,relativePath,result,mimeType,bytes,metadata}){
  await db.query(`insert into content_library_items (production_run_id,channel_id,channel_key,stage,provider,external_id,uri,relative_path,content_type,bytes,metadata) values ($1,$2,$3,$4,'google-drive',$5,$6,$7,$8,$9,$10::jsonb) on conflict (provider,relative_path) do update set external_id=excluded.external_id,uri=excluded.uri,bytes=excluded.bytes,metadata=excluded.metadata`,[productionRunId,context.channel_id,channelKey,stageDb[stage],result.externalId,result.uri,relativePath,mimeType,bytes??result.bytes??null,JSON.stringify(metadata??{})]);
}
async function putJson(stage,fileName,value,metadata={}){
  const relativePath=`${channelFolder}/${stageFolders[stage]}/${videoKey}/${fileName}`;
  const hit=await existing(relativePath);if(hit)return {skipped:true,...hit};
  const result=await library.writeJson({pathSegments:[channelFolder,stageFolders[stage],videoKey],fileName,value,metadata:{productionRunId,channelKey,...metadata}});
  await persistItem({stage,relativePath,result,mimeType:'application/json',bytes:result.bytes,metadata});return result;
}
async function putAsset(stage,fileName,uri,mimeType,metadata={}){
  if(!uri)return null;
  const relativePath=`${channelFolder}/${stageFolders[stage]}/${videoKey}/${fileName}`;
  const hit=await existing(relativePath);if(hit)return {skipped:true,...hit};
  const local=pathFromUri(uri);
  if(!local&&/^procedural:\/\//.test(String(uri)))return null;
  if(!local&&/^https?:\/\//.test(String(uri))&&metadata.sourceBacked){return null;}
  const loaded=await loader.load(uri);
  const result=await library.upload({pathSegments:[channelFolder,stageFolders[stage],videoKey],fileName,mimeType:mimeType||loaded.mimeType,data:loaded.body instanceof Blob?new Uint8Array(await loaded.body.arrayBuffer()):loaded.body,metadata:{productionRunId,channelKey,...metadata}});
  await persistItem({stage,relativePath,result,mimeType:mimeType||loaded.mimeType,bytes:loaded.size,metadata});return result;
}

let context;
let videoKey;
try{
  context=(await db.query(`
    select pr.id,pr.state,pr.total_cost_usd::float,pr.metadata as production_metadata,pr.created_at,
      ci.id as content_idea_id,ci.working_title,ci.premise,ci.hook_hypothesis,ci.opportunity_id,
      o.angle,o.score::float as opportunity_score,o.signals,o.risks,o.rationale,o.recommended_format,t.canonical_name,
      c.id as channel_id,c.channel_key,c.identity,c.voice_profile,c.autonomy_policy,c.library_policy,
      p.id as publication_id,p.youtube_video_id,p.state as publication_state,p.publish_at,p.metadata as publication_metadata,p.content_format
    from production_runs pr
    join content_ideas ci on ci.id=pr.content_idea_id
    left join opportunities o on o.id=ci.opportunity_id
    left join topics t on t.id=o.topic_id
    left join publications p on p.production_run_id=pr.id
    left join channels c on c.id=p.channel_id or (p.id is null and c.channel_key=$2 and c.is_owned=true)
    where pr.id=$1 order by p.created_at desc nulls last limit 1`,[productionRunId,channelKey])).rows[0];
  if(!context)throw new Error(`Production run ${productionRunId} not found`);
  const created=new Date(context.created_at).toISOString().slice(0,10);
  videoKey=`${created}__${safe(context.working_title||context.angle||context.canonical_name)}__${String(productionRunId).slice(0,8)}`;
  const [research,script,qa,economics,alignmentRows,assets,analytics]=await Promise.all([
    db.query(`select * from research_dossiers where opportunity_id=$1 order by created_at desc limit 1`,[context.opportunity_id]),
    db.query(`select * from scripts where content_idea_id=$1 order by version desc,created_at desc limit 1`,[context.content_idea_id]),
    db.query(`select * from qa_reports where production_run_id=$1 order by created_at desc limit 1`,[productionRunId]),
    db.query(`select * from video_economics where production_run_id=$1 order by captured_at desc limit 1`,[productionRunId]),
    db.query(`select * from audio_alignment_runs where production_run_id=$1 order by created_at desc limit 1`,[productionRunId]),
    db.query(`select * from production_assets where production_run_id=$1 order by created_at asc`,[productionRunId]),
    context.publication_id?db.query(`select * from analytics_snapshots where publication_id=$1 order by captured_at desc limit 1`,[context.publication_id]):Promise.resolve({rows:[]}),
  ]);
  const manifestPath=resolve(process.env.LOCAL_STORAGE_ROOT||'.data/storage','projects',productionRunId,'manifest.json');
  let manifest=null;
  try{manifest=JSON.parse(await readFile(manifestPath,'utf8'));}catch{}
  if(!alignmentRows.rows[0]&&manifest?.voice?.uri&&manifest?.voice?.durationSeconds){
    await db.query(`insert into audio_alignment_runs (production_run_id,provider,model,language,voice_id,audio_uri,duration_seconds,alignment,alignment_confidence) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,[productionRunId,manifest.voice.provider??'unknown',manifest.voice.model??null,manifest.voice.language??manifest.script?.language??channelConfig.language,manifest.voice.voiceId??channelConfig.voiceProfile?.voiceId??'unknown',manifest.voice.uri,Number(manifest.voice.durationSeconds),JSON.stringify(manifest.voice.alignment??{}),manifest.voice.alignment?100:null]);
    alignmentRows.rows[0]={provider:manifest.voice.provider,model:manifest.voice.model,language:manifest.voice.language,voice_id:manifest.voice.voiceId,audio_uri:manifest.voice.uri,duration_seconds:manifest.voice.durationSeconds,alignment:manifest.voice.alignment??{}};
  }
  const opportunityPayload={id:context.opportunity_id,topic:context.canonical_name,angle:context.angle,score:context.opportunity_score,signals:context.signals,risks:context.risks,rationale:context.rationale,recommendedFormat:context.recommended_format};
  await putJson('opportunity','opportunity.json',opportunityPayload);
  if(research.rows[0])await putJson('research','research.json',research.rows[0]);
  if(script.rows[0])await putJson('script','script.json',script.rows[0]);
  if(alignmentRows.rows[0])await putJson('alignment','alignment.json',alignmentRows.rows[0]);
  if(manifest)await putJson('visuals','manifest.json',manifest);
  if(qa.rows[0])await putJson('render','qa.json',qa.rows[0]);
  if(economics.rows[0])await putJson('render','cost-report.json',economics.rows[0]);
  if(context.publication_id)await putJson('published','publication.json',{publicationId:context.publication_id,youtubeVideoId:context.youtube_video_id,state:context.publication_state,publishAt:context.publish_at,contentFormat:context.content_format,metadata:context.publication_metadata});
  if(analytics.rows[0])await putJson('analytics','latest-analytics.json',analytics.rows[0]);

  const voice=manifest?.voice??alignmentRows.rows[0]&&{uri:alignmentRows.rows[0].audio_uri,mimeType:'audio/mpeg'};
  if(voice?.uri)await putAsset('audio',`narration${extension(voice.mimeType??'audio/mpeg',voice.uri)}`,voice.uri,voice.mimeType??'audio/mpeg',{kind:'narration',language:manifest?.voice?.language??channelConfig.language,voiceId:manifest?.voice?.voiceId??channelConfig.voiceProfile?.voiceId});
  const allAssets=manifest?.assets??assets.rows.map((row)=>({id:row.id,sceneId:row.scene_id,uri:row.uri,mimeType:row.asset_type,provider:row.provider,model:row.model,generated:row.generated,sourceIds:row.source_ids,sourceUrl:row.source_url,license:row.license,costUsd:Number(row.cost_usd??0),metadata:row.metadata}));
  let visualIndex=0;
  for(const asset of allAssets){
    if(!asset?.uri||String(asset.uri).startsWith('procedural://'))continue;
    if(asset.sceneId&&String(asset.sceneId).startsWith('thumbnail:'))continue;
    if(asset.provider==='source-backed-direct')continue;
    const ext=extension(asset.mimeType,asset.uri)||'.bin';
    await putAsset('visuals',`${String(visualIndex++).padStart(3,'0')}__${safe(asset.sceneId||asset.id,40)}${ext}`,asset.uri,asset.mimeType,{sceneId:asset.sceneId??null,provider:asset.provider,model:asset.model??null,generated:Boolean(asset.generated),license:asset.license??null,sourceIds:asset.sourceIds??[],sourceUrl:asset.sourceUrl??null});
  }
  const thumbnails=manifest?.thumbnails??[];
  for(const thumbnail of thumbnails){const ext=extension(thumbnail.mimeType,thumbnail.uri)||'.jpg';await putAsset('thumbnails',`${safe(thumbnail.packagingId||thumbnail.id,48)}${ext}`,thumbnail.uri,thumbnail.mimeType,{packagingId:thumbnail.packagingId??null,text:thumbnail.text??null});}
  const renderUri=context.production_metadata?.renderUri??manifest?.renderUri??null;
  if(renderUri)await putAsset('render','final.mp4',renderUri,'video/mp4',{youtubeVideoId:context.youtube_video_id??null});

  const librarySummary={productionRunId,channelKey,videoKey,rootFolder:channelConfig.library?.rootFolder??process.env.DRIVE_ROOT_FOLDER??'AUTO-YTB',channelFolder,finalizedAt:new Date().toISOString()};
  await putJson('archive','library-index.json',librarySummary);
  await db.query(`update production_runs set metadata=metadata||$2::jsonb,updated_at=now() where id=$1`,[productionRunId,JSON.stringify({library:{provider:'google-drive',videoKey,channelFolder,finalizedAt:librarySummary.finalizedAt}})]);
  console.log(JSON.stringify(librarySummary,null,2));
} finally {await db.close();}
