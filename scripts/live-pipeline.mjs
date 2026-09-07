import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runContentPipeline } from '@auto-ytb/orchestrator';
import { ResearchRepository, ScriptRepository, ProductionRepository, PublicationRepository } from '@auto-ytb/persistence';
import { createLiveRuntime } from '../packages/runtime-node/factory.mjs';

const arg = (name, fallback) => process.argv.find((v)=>v.startsWith(`--${name}=`))?.slice(name.length+3) ?? fallback;
const topic = arg('topic');
if (!topic) throw new Error('Use --topic="..."');
const configPath = resolve(arg('channel-config','config/channels/future-tech-business.example.json'));
const channel = JSON.parse(await readFile(configPath,'utf8'));
const runtime = createLiveRuntime(process.env);
if (!runtime.db) throw new Error('DATABASE_URL is required for live pipeline durability');
if (!runtime.image || !runtime.video) throw new Error('IMAGE_PROVIDER=runway and VIDEO_PROVIDER=runway are required by the current live scene generator');
const db=runtime.db;
let productionRunId;

function packagingGuidanceFromMetrics(metrics){
  if(!metrics || Number(metrics.sample_size ?? 0) < 3) return undefined;
  const guidance=[];
  const hook=metrics.strong_hook_rate==null?null:Number(metrics.strong_hook_rate);
  const avp=metrics.average_view_percentage==null?null:Number(metrics.average_view_percentage);
  const share=metrics.share_rate==null?null:Number(metrics.share_rate);
  if(hook!=null && hook<0.55) guidance.push('Recent videos show weak early retention: make the core promise understandable immediately, prefer concrete stakes over abstract wording, and avoid slow-burn or vague titles.');
  else if(hook!=null && hook>=0.75) guidance.push('Recent videos show strong early retention: preserve immediate comprehension while allowing one stronger curiosity gap or more distinctive framing.');
  if(avp!=null && avp<45) guidance.push('Average percentage viewed is below target: packaging must tightly match the actual thesis so the opening can pay off the promise quickly; avoid over-broad promises.');
  else if(avp!=null && avp>=60) guidance.push('Average percentage viewed is strong: favor precise differentiated angles that reward sustained viewing rather than generic category language.');
  if(share!=null && share>=1) guidance.push('Share rate is comparatively strong: retain packaging that communicates a surprising, useful, or conversation-worthy insight without sensationalism.');
  return guidance.length?guidance.join('\n'):undefined;
}

function productionProfileFromMetrics(metrics, base){
  const sample=Number(metrics?.sample_size ?? 0);
  if(sample<3) return {sampleSize:sample,targetDurationSec:base.targetDurationSec,targetSceneDurationSec:10,maxCostUsd:base.maxCostUsd,scriptGuidance:undefined,adapted:false};
  const hook=metrics.strong_hook_rate==null?null:Number(metrics.strong_hook_rate);
  const avp=metrics.average_view_percentage==null?null:Number(metrics.average_view_percentage);
  const roi=metrics.average_roi==null?null:Number(metrics.average_roi);
  let durationFactor=1;
  let targetSceneDurationSec=10;
  let costFactor=1;
  const guidance=[];
  if(hook!=null && hook<0.55){
    durationFactor-=0.05;
    targetSceneDurationSec=8;
    guidance.push('Front-load the viewer promise and stakes. The hook should establish the core tension quickly and avoid contextual throat-clearing.');
  } else if(hook!=null && hook>=0.75){
    guidance.push('Early retention is strong. Keep the opening concise, but preserve room for a controlled curiosity gap after the promise is clear.');
  }
  if(avp!=null && avp<45){
    durationFactor-=0.10;
    targetSceneDurationSec=Math.min(targetSceneDurationSec,8);
    guidance.push('Recent average percentage viewed is weak. Compress exposition, shorten transitions, and increase visual/narrative progression density.');
  } else if(avp!=null && avp>=60){
    durationFactor+=0.08;
    targetSceneDurationSec=11;
    guidance.push('Recent average percentage viewed is strong. Allow modestly deeper development where it adds payoff, without adding filler.');
  }
  if(roi!=null && roi>1){
    costFactor=1.15;
    guidance.push('Recent production economics are positive. Spend selectively on high-impact explanatory or reveal moments, not uniformly across the video.');
  } else if(roi!=null && roi<0){
    costFactor=0.82;
    targetSceneDurationSec=Math.max(targetSceneDurationSec,10);
    guidance.push('Recent production economics are negative. Prefer lower-cost visual solutions unless a premium generated shot clearly improves the hook, reveal, or payoff.');
  }
  const targetDurationSec=Math.round(Math.max(480,Math.min(900,base.targetDurationSec*durationFactor)));
  const maxCostUsd=Math.round(Math.max(8,Math.min(base.maxCostUsd*1.2,base.maxCostUsd*costFactor))*100)/100;
  return {sampleSize:sample,targetDurationSec,targetSceneDurationSec,maxCostUsd,scriptGuidance:guidance.length?guidance.join('\n'):undefined,adapted:true,metrics:{strongHookRate:hook,averageViewPercentage:avp,averageRoi:roi}};
}

try {
  const channelRow = await db.query(`insert into channels (youtube_channel_id,title,language,country,niche,is_owned) values ($1,$2,$3,$4,$5,true) on conflict (youtube_channel_id) do update set title=excluded.title,language=excluded.language,country=excluded.country,niche=excluded.niche,is_owned=true,updated_at=now() returning id`,[process.env.YOUTUBE_CHANNEL_ID || null, channel.id, channel.language, channel.region, channel.id]);
  const channelId=channelRow.rows[0].id;
  const learningResult=await db.query(`
    select count(distinct publication_id)::int as sample_size,
      avg(case when feature_key='strongHook' then case when feature_value #>> '{}'='true' then 1.0 else 0.0 end end)::float as strong_hook_rate,
      avg(case when feature_key='averageViewPercentage' then nullif(feature_value #>> '{}','')::numeric end)::float as average_view_percentage,
      avg(case when feature_key='shareRate' then nullif(feature_value #>> '{}','')::numeric end)::float as share_rate,
      avg(case when feature_key='economics' then nullif(feature_value->>'roi','')::numeric end)::float as average_roi
    from learning_signals
    where channel_id=$1 and observed_at >= now()-interval '120 days'`,[channelId]);
  const learningMetrics=learningResult.rows[0];
  const packagingGuidance=packagingGuidanceFromMetrics(learningMetrics);
  const baseTargetDurationSec=Number(channel.targetDurationSec || 660);
  const baseMaxCostUsd=Number(process.env.MAX_PRODUCTION_COST_USD || channel.maxProductionCostUsd || 18);
  const productionProfile=productionProfileFromMetrics(learningMetrics,{targetDurationSec:baseTargetDurationSec,maxCostUsd:baseMaxCostUsd});
  const opportunityId=arg('opportunity-id',null);
  const ideaRow=await db.query(`insert into content_ideas (opportunity_id,format,working_title,premise,target_viewer,hook_hypothesis,status) values ($1,'long',$2,$3,$4,$5,'production') returning id`,[opportunityId,topic,topic,channel.targetViewer,productionProfile.scriptGuidance ?? packagingGuidance ?? 'Generated after research']);
  const contentIdeaId=ideaRow.rows[0].id;
  const productionRepo=new ProductionRepository(db);
  productionRunId=await productionRepo.createRun({contentIdeaId,state:'RESEARCH',metadata:{topic,channelConfig:channel.id,opportunityId,packagingGuidance:packagingGuidance ?? null,productionProfile}});

  const result=await runContentPipeline({
    projectId:productionRunId,
    topic,
    language:channel.language,
    targetDurationSec:productionProfile.targetDurationSec,
    targetSceneDurationSec:productionProfile.targetSceneDurationSec,
    voice:process.env.VOICE_ID || channel.voice,
    maxCostUsd:productionProfile.maxCostUsd,
    search:runtime.search,
    model:runtime.model,
    voiceProvider:runtime.voice,
    imageProvider:runtime.image,
    videoProvider:runtime.video,
    thumbnailComposer:runtime.thumbnailComposer,
    store:runtime.store,
    renderer:runtime.renderer,
    publisher:runtime.publisher,
    autoUploadPrivate:process.env.AUTO_UPLOAD_PRIVATE === 'true',
    packagingGuidance,
    scriptGuidance:productionProfile.scriptGuidance,
  });

  await productionRepo.updateRun(productionRunId,{state:result.state,totalCostUsd:result.manifest?.actualCostUsd ?? 0,metadata:{events:result.events,renderUri:result.renderUri,opportunityId,packagingGuidance:packagingGuidance ?? null,productionProfile}});
  let researchDossierId=null;
  if(result.dossier){
    researchDossierId=await new ResearchRepository(db).create({opportunityId,topic,researchConfidence:result.dossier.researchConfidence,executiveSummary:result.dossier.executiveSummary,blockingIssues:result.dossier.blockingIssues,dossier:result.dossier});
  }
  if(result.manifest?.script){
    await new ScriptRepository(db).create({contentIdeaId,researchDossierId,language:result.manifest.script.language,targetDurationSeconds:result.manifest.script.targetDurationSec,script:result.manifest.script});
    for(const variant of result.manifest.packaging) await db.query(`insert into packaging_variants (content_idea_id,variant_key,title,thumbnail_concept,score,payload) values ($1,$2,$3,$4,$5,$6::jsonb) on conflict (content_idea_id,variant_key) do update set title=excluded.title,thumbnail_concept=excluded.thumbnail_concept,score=excluded.score,payload=excluded.payload`,[contentIdeaId,variant.id,variant.title,variant.thumbnailConcept,variant.score ?? (variant.curiosity+variant.clarity+variant.credibility+variant.differentiation)/4,JSON.stringify(variant)]);
    for(const asset of result.manifest.assets) await productionRepo.addAsset({productionRunId,sceneId:asset.sceneId,assetType:asset.mimeType,uri:asset.uri,provider:asset.provider,model:asset.model,generated:asset.generated,sourceIds:asset.sourceIds,costUsd:asset.costUsd});
    for(const thumbnail of result.manifest.thumbnails) await productionRepo.addAsset({productionRunId,sceneId:`thumbnail:${thumbnail.packagingId}`,assetType:'image/jpeg',uri:thumbnail.uri,provider:thumbnail.provider,model:thumbnail.model,generated:true,sourceIds:[],costUsd:thumbnail.costUsd,metadata:{packagingId:thumbnail.packagingId,text:thumbnail.text ?? null}});
  }
  if(result.qa) await productionRepo.addQaReport({productionRunId,passed:result.qa.passed,score:result.qa.score,containsSyntheticMedia:result.qa.containsSyntheticMedia,blockers:result.qa.blockers,report:result.qa});
  if(result.externalId) await new PublicationRepository(db).create({productionRunId,channelId,youtubeVideoId:result.externalId,state:'private',containsSyntheticMedia:result.qa?.containsSyntheticMedia ?? false,metadata:{renderUri:result.renderUri,selectedPackagingId:result.manifest?.selectedPackagingId,packagingGuidance:packagingGuidance ?? null,productionProfile}});
  if(opportunityId && result.state==='READY_FOR_REVIEW') await db.query(`update opportunities set status='produced' where id=$1`,[opportunityId]);
  console.log(JSON.stringify({productionRunId,state:result.state,qa:result.qa?.score,costUsd:result.manifest?.actualCostUsd,thumbnails:result.manifest?.thumbnails.length ?? 0,renderUri:result.renderUri,youtubeVideoId:result.externalId ?? null,learnedPackaging:Boolean(packagingGuidance),productionProfile},null,2));
} catch(error) {
  if(productionRunId) await db.query(`update production_runs set state='BLOCKED',metadata=metadata || $2::jsonb,updated_at=now() where id=$1`,[productionRunId,JSON.stringify({error:error instanceof Error?error.message:String(error)})]);
  throw error;
} finally { await db.close(); }