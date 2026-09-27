import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { runContentPipeline } from '@auto-ytb/orchestrator';
import { searchPexelsVideo, searchPixabayVideo, searchWikimediaVideo, selectStructuralExperiment } from '@auto-ytb/production';
import { inferContentArchetype } from '@auto-ytb/os';
import { ResearchRepository, ScriptRepository, ProductionRepository, PublicationRepository } from '@auto-ytb/persistence';
import { createLiveRuntime } from '../packages/runtime-node/factory.mjs';
import { resolveVoiceId } from '../packages/runtime-node/voice-routing.mjs';
import { buildCreativeLearningGuidance } from './lib/creative-guidance.mjs';
import { mirrorFile } from './lib/media-proxy.mjs';

const arg=(name,fallback)=>process.argv.find((v)=>v.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const topic=arg('topic');
if(!topic)throw new Error('Use --topic="..."');
const sourceFootagePath=arg('source-footage',null);
let sourceFootage;
let sourceFootageGuidance;
if(sourceFootagePath){
  const parsed=JSON.parse(await readFile(resolve(sourceFootagePath),'utf8'));
  sourceFootage=Array.isArray(parsed)?parsed:parsed?.clips;
  sourceFootageGuidance=typeof parsed?.editorialGuidance==='string'?parsed.editorialGuidance.trim():undefined;
  if(!Array.isArray(sourceFootage))throw new Error('--source-footage must point to a JSON array or an object with a clips array');
  for(const clip of sourceFootage){
    if(!clip?.id||!clip?.uri||!clip?.license||!['CLEARED','VERIFY','BLOCKED'].includes(clip.rightsStatus))throw new Error(`Invalid source footage entry ${clip?.id??'(missing id)'}: id, uri, license and rightsStatus are required`);
  }
}
const configPath=resolve(arg('channel-config','config/channels/future-tech-business.example.json'));
const channel=JSON.parse(await readFile(configPath,'utf8'));
const requestedFormat=String(arg('format',channel.preferredFormat==='SHORT_VERTICAL'?'SHORT_VERTICAL':'LONG_HORIZONTAL')).toUpperCase();
const contentFormat=['SHORT_VERTICAL','SHORT_HORIZONTAL'].includes(requestedFormat)?requestedFormat:'LONG_HORIZONTAL';
const isShort=contentFormat!=='LONG_HORIZONTAL';
const requestedProductionMode=String(process.env.AUTO_YTB_PRODUCTION_MODE||'AUTO').trim().toUpperCase();
const channelNiche=[channel.id,channel.positioning,...(channel.themes??[]),...(channel.channelType==='UMBRELLA_OPPORTUNITY_DRIVEN'?['documentary','explainer','factual','research','evidence-led']:[])].filter(Boolean).join(' ');
const routedArchetype=inferContentArchetype({topic,contentFormat,channelNiche});
const sourceFirst=Boolean(sourceFootage?.length)
  || requestedProductionMode==='SOURCE_FIRST'
  || (requestedProductionMode==='AUTO'
    && routedArchetype?.profile?.researchRequired!==false
    && routedArchetype?.profile?.requiresCanonicalCast!==true
    && routedArchetype?.profile?.realityMode!=='REALISTIC_SYNTHETIC');
const sourcedOnly=sourceFirst && (requestedProductionMode==='AUTO'||requestedProductionMode==='SOURCE_FIRST'||Boolean(sourceFootagePath));
console.log(`[live-pipeline] start format=${contentFormat} topic=${topic.slice(0,120)}`);

const sourceDiscovery={mode:sourceFirst?'SOURCE_FIRST':'MIXED_MEDIA',requestedMode:requestedProductionMode,queries:[],providers:[],selected:[],failed:[]};
const sourceFootageCacheRoot=resolve(process.env.LOCAL_STORAGE_ROOT||'.data/storage','source-cache');
const safeFilePart=(value)=>String(value||'source').replace(/[^a-z0-9._-]+/gi,'-').slice(0,80)||'source';
const extensionFor=(candidate)=>{
  const mime=String(candidate?.metadata?.mime||'').toLowerCase();
  if(mime.includes('webm'))return 'webm';
  if(mime.includes('quicktime'))return 'mov';
  return 'mp4';
};
function sourceTopicProfile(value){
  const text=String(value||'').toLowerCase();
  if(/battery|batteries|grid-scale storage|energy storage|renewable electricity|wind and solar/.test(text)){
    return{
      queries:[
        'grid scale battery energy storage facility video',
        'battery storage renewable electricity power grid video',
        'wind solar transmission substation energy infrastructure video',
      ],
      include:/battery|batteries|energy storage|storage facility|lithium|cell|solar|wind turbine|renewable|power grid|electric|electricity|substation|transmission|transformer|utility|infrastructure/i,
      exclude:/person|people|hiker|hiking|forest trail|railway|railroad|train|prosthetic|cyborg|robot hand|printed hand|headset|hacker|stock exchange|trading|crypto|gaming|cartoon|illustration/i,
    };
  }
  if(/data cent(er|re)|power grid|electric grid|electricity|energy bottleneck|grid operator|iea|eia/.test(text)){
    return{
      queries:[
        'data center server room electricity power infrastructure video',
        'power grid transmission lines substation energy infrastructure video',
        'wind turbines power plant industrial cooling data center video',
      ],
      include:/data cent(?:er|re)|server|server room|power grid|electric|electricity|energy|power plant|substation|transmission|transformer|utility|wind turbine|solar farm|industrial|cooling|charger|infrastructure|cityscape/i,
      exclude:/person|people|hiker|hiking|forest trail|railway|railroad|train|prosthetic|cyborg|robot hand|printed hand|headset|hacker|stock exchange|trading|crypto|gaming|cartoon|illustration/i,
    };
  }
  const stop=new Set('about after again against also because being between could from have into more other over than that their there these they this through using what when where which with would your'.split(' '));
  const terms=[...new Set(text.replace(/[^a-z0-9áéíóúüñ\s-]/gi,' ').split(/\s+/).filter((word)=>word.length>=5&&!stop.has(word)))].slice(0,8);
  return{queries:[`${terms.join(' ')} real video footage`,`${terms.join(' ')} process demonstration`].filter(Boolean),include:terms.length?new RegExp(terms.map((term)=>term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'i'):null,exclude:null};
}
async function cacheMovingVideo(candidate){
  const downloadUrl=String(candidate?.metadata?.downloadUrl||'').trim();
  if(!downloadUrl)throw new Error(`Source candidate ${candidate?.id||'unknown'} has no download URL`);
  const digest=createHash('sha256').update(`${candidate.sourceKey||candidate.id}|${downloadUrl}`).digest('hex').slice(0,24);
  const dir=resolve(sourceFootageCacheRoot,digest);
  const localPath=resolve(dir,`${safeFilePart(candidate.id)}.${extensionFor(candidate)}`);
  let info;
  try{info=await stat(localPath);}catch{info=null;}
  if(!info?.isFile()||info.size<1024){
    const response=await fetch(downloadUrl,{headers:{'user-agent':'AUTO-YTB/1.0 rights-aware footage cache'},signal:AbortSignal.timeout(45000)});
    if(!response.ok)throw new Error(`Source download failed ${response.status} for ${candidate.id}`);
    const contentLength=Number(response.headers.get('content-length')||0);
    if(contentLength>180*1024*1024)throw new Error(`Source candidate ${candidate.id} exceeds 180 MB safety limit`);
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(bytes.byteLength<1024)throw new Error(`Source candidate ${candidate.id} returned an empty media file`);
    await mkdir(dir,{recursive:true});
    await writeFile(localPath,bytes);
    info=await stat(localPath);
  }
  return {localPath,uri:pathToFileURL(localPath).toString(),size:info.size,digest};
}
async function discoverMovingSourceFootage(){
  const profile=sourceTopicProfile(topic);
  const queries=profile.queries.map((value)=>String(value).replace(/\s+/g,' ').trim()).filter(Boolean).filter((value,index,array)=>array.indexOf(value)===index).slice(0,3);
  sourceDiscovery.queries=queries;
  const providers=[
    ['Pexels',searchPexelsVideo],
    ['Pixabay',searchPixabayVideo],
    ['Wikimedia Commons',searchWikimediaVideo],
  ];
  const raw=[];
  for(const query of queries){
    const results=await Promise.all(providers.map(async([name,search])=>{
      try{
        const result=await search(query,{orientation:isShort?'portrait':undefined,limit:20,perPage:20});
        sourceDiscovery.providers.push({provider:result.provider||name,query,capability:result.capability,totalResults:result.totalResults??null});
        return result;
      }catch(error){
        sourceDiscovery.failed.push({provider:name,query,error:String(error?.message||error).slice(0,240)});
        return null;
      }
    }));
    raw.push(...results.filter(Boolean).flatMap((result)=>result.candidates||[]));
  }
  const seen=new Set();
  const eligible=raw.filter((candidate)=>{
    const key=String(candidate.sourceKey||candidate.visualFingerprint||candidate.id);
    const duration=Number(candidate.usableDurationSeconds??candidate.durationSeconds??0);
    const rights=['PUBLISHABLE_CONFIRMED','PUBLISHABLE_WITH_ATTRIBUTION'].includes(String(candidate.rightsTier));
    const title=String(candidate?.metadata?.title||candidate.id||'');
    const relevant=!profile.include||profile.include.test(title);
    const unrelated=profile.exclude?.test(title)??false;
    if(!relevant||unrelated){sourceDiscovery.failed.push({provider:candidate.provider,id:candidate.id,error:'Candidate rejected: title is not semantically relevant to the brief'});return false;}
    if(seen.has(key)||!rights||duration<3||!candidate?.metadata?.downloadUrl)return false;
    seen.add(key);return true;
  }).sort((a,b)=>{
    const rightsScore=(candidate)=>String(candidate.rightsTier)==='PUBLISHABLE_CONFIRMED'?2:1;
    return rightsScore(b)-rightsScore(a)
      || Number(b.width||0)*Number(b.height||0)-Number(a.width||0)*Number(a.height||0)
      || Number(b.usableDurationSeconds||b.durationSeconds||0)-Number(a.usableDurationSeconds||a.durationSeconds||0);
  }).slice(0,Number(process.env.SOURCE_FOOTAGE_MAX_CLIPS||12));
  for(const candidate of eligible){
    try{
      const cached=await cacheMovingVideo(candidate);
      let remote=null;
      try{
        remote=await mirrorFile(cached.uri,`source-cache/${cached.digest}.${extensionFor(candidate)}`,String(candidate?.metadata?.mime||'video/mp4'));
      }catch(error){
        // R2 mirroring is durable provenance, but it is not required to render a
        // freshly downloaded, rights-cleared local source clip. Provider-side
        // proxy auth/rate-limit jitter must not turn valid footage into an empty
        // source catalogue; the final MP4 still goes through the required R2
        // persistence gate later in the pipeline.
        sourceDiscovery.failed.push({provider:candidate.provider,id:candidate.id,error:`Media mirror deferred: ${String(error?.message||error).slice(0,240)}`});
      }
      const duration=Number(candidate.usableDurationSeconds??candidate.durationSeconds??0);
      const license=String(candidate?.metadata?.license||`${candidate.provider} ${candidate.rightsTier}; attribution required`).replace(/\s+/g,' ').trim();
      const footage={id:`discovered-${safeFilePart(candidate.id)}`,uri:cached.uri,title:String(candidate?.metadata?.title||candidate.id),sourceUrl:String(candidate.sourceUrl||candidate?.metadata?.sourceUrl||''),sourceId:String(candidate.sourceKey||candidate.id),license,rightsStatus:'CLEARED',startSec:0,...(duration>0?{endSec:duration}:{}),cropMode:'CENTER'};
      sourceFootage.push(footage);
      sourceDiscovery.selected.push({id:footage.id,provider:candidate.provider,sourceKey:candidate.sourceKey||candidate.id,title:footage.title,sourceUrl:footage.sourceUrl,license,localBytes:cached.size,remoteKey:remote?.key??null});
    }catch(error){
      sourceDiscovery.failed.push({provider:candidate.provider,id:candidate.id,error:String(error?.message||error).slice(0,240)});
    }
  }
  if(!sourceFootage.length){
    // A retry may hit a transient provider/proxy failure even though an earlier
    // attempt already downloaded authorized clips. Rehydrate only matching
    // moving-video entries from the local source cache; never invent metadata
    // and never fall back to stills or synthetic media.
    try{
      const entries=await readdir(sourceFootageCacheRoot,{withFileTypes:true});
      const discoveryFiles=entries.filter((entry)=>entry.isFile()&&entry.name.startsWith('discovery-')&&entry.name.endsWith('.json'));
      for(const entry of discoveryFiles.sort((a,b)=>b.name.localeCompare(a.name))){
        const snapshot=JSON.parse(await readFile(resolve(sourceFootageCacheRoot,entry.name),'utf8'));
        for(const item of Array.isArray(snapshot?.selected)?snapshot.selected:[]){
          const title=String(item.title||item.id||'');
          if(profile.include&&!profile.include.test(title))continue;
          if(profile.exclude?.test(title))continue;
          const remoteKey=String(item.remoteKey||'');
          const digestMatch=remoteKey.match(/^source-cache\/([a-f0-9]{24})\.(mp4|webm|mov)$/i);
          if(!digestMatch)continue;
          const cacheDir=resolve(sourceFootageCacheRoot,digestMatch[1]);
          const cachedFiles=await readdir(cacheDir,{withFileTypes:true}).catch(()=>[]);
          const cachedFile=cachedFiles.find((candidate)=>candidate.isFile()&&/\.(mp4|webm|mov)$/i.test(candidate.name));
          if(!cachedFile)continue;
          const localPath=resolve(cacheDir,cachedFile.name);
          const info=await stat(localPath).catch(()=>null);
          if(!info?.isFile()||info.size<1024)continue;
          const id=String(item.id||`cached-${digestMatch[1]}`);
          if(sourceFootage.some((clip)=>clip.id===id))continue;
          sourceFootage.push({id,uri:pathToFileURL(localPath).toString(),title,sourceUrl:String(item.sourceUrl||''),sourceId:String(item.sourceKey||id),license:String(item.license||`${item.provider||'source'} PUBLISHABLE_WITH_ATTRIBUTION; attribution required`),rightsStatus:'CLEARED',startSec:0,cropMode:'CENTER'});
          sourceDiscovery.selected.push({id,provider:item.provider||'cached',sourceKey:item.sourceKey||id,title,sourceUrl:String(item.sourceUrl||''),license:String(item.license||''),localBytes:info.size,remoteKey});
          if(sourceFootage.length>=Number(process.env.SOURCE_FOOTAGE_MAX_CLIPS||12))break;
        }
        if(sourceFootage.length)break;
      }
    }catch(error){
      sourceDiscovery.failed.push({provider:'local-cache',error:String(error?.message||error).slice(0,240)});
    }
  }
  await mkdir(resolve(sourceFootageCacheRoot),{recursive:true});
  await writeFile(resolve(sourceFootageCacheRoot,`discovery-${createHash('sha256').update(`${topic}|${Date.now()}`).digest('hex').slice(0,16)}.json`),JSON.stringify(sourceDiscovery,null,2));
  if(!sourceFootage.length)throw new Error('SOURCE_FIRST_NO_PUBLISHABLE_FOOTAGE: no se encontró ningún clip de vídeo en movimiento con derechos publicables y descarga válida');
}
if(!Array.isArray(sourceFootage))sourceFootage=[];
if(sourceFootage.length){
  sourceDiscovery.selected=sourceFootage.map((clip)=>({id:clip.id,provider:'supplied',sourceKey:clip.sourceId??clip.id,title:clip.title??clip.id,sourceUrl:clip.sourceUrl??null,license:clip.license,rightsStatus:clip.rightsStatus}));
}
if(sourceFirst&&!sourceFootage.length)await discoverMovingSourceFootage();
if(sourceFirst){
  sourceFootageGuidance=[sourceFootageGuidance,'HARD VISUAL SOURCE LOCK: use only authorized moving video clips matched to the beats; no stills, slides, charts, source cards, generated images, fake motion or synthetic filler; block the run when a beat lacks moving-footage coverage.'].filter(Boolean).join('\n');
}

function driveArchiveConfigured(env=process.env){
  return ['DRIVE_CLIENT_ID','DRIVE_CLIENT_SECRET','DRIVE_REFRESH_TOKEN','DRIVE_ROOT_FOLDER_ID'].every((name)=>String(env[name]??'').trim().length>0);
}
function archiveProductionRun(runId, channelConfigPath){
  return new Promise((resolveArchive,rejectArchive)=>{
    const child=spawn(process.execPath,['scripts/finalize-production.mjs',`--production-run-id=${runId}`,`--channel-config=${channelConfigPath}`],{env:{...process.env},stdio:'inherit',windowsHide:false});
    child.once('error',rejectArchive);
    child.once('close',(code,signal)=>{
      if(code===0)return resolveArchive();
      rejectArchive(new Error(`Google Drive archive failed${signal?` (${signal})`:''} with exit code ${code}`));
    });
  });
}
// Content-archetype inference must see the selected channel domain. Without this context a
// factual AI/business opportunity can fall through to GENERAL_STORY (creative fiction).
const runtimeEnv={...process.env,AUTO_YTB_CONTENT_TOPIC:topic,AUTO_YTB_CONTENT_FORMAT:contentFormat,AUTO_YTB_CHANNEL_NICHE:channelNiche,...(sourceFirst?{VIDEO_PROVIDER:'none',...(isShort?{IMAGE_PROVIDER:'none'}:{})}:{}),AUTO_YTB_PRODUCTION_MODE:requestedProductionMode};
const runtime=createLiveRuntime(runtimeEnv);
if(!runtime.db)throw new Error('DATABASE_URL is required for live pipeline durability');
console.log(`[live-pipeline] runtime ready archetype=${runtime.archetypeDecision?.archetype??'unknown'} db=ready`);
const db=runtime.db;
let productionRunId;

function packagingGuidanceFromMetrics(metrics){
  if(!metrics||Number(metrics.sample_size??0)<3)return undefined;
  const guidance=[];const hook=metrics.strong_hook_rate==null?null:Number(metrics.strong_hook_rate),avp=metrics.average_view_percentage==null?null:Number(metrics.average_view_percentage),share=metrics.share_rate==null?null:Number(metrics.share_rate);
  if(hook!=null&&hook<0.55)guidance.push('Recent videos in this format show weak early retention: make the core promise understandable immediately and prefer concrete stakes over abstract wording.');
  else if(hook!=null&&hook>=0.75)guidance.push('Recent videos in this format show strong early retention: preserve immediate comprehension while allowing one stronger curiosity gap.');
  if(avp!=null&&avp<45)guidance.push('Average percentage viewed for this format is weak: packaging must tightly match the actual payoff and avoid over-broad promises.');
  else if(avp!=null&&avp>=60)guidance.push('Average percentage viewed for this format is strong: favor precise differentiated angles that reward continued viewing.');
  if(share!=null&&share>=1)guidance.push('Share rate is comparatively strong: retain packaging that communicates a surprising, useful or conversation-worthy insight without sensationalism.');
  return guidance.length?guidance.join('\n'):undefined;
}

function productionProfileFromMetrics(metrics,base,format){
  const sample=Number(metrics?.sample_size??0),short=format!=='LONG_HORIZONTAL',durationBounds=short?{min:20,max:180}:{min:480,max:900},sceneBounds=short?{min:2.5,max:8,base:Number(base.targetSceneDurationSec??4.5)}:{min:5,max:16,base:Number(base.targetSceneDurationSec??10)},costFloor=short?2:8;
  if(sample<3)return{sampleSize:sample,targetDurationSec:base.targetDurationSec,targetSceneDurationSec:Math.max(sceneBounds.min,Math.min(sceneBounds.max,sceneBounds.base)),maxCostUsd:base.maxCostUsd,scriptGuidance:undefined,adapted:false};
  const hook=metrics.strong_hook_rate==null?null:Number(metrics.strong_hook_rate),avp=metrics.average_view_percentage==null?null:Number(metrics.average_view_percentage),roi=metrics.average_roi==null?null:Number(metrics.average_roi);
  let durationFactor=1,targetSceneDurationSec=sceneBounds.base,costFactor=1;const guidance=[];
  if(hook!=null&&hook<0.55){durationFactor-=short?0.08:0.05;targetSceneDurationSec*=0.85;guidance.push('Front-load the viewer promise and stakes; remove contextual throat-clearing.');}
  else if(hook!=null&&hook>=0.75)guidance.push('Early retention is strong. Preserve the opening pattern and only deepen after the promise is clear.');
  if(avp!=null&&avp<45){durationFactor-=short?0.12:0.10;targetSceneDurationSec*=0.86;guidance.push('Compress exposition and increase visual/narrative progression density.');}
  else if(avp!=null&&avp>=60){durationFactor+=short?0.04:0.08;targetSceneDurationSec*=1.08;guidance.push('Sustained viewing is strong; allow modestly deeper development only where it adds payoff.');}
  if(roi!=null&&roi>1){costFactor=1.15;guidance.push('Economics are positive for this format. Spend selectively on hook/reveal/payoff moments.');}
  else if(roi!=null&&roi<0){costFactor=0.82;targetSceneDurationSec*=1.08;guidance.push('Economics are negative for this format. Prefer lower-cost visual solutions unless premium media clearly improves a key moment.');}
  const targetDurationSec=Math.round(Math.max(durationBounds.min,Math.min(durationBounds.max,base.targetDurationSec*durationFactor)));
  targetSceneDurationSec=Math.round(Math.max(sceneBounds.min,Math.min(sceneBounds.max,targetSceneDurationSec))*10)/10;
  const maxCostUsd=Math.round(Math.max(costFloor,Math.min(base.maxCostUsd*1.2,base.maxCostUsd*costFactor))*100)/100;
  return{sampleSize:sample,targetDurationSec,targetSceneDurationSec,maxCostUsd,scriptGuidance:guidance.length?guidance.join('\n'):undefined,adapted:true,metrics:{strongHookRate:hook,averageViewPercentage:avp,averageRoi:roi}};
}

function packagingLearningFromRows(rows){
  const attrs=['curiosity','clarity','credibility','differentiation'],grouped=new Map(attrs.map((attribute)=>[attribute,[]])),publications=new Set();
  for(const row of rows){if(!grouped.has(row.feature_key))continue;const value=row.feature_value??{},x=Number(value.attributeValue),y=Number(value.outcomeScore);if(!Number.isFinite(x)||!Number.isFinite(y))continue;grouped.get(row.feature_key).push({x,y,strength:Number(row.strength??50)});if(row.publication_id)publications.add(String(row.publication_id));}
  const attributes=[];
  for(const attribute of attrs){const points=grouped.get(attribute);if(!points.length){attributes.push({attribute,sampleSize:0,slope:0,confidence:0});continue;}const weightSum=points.reduce((s,p)=>s+Math.max(1,p.strength),0),meanX=points.reduce((s,p)=>s+p.x*Math.max(1,p.strength),0)/weightSum,meanY=points.reduce((s,p)=>s+p.y*Math.max(1,p.strength),0)/weightSum,covariance=points.reduce((s,p)=>s+(p.x-meanX)*(p.y-meanY)*Math.max(1,p.strength),0),variance=points.reduce((s,p)=>s+(p.x-meanX)**2*Math.max(1,p.strength),0),slope=variance>0?covariance/variance:0;attributes.push({attribute,sampleSize:points.length,slope:Math.max(-0.8,Math.min(0.8,slope)),confidence:Math.min(1,points.length/12)});}
  return{sampleSize:publications.size,attributes};
}

function structuralLearningFromRows(rows){
  const grouped=new Map(),publications=new Set();
  for(const row of rows){const value=row.feature_value??{},axis=String(value.axis??''),arm=String(value.arm??''),outcome=Number(value.outcomeScore);if(!axis||!arm||!Number.isFinite(outcome))continue;const key=`${axis}:${arm}`,bucket=grouped.get(key)??{axis,arm,weighted:0,weight:0,count:0},weight=Math.max(1,Number(row.strength??50));bucket.weighted+=Math.max(0,Math.min(100,outcome))*weight;bucket.weight+=weight;bucket.count+=1;grouped.set(key,bucket);if(row.publication_id)publications.add(String(row.publication_id));}
  return{sampleSize:publications.size,arms:[...grouped.values()].map((b)=>({axis:b.axis,arm:b.arm,sampleSize:b.count,meanOutcomeScore:Math.round((b.weighted/Math.max(1,b.weight))*10)/10}))};
}

try{
  console.log('[live-pipeline] opening durable channel state');
  const channelKey=String(channel.channelKey||channel.id);
  const channelRow=await db.query(`insert into channels (channel_key,youtube_channel_id,title,language,country,niche,is_owned,identity,voice_profile,autonomy_policy,library_policy,credentials_ref,config_path,lifecycle_state,automation_enabled)
    values ($1,$2,$3,$4,$5,$6,true,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12,'ready',true)
    on conflict (channel_key) where channel_key is not null and is_owned=true do update set youtube_channel_id=coalesce(excluded.youtube_channel_id,channels.youtube_channel_id),title=excluded.title,language=excluded.language,country=excluded.country,niche=excluded.niche,identity=excluded.identity,voice_profile=excluded.voice_profile,autonomy_policy=excluded.autonomy_policy,library_policy=excluded.library_policy,credentials_ref=coalesce(excluded.credentials_ref,channels.credentials_ref),config_path=excluded.config_path,is_owned=true,updated_at=now() returning id`,[
      channelKey,channel.youtubeChannelId||null,channel.id,channel.language,channel.region,channel.id,JSON.stringify(channel.identity??{}),JSON.stringify(channel.voiceProfile??{}),JSON.stringify(channel.autonomyPolicy??{}),JSON.stringify(channel.libraryPolicy??{}),channel.credentialsRef??'PRIMARY',configPath
    ]);
const channelId=channelRow.rows[0].id;
  console.log('[live-pipeline] channel state ready; reading learning signals');
const learningResult=await db.query(`select count(distinct ls.publication_id)::int as sample_size,
     avg(case when ls.feature_key='strongHook' then case when ls.feature_value #>> '{}'='true' then 1.0 else 0.0 end end)::float as strong_hook_rate,
      avg(case when ls.feature_key='averageViewPercentage' then nullif(ls.feature_value #>> '{}','')::numeric end)::float as average_view_percentage,
      avg(case when ls.feature_key='shareRate' then nullif(ls.feature_value #>> '{}','')::numeric end)::float as share_rate,
      avg(case when ls.feature_key='economics' then nullif(ls.feature_value->>'roi','')::numeric end)::float as average_roi
    from learning_signals ls join publications p on p.id=ls.publication_id where ls.channel_id=$1 and ls.observed_at>=now()-interval '120 days' and (p.content_format=$2 or ($2='LONG_HORIZONTAL' and p.content_format is null))`,[channelId,contentFormat]);
  const attributeRows=(await db.query(`select ls.publication_id,ls.feature_key,ls.feature_value,ls.strength from learning_signals ls join publications p on p.id=ls.publication_id where ls.channel_id=$1 and ls.signal_type='packaging_attribute_performance' and ls.observed_at>=now()-interval '180 days' and (p.content_format=$2 or ($2='LONG_HORIZONTAL' and p.content_format is null))`,[channelId,contentFormat])).rows;
  const structuralRows=(await db.query(`select ls.publication_id,ls.feature_key,ls.feature_value,ls.strength from learning_signals ls join publications p on p.id=ls.publication_id where ls.channel_id=$1 and ls.signal_type='structural_experiment_performance' and ls.observed_at>=now()-interval '240 days' and (p.content_format=$2 or ($2='LONG_HORIZONTAL' and p.content_format is null))`,[channelId,contentFormat])).rows;
  const creativeRows=(await db.query(`select distinct on (feature_name,feature_value) feature_name,feature_value,sample_size,weighted_views,average_retention_delta,average_segment_retention,average_video_avp,average_share_rate,average_subscribers_per_thousand,average_roi,confidence,payload,observed_at from creative_feature_snapshots where channel_id=$1 and content_format=$2 and observed_at>=now()-interval '240 days' order by feature_name,feature_value,observed_at desc`,[channelId,contentFormat])).rows;
  const packagingLearning=packagingLearningFromRows(attributeRows),structuralLearning=structuralLearningFromRows(structuralRows),creativeLearning=buildCreativeLearningGuidance(creativeRows,{contentArchetype:runtime.archetypeDecision?.archetype}),learningMetrics=learningResult.rows[0];
  const packagingGuidance=packagingGuidanceFromMetrics(learningMetrics);
  const baseTargetDurationSec=isShort?Number(channel.shortTargetDurationSec||45):Number(channel.targetDurationSec||660),configuredMax=Number(process.env.MAX_PRODUCTION_COST_USD||channel.maxProductionCostUsd||18),shortMaxOverride=Number(process.env.SHORT_MAX_PRODUCTION_COST_USD),shortMax=Number.isFinite(shortMaxOverride)&&shortMaxOverride>0?shortMaxOverride:Number(channel.shortMaxProductionCostUsd||Math.max(4,configuredMax*0.35)),baseMaxCostUsd=isShort?Math.min(configuredMax,shortMax):configuredMax;
  const archetypeSceneDuration=isShort?Number(runtime.archetypeProfile?.targetSceneDurationSec?.short??0):Number(runtime.archetypeProfile?.targetSceneDurationSec?.long??0);
  const learnedProfile=productionProfileFromMetrics(learningMetrics,{targetDurationSec:baseTargetDurationSec,targetSceneDurationSec:archetypeSceneDuration||undefined,maxCostUsd:baseMaxCostUsd},contentFormat);
  if(creativeLearning.targetSceneDurationSec!=null){const bounded=isShort?Math.max(2.5,Math.min(8,creativeLearning.targetSceneDurationSec)):Math.max(5,Math.min(16,creativeLearning.targetSceneDurationSec));learnedProfile.targetSceneDurationSec=Math.round((learnedProfile.targetSceneDurationSec*0.55+bounded*0.45)*10)/10;}
  learnedProfile.scriptGuidance=[learnedProfile.scriptGuidance,creativeLearning.guidance].filter(Boolean).join('\n')||undefined;
  const opportunityId=arg('opportunity-id',null),ideaFormat=isShort?'short':'long';
  const defaultHypothesis=runtime.archetypeProfile?.researchRequired===false?`Creative-original ${runtime.archetypeDecision?.archetype??'content'} production`:'Generated after research';
  const ideaRow=await db.query(`insert into content_ideas (opportunity_id,format,working_title,premise,target_viewer,hook_hypothesis,status) values ($1,$2,$3,$4,$5,$6,'production') returning id`,[opportunityId,ideaFormat,topic,topic,channel.targetViewer,learnedProfile.scriptGuidance??packagingGuidance??defaultHypothesis]);
  const contentIdeaId=ideaRow.rows[0].id;
  const structuralExperiment=selectStructuralExperiment({sampleSize:Number(learningMetrics?.sample_size??0),experimentSeed:`${channelId}:${contentFormat}:${contentIdeaId}:${topic}:${runtime.archetypeDecision?.archetype??'default'}`,allowCostExperiment:process.env.ALLOW_COST_EXPERIMENTS!=='false',learning:structuralLearning});
  const arm=structuralExperiment.selected,durationBounds=isShort?{min:20,max:180}:{min:480,max:900},sceneBounds=isShort?{min:2.5,max:8}:{min:5,max:16},costFloor=isShort?2:8;
  const productionProfile={...learnedProfile,targetDurationSec:Math.round(Math.max(durationBounds.min,Math.min(durationBounds.max,learnedProfile.targetDurationSec*arm.targetDurationFactor))),targetSceneDurationSec:Math.round(Math.max(sceneBounds.min,Math.min(sceneBounds.max,learnedProfile.targetSceneDurationSec*arm.targetSceneDurationFactor))*10)/10,maxCostUsd:Math.round(Math.max(costFloor,Math.min(baseMaxCostUsd*1.25,learnedProfile.maxCostUsd*arm.maxCostFactor))*100)/100,scriptGuidance:[learnedProfile.scriptGuidance,arm.scriptGuidance].filter(Boolean).join('\n')||undefined,structuralExperiment,structuralLearning,creativeLearning,contentFormat,contentArchetype:runtime.archetypeDecision?.archetype??null};
  const productionRepo=new ProductionRepository(db);
  productionRunId=await productionRepo.createRun({contentIdeaId,state:runtime.archetypeProfile?.researchRequired===false?'SCRIPT':'RESEARCH',metadata:{topic,channelConfig:channel.id,channelKey,opportunityId,contentFormat,contentArchetype:runtime.archetypeDecision??null,packagingGuidance:packagingGuidance??null,productionProfile,packagingLearning,structuralLearning,creativeLearning,structuralExperiment,productionRouting:{requestedMode:requestedProductionMode,sourceFirst,sourcedOnly,archetype:routedArchetype?.archetype??null},sourceDiscovery}});

  const activeVoiceProvider=String(runtime.voice?.name||process.env.VOICE_PROVIDER||'gemini').toLowerCase().includes('eleven')?'elevenlabs':'gemini';
  const configuredVoiceProvider=String(channel.voiceProfile?.provider||'').toLowerCase();
  const channelVoiceId=configuredVoiceProvider===activeVoiceProvider?channel.voiceProfile?.voiceId:'';
  const voiceId=resolveVoiceId({provider:activeVoiceProvider,language:channel.language,env:process.env,channelVoiceId});
  const result=await runContentPipeline({projectId:productionRunId,topic,language:channel.language,contentFormat,targetDurationSec:productionProfile.targetDurationSec,targetSceneDurationSec:productionProfile.targetSceneDurationSec,voice:voiceId,maxCostUsd:productionProfile.maxCostUsd,search:runtime.search,model:runtime.model,voiceProvider:runtime.voice,imageProvider:runtime.image,videoProvider:runtime.video,thumbnailComposer:runtime.thumbnailComposer,store:runtime.store,renderer:runtime.renderer,publisher:runtime.publisher,contentArchetype:runtime.archetypeDecision,autoUploadPrivate:process.env.AUTO_UPLOAD_PRIVATE==='true',videoOnly:String(process.env.AUTO_YTB_VIDEO_ONLY||'false').toLowerCase()==='true',sourcedOnly,visualMixPolicy:sourceFirst?'SOURCE_FIRST':'MIXED_MEDIA',packagingGuidance:[packagingGuidance,creativeLearning.guidance].filter(Boolean).join('\n')||undefined,scriptGuidance:[productionProfile.scriptGuidance,sourceFootageGuidance].filter(Boolean).join('\n')||undefined,packagingLearning,sourceFootage,additionalCostUsd:()=>runtime.meter?.nonAssetCostUsd??0,minAttentionScore:Number(process.env.MIN_ATTENTION_SCORE||86),maxAttentionRevisionPasses:Number(process.env.MAX_ATTENTION_REVISION_PASSES||2)});
  if(result.state!=='READY_FOR_REVIEW'){
    const blockers=result.events.filter((event)=>event.state==='BLOCKED').map((event)=>event.message).slice(-3).join(' | ')||`Pipeline ended in ${result.state}`;
    throw new Error(`PRODUCTION_PIPELINE_${result.state}:${blockers}`);
  }

  const durableCost=Math.max(Number(result.manifest?.actualCostUsd??0),Number(runtime.meter?.totalCostUsd??0));
  const remoteRender = await mirrorFile(result.renderUri, `projects/${productionRunId}/final.mp4`, 'video/mp4');
  const renderPersistence = { renderUri: result.renderUri, remoteMediaKey: remoteRender?.key ?? null, remoteMediaUrl: remoteRender?.url ?? null };
  await productionRepo.updateRun(productionRunId,{state:result.state,totalCostUsd:durableCost,metadata:{events:result.events,...renderPersistence,finalInspection:result.finalInspection??null,attention:result.attention??null,qaBlockers:result.qa?.blockers??[],opportunityId,contentFormat,contentArchetype:result.manifest?.contentArchetype??runtime.archetypeDecision??null,executionPlan:result.manifest?.executionPlan??null,packagingGuidance:packagingGuidance??null,productionProfile,packagingLearning,structuralLearning,creativeLearning,packagingSelection:result.manifest?.packagingSelection??null,structuralExperiment,meter:runtime.meter?.snapshot?.()??null,productionRouting:{requestedMode:requestedProductionMode,sourceFirst,sourcedOnly,archetype:routedArchetype?.archetype??null},sourceDiscovery}});
  let researchDossierId=null;
  if(result.dossier)researchDossierId=await new ResearchRepository(db).create({opportunityId,topic,researchConfidence:result.dossier.researchConfidence,executiveSummary:result.dossier.executiveSummary,blockingIssues:result.dossier.blockingIssues,dossier:result.dossier});
  if(result.manifest?.script){
    await new ScriptRepository(db).create({contentIdeaId,researchDossierId,language:result.manifest.script.language,targetDurationSeconds:result.manifest.script.targetDurationSec,script:result.manifest.script});
    for(const variant of result.manifest.packaging)await db.query(`insert into packaging_variants (content_idea_id,variant_key,title,thumbnail_concept,score,payload) values ($1,$2,$3,$4,$5,$6::jsonb) on conflict (content_idea_id,variant_key) do update set title=excluded.title,thumbnail_concept=excluded.thumbnail_concept,score=excluded.score,payload=excluded.payload`,[contentIdeaId,variant.id,variant.title,variant.thumbnailConcept,variant.score??(variant.curiosity+variant.clarity+variant.credibility+variant.differentiation)/4,JSON.stringify(variant)]);
    const variants=result.manifest.packaging;
    await db.query(`insert into model_experiments (channel_id,experiment_type,hypothesis,variant_a,variant_b,variant_c,winner,outcome) values ($1,'packaging_bandit',$2,$3::jsonb,$4::jsonb,$5::jsonb,$6,$7::jsonb)`,[channelId,`Bounded packaging exploration improves ${contentFormat}/${runtime.archetypeDecision?.archetype??'DEFAULT'} outcome while preserving periodic exploration.`,JSON.stringify(variants[0]??{}),JSON.stringify(variants[1]??{}),JSON.stringify(variants[2]??{}),result.manifest.selectedPackagingId,JSON.stringify({productionRunId,contentFormat,contentArchetype:result.manifest.contentArchetype?.id??null,selection:result.manifest.packagingSelection??null,status:'assigned'})]);
    await db.query(`insert into model_experiments (channel_id,experiment_type,hypothesis,variant_a,winner,outcome) values ($1,'structural_bandit',$2,$3::jsonb,$4,$5::jsonb)`,[channelId,`One-axis bounded structural exploration can improve ${contentFormat}/${runtime.archetypeDecision?.archetype??'DEFAULT'} retention and unit economics.`,JSON.stringify(structuralExperiment),arm.arm,JSON.stringify({productionRunId,contentFormat,contentArchetype:result.manifest.contentArchetype?.id??null,axis:arm.axis,arm:arm.arm,mode:structuralExperiment.mode,status:'assigned'})]);
    for(const asset of result.manifest.assets)await productionRepo.addAsset({productionRunId,sceneId:asset.sceneId,assetType:asset.mimeType,uri:asset.uri,provider:asset.provider,model:asset.model,generated:asset.generated,sourceIds:asset.sourceIds,costUsd:asset.costUsd,metadata:asset.metadata});
    for(const thumbnail of result.manifest.thumbnails)await productionRepo.addAsset({productionRunId,sceneId:`thumbnail:${thumbnail.packagingId}`,assetType:'image/jpeg',uri:thumbnail.uri,provider:thumbnail.provider,model:thumbnail.model,generated:true,sourceIds:[],costUsd:thumbnail.costUsd,metadata:{packagingId:thumbnail.packagingId,text:thumbnail.text??null}});
  }
  if(result.qa)await productionRepo.addQaReport({productionRunId,passed:result.qa.passed,score:result.qa.score,containsSyntheticMedia:result.qa.containsSyntheticMedia,blockers:result.qa.blockers,report:{...result.qa,attention:result.attention??null,finalInspection:result.finalInspection??null,contentArchetype:result.manifest?.contentArchetype??null,executionPlan:result.manifest?.executionPlan??null}});
  if(result.externalId)await new PublicationRepository(db).create({productionRunId,channelId,youtubeVideoId:result.externalId,state:'private',contentFormat,containsSyntheticMedia:result.qa?.containsSyntheticMedia??false,metadata:{...renderPersistence,contentFormat,contentArchetype:result.manifest?.contentArchetype??null,executionPlan:result.manifest?.executionPlan??null,selectedPackagingId:result.manifest?.selectedPackagingId,packagingGuidance:packagingGuidance??null,productionProfile,packagingSelection:result.manifest?.packagingSelection??null,structuralLearning,creativeLearning,structuralExperiment,attention:result.attention??null,finalInspection:result.finalInspection??null}});
  if(opportunityId&&result.state==='READY_FOR_REVIEW')await db.query(`update opportunities set status='produced',recommended_format=coalesce(recommended_format,$2) where id=$1`,[opportunityId,contentFormat]);
  if(result.state==='READY_FOR_REVIEW'&&String(process.env.AUTO_ARCHIVE_DRIVE??'true').toLowerCase()!=='false'){
    if(driveArchiveConfigured()){
      console.log('[live-pipeline] render ready; archiving run and artifacts to Google Drive');
      await archiveProductionRun(productionRunId,configPath);
    }else{
      console.log('[live-pipeline] render ready; Google Drive archive skipped because Drive OAuth is not configured');
    }
  }
  console.log(JSON.stringify({productionRunId,contentFormat,contentArchetype:result.manifest?.contentArchetype?.id??runtime.archetypeDecision?.archetype??null,contentArchetypeDecision:runtime.archetypeDecision??null,executionPlan:result.manifest?.executionPlan??null,state:result.state,qa:result.qa?.score,qaBlockers:result.qa?.blockers??[],attention:result.attention?.score,attentionIssues:result.attention?.issues??[],attentionDimensions:result.attention?.dimensions??[],renderQa:result.finalInspection?.score,costUsd:durableCost,thumbnails:result.manifest?.thumbnails.length??0,renderUri:result.renderUri,youtubeVideoId:result.externalId??null,learnedPackaging:Boolean(packagingGuidance),creativeLearningScope:creativeLearning.scope,creativeGuidanceWinners:creativeLearning.winners,productionProfile,packagingSelection:result.manifest?.packagingSelection??null,structuralLearning,structuralExperiment,events:result.events.slice(-16)},null,2));
}catch(error){if(productionRunId)await db.query(`update production_runs set state='BLOCKED',total_cost_usd=greatest(total_cost_usd,$3),metadata=metadata||$2::jsonb,updated_at=now() where id=$1`,[productionRunId,JSON.stringify({error:error instanceof Error?error.message:String(error),contentFormat,contentArchetype:runtime.archetypeDecision??null,meter:runtime.meter?.snapshot?.()??null}),Number(runtime.meter?.totalCostUsd??0)]);throw error;}finally{await db.close();}
