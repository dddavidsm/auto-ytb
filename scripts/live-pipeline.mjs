import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runContentPipeline } from '@auto-ytb/orchestrator';
import { selectStructuralExperiment } from '@auto-ytb/production';
import { ResearchRepository, ScriptRepository, ProductionRepository, PublicationRepository } from '@auto-ytb/persistence';
import { createLiveRuntime } from '../packages/runtime-node/factory.mjs';

const arg = (name, fallback) => process.argv.find((v)=>v.startsWith(`--${name}=`))?.slice(name.length+3) ?? fallback;
const topic = arg('topic');
if (!topic) throw new Error('Use --topic="..."');
const configPath = resolve(arg('channel-config','config/channels/future-tech-business.example.json'));
const channel = JSON.parse(await readFile(configPath,'utf8'));
const requestedFormat=String(arg('format',channel.preferredFormat==='SHORT_VERTICAL'?'SHORT_VERTICAL':'LONG_HORIZONTAL')).toUpperCase();
const contentFormat=requestedFormat==='SHORT_VERTICAL'?'SHORT_VERTICAL':'LONG_HORIZONTAL';
const isShort=contentFormat==='SHORT_VERTICAL';
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
  if(hook!=null && hook<0.55) guidance.push('Recent videos in this format show weak early retention: make the core promise understandable immediately and prefer concrete stakes over abstract wording.');
  else if(hook!=null && hook>=0.75) guidance.push('Recent videos in this format show strong early retention: preserve immediate comprehension while allowing one stronger curiosity gap.');
  if(avp!=null && avp<45) guidance.push('Average percentage viewed for this format is weak: packaging must tightly match the actual payoff and avoid over-broad promises.');
  else if(avp!=null && avp>=60) guidance.push('Average percentage viewed for this format is strong: favor precise differentiated angles that reward continued viewing.');
  if(share!=null && share>=1) guidance.push('Share rate is comparatively strong: retain packaging that communicates a surprising, useful or conversation-worthy insight without sensationalism.');
  return guidance.length?guidance.join('\n'):undefined;
}

function productionProfileFromMetrics(metrics, base, format){
  const sample=Number(metrics?.sample_size ?? 0);
  const short=format==='SHORT_VERTICAL';
  const durationBounds=short?{min:20,max:180}:{min:480,max:900};
  const sceneBounds=short?{min:2.5,max:8,base:4.5}:{min:5,max:16,base:10};
  const costFloor=short?2:8;
  if(sample<3) return {sampleSize:sample,targetDurationSec:base.targetDurationSec,targetSceneDurationSec:sceneBounds.base,maxCostUsd:base.maxCostUsd,scriptGuidance:undefined,adapted:false};
  const hook=metrics.strong_hook_rate==null?null:Number(metrics.strong_hook_rate);
  const avp=metrics.average_view_percentage==null?null:Number(metrics.average_view_percentage);
  const roi=metrics.average_roi==null?null:Number(metrics.average_roi);
  let durationFactor=1;
  let targetSceneDurationSec=sceneBounds.base;
  let costFactor=1;
  const guidance=[];
  if(hook!=null && hook<0.55){durationFactor-=short?0.08:0.05;targetSceneDurationSec*=0.85;guidance.push('Front-load the viewer promise and stakes; remove contextual throat-clearing.');}
  else if(hook!=null && hook>=0.75) guidance.push('Early retention is strong. Preserve the opening pattern and only deepen after the promise is clear.');
  if(avp!=null && avp<45){durationFactor-=short?0.12:0.10;targetSceneDurationSec*=0.86;guidance.push('Compress exposition and increase visual/narrative progression density.');}
  else if(avp!=null && avp>=60){durationFactor+=short?0.04:0.08;targetSceneDurationSec*=1.08;guidance.push('Sustained viewing is strong; allow modestly deeper development only where it adds payoff.');}
  if(roi!=null && roi>1){costFactor=1.15;guidance.push('Economics are positive for this format. Spend selectively on hook/reveal/payoff moments.');}
  else if(roi!=null && roi<0){costFactor=0.82;targetSceneDurationSec*=1.08;guidance.push('Economics are negative for this format. Prefer lower-cost visual solutions unless premium media clearly improves a key moment.');}
  const targetDurationSec=Math.round(Math.max(durationBounds.min,Math.min(durationBounds.max,base.targetDurationSec*durationFactor)));
  targetSceneDurationSec=Math.round(Math.max(sceneBounds.min,Math.min(sceneBounds.max,targetSceneDurationSec))*10)/10;
  const maxCostUsd=Math.round(Math.max(costFloor,Math.min(base.maxCostUsd*1.2,base.maxCostUsd*costFactor))*100)/100;
  return {sampleSize:sample,targetDurationSec,targetSceneDurationSec,maxCostUsd,scriptGuidance:guidance.length?guidance.join('\n'):undefined,adapted:true,metrics:{strongHookRate:hook,averageViewPercentage:avp,averageRoi:roi}};
}

function packagingLearningFromRows(rows){
  const attrs=['curiosity','clarity','credibility','differentiation'];
  const grouped=new Map(attrs.map((attribute)=>[attribute,[]]));
  const publications=new Set();
  for(const row of rows){
    if(!grouped.has(row.feature_key)) continue;
    const value=row.feature_value ?? {};
    const x=Number(value.attributeValue), y=Number(value.outcomeScore);
    if(!Number.isFinite(x)||!Number.isFinite(y)) continue;
    grouped.get(row.feature_key).push({x,y,strength:Number(row.strength ?? 50)});
    if(row.publication_id) publications.add(String(row.publication_id));
  }
  const attributes=[];
  for(const attribute of attrs){
    const points=grouped.get(attribute);
    if(!points.length){attributes.push({attribute,sampleSize:0,slope:0,confidence:0});continue;}
    const weightSum=points.reduce((sum,p)=>sum+Math.max(1,p.strength),0);
    const meanX=points.reduce((sum,p)=>sum+p.x*Math.max(1,p.strength),0)/weightSum;
    const meanY=points.reduce((sum,p)=>sum+p.y*Math.max(1,p.strength),0)/weightSum;
    const covariance=points.reduce((sum,p)=>sum+(p.x-meanX)*(p.y-meanY)*Math.max(1,p.strength),0);
    const variance=points.reduce((sum,p)=>sum+(p.x-meanX)**2*Math.max(1,p.strength),0);
    const slope=variance>0?covariance/variance:0;
    attributes.push({attribute,sampleSize:points.length,slope:Math.max(-0.8,Math.min(0.8,slope)),confidence:Math.min(1,points.length/12)});
  }
  return {sampleSize:publications.size,attributes};
}

function structuralLearningFromRows(rows){
  const grouped=new Map();
  const publications=new Set();
  for(const row of rows){
    const value=row.feature_value ?? {};
    const axis=String(value.axis ?? '');
    const arm=String(value.arm ?? '');
    const outcome=Number(value.outcomeScore);
    if(!axis||!arm||!Number.isFinite(outcome)) continue;
    const key=`${axis}:${arm}`;
    const bucket=grouped.get(key) ?? {axis,arm,weighted:0,weight:0,count:0};
    const weight=Math.max(1,Number(row.strength ?? 50));
    bucket.weighted+=Math.max(0,Math.min(100,outcome))*weight;
    bucket.weight+=weight;
    bucket.count+=1;
    grouped.set(key,bucket);
    if(row.publication_id) publications.add(String(row.publication_id));
  }
  return {
    sampleSize:publications.size,
    arms:[...grouped.values()].map((bucket)=>({axis:bucket.axis,arm:bucket.arm,sampleSize:bucket.count,meanOutcomeScore:Math.round((bucket.weighted/Math.max(1,bucket.weight))*10)/10})),
  };
}

try {
  const channelRow = await db.query(`insert into channels (youtube_channel_id,title,language,country,niche,is_owned) values ($1,$2,$3,$4,$5,true) on conflict (youtube_channel_id) do update set title=excluded.title,language=excluded.language,country=excluded.country,niche=excluded.niche,is_owned=true,updated_at=now() returning id`,[process.env.YOUTUBE_CHANNEL_ID || null, channel.id, channel.language, channel.region, channel.id]);
  const channelId=channelRow.rows[0].id;
  const learningResult=await db.query(`
    select count(distinct ls.publication_id)::int as sample_size,
      avg(case when ls.feature_key='strongHook' then case when ls.feature_value #>> '{}'='true' then 1.0 else 0.0 end end)::float as strong_hook_rate,
      avg(case when ls.feature_key='averageViewPercentage' then nullif(ls.feature_value #>> '{}','')::numeric end)::float as average_view_percentage,
      avg(case when ls.feature_key='shareRate' then nullif(ls.feature_value #>> '{}','')::numeric end)::float as share_rate,
      avg(case when ls.feature_key='economics' then nullif(ls.feature_value->>'roi','')::numeric end)::float as average_roi
    from learning_signals ls
    join publications p on p.id=ls.publication_id
    where ls.channel_id=$1 and ls.observed_at >= now()-interval '120 days'
      and (p.content_format=$2 or ($2='LONG_HORIZONTAL' and p.content_format is null))`,[channelId,contentFormat]);
  const attributeRows=(await db.query(`
    select ls.publication_id,ls.feature_key,ls.feature_value,ls.strength
    from learning_signals ls join publications p on p.id=ls.publication_id
    where ls.channel_id=$1 and ls.signal_type='packaging_attribute_performance' and ls.observed_at>=now()-interval '180 days'
      and (p.content_format=$2 or ($2='LONG_HORIZONTAL' and p.content_format is null))`,[channelId,contentFormat])).rows;
  const structuralRows=(await db.query(`
    select ls.publication_id,ls.feature_key,ls.feature_value,ls.strength
    from learning_signals ls join publications p on p.id=ls.publication_id
    where ls.channel_id=$1 and ls.signal_type='structural_experiment_performance' and ls.observed_at>=now()-interval '240 days'
      and (p.content_format=$2 or ($2='LONG_HORIZONTAL' and p.content_format is null))`,[channelId,contentFormat])).rows;
  const packagingLearning=packagingLearningFromRows(attributeRows);
  const structuralLearning=structuralLearningFromRows(structuralRows);
  const learningMetrics=learningResult.rows[0];
  const packagingGuidance=packagingGuidanceFromMetrics(learningMetrics);
  const baseTargetDurationSec=isShort?Number(channel.shortTargetDurationSec || 45):Number(channel.targetDurationSec || 660);
  const configuredMax=Number(process.env.MAX_PRODUCTION_COST_USD || channel.maxProductionCostUsd || 18);
  const baseMaxCostUsd=isShort?Math.min(configuredMax,Number(channel.shortMaxProductionCostUsd || Math.max(4,configuredMax*0.35))):configuredMax;
  const learnedProfile=productionProfileFromMetrics(learningMetrics,{targetDurationSec:baseTargetDurationSec,maxCostUsd:baseMaxCostUsd},contentFormat);
  const opportunityId=arg('opportunity-id',null);
  const ideaFormat=isShort?'short':'long';
  const ideaRow=await db.query(`insert into content_ideas (opportunity_id,format,working_title,premise,target_viewer,hook_hypothesis,status) values ($1,$2,$3,$4,$5,$6,'production') returning id`,[opportunityId,ideaFormat,topic,topic,channel.targetViewer,learnedProfile.scriptGuidance ?? packagingGuidance ?? 'Generated after research']);
  const contentIdeaId=ideaRow.rows[0].id;
  const structuralExperiment=selectStructuralExperiment({sampleSize:Number(learningMetrics?.sample_size ?? 0),experimentSeed:`${channelId}:${contentFormat}:${contentIdeaId}:${topic}`,allowCostExperiment:process.env.ALLOW_COST_EXPERIMENTS!=='false',learning:structuralLearning});
  const arm=structuralExperiment.selected;
  const durationBounds=isShort?{min:20,max:180}:{min:480,max:900};
  const sceneBounds=isShort?{min:2.5,max:8}:{min:5,max:16};
  const costFloor=isShort?2:8;
  const productionProfile={
    ...learnedProfile,
    targetDurationSec:Math.round(Math.max(durationBounds.min,Math.min(durationBounds.max,learnedProfile.targetDurationSec*arm.targetDurationFactor))),
    targetSceneDurationSec:Math.round(Math.max(sceneBounds.min,Math.min(sceneBounds.max,learnedProfile.targetSceneDurationSec*arm.targetSceneDurationFactor))*10)/10,
    maxCostUsd:Math.round(Math.max(costFloor,Math.min(baseMaxCostUsd*1.25,learnedProfile.maxCostUsd*arm.maxCostFactor))*100)/100,
    scriptGuidance:[learnedProfile.scriptGuidance,arm.scriptGuidance].filter(Boolean).join('\n')||undefined,
    structuralExperiment,
    structuralLearning,
    contentFormat,
  };
  const productionRepo=new ProductionRepository(db);
  productionRunId=await productionRepo.createRun({contentIdeaId,state:'RESEARCH',metadata:{topic,channelConfig:channel.id,opportunityId,contentFormat,packagingGuidance:packagingGuidance ?? null,productionProfile,packagingLearning,structuralLearning,structuralExperiment}});

  const result=await runContentPipeline({projectId:productionRunId,topic,language:channel.language,contentFormat,targetDurationSec:productionProfile.targetDurationSec,targetSceneDurationSec:productionProfile.targetSceneDurationSec,voice:process.env.VOICE_ID || channel.voice,maxCostUsd:productionProfile.maxCostUsd,search:runtime.search,model:runtime.model,voiceProvider:runtime.voice,imageProvider:runtime.image,videoProvider:runtime.video,thumbnailComposer:runtime.thumbnailComposer,store:runtime.store,renderer:runtime.renderer,publisher:runtime.publisher,autoUploadPrivate:process.env.AUTO_UPLOAD_PRIVATE === 'true',packagingGuidance,scriptGuidance:productionProfile.scriptGuidance,packagingLearning});

  await productionRepo.updateRun(productionRunId,{state:result.state,totalCostUsd:result.manifest?.actualCostUsd ?? 0,metadata:{events:result.events,renderUri:result.renderUri,opportunityId,contentFormat,packagingGuidance:packagingGuidance ?? null,productionProfile,packagingLearning,structuralLearning,packagingSelection:result.manifest?.packagingSelection ?? null,structuralExperiment}});
  let researchDossierId=null;
  if(result.dossier) researchDossierId=await new ResearchRepository(db).create({opportunityId,topic,researchConfidence:result.dossier.researchConfidence,executiveSummary:result.dossier.executiveSummary,blockingIssues:result.dossier.blockingIssues,dossier:result.dossier});
  if(result.manifest?.script){
    await new ScriptRepository(db).create({contentIdeaId,researchDossierId,language:result.manifest.script.language,targetDurationSeconds:result.manifest.script.targetDurationSec,script:result.manifest.script});
    for(const variant of result.manifest.packaging) await db.query(`insert into packaging_variants (content_idea_id,variant_key,title,thumbnail_concept,score,payload) values ($1,$2,$3,$4,$5,$6::jsonb) on conflict (content_idea_id,variant_key) do update set title=excluded.title,thumbnail_concept=excluded.thumbnail_concept,score=excluded.score,payload=excluded.payload`,[contentIdeaId,variant.id,variant.title,variant.thumbnailConcept,variant.score ?? (variant.curiosity+variant.clarity+variant.credibility+variant.differentiation)/4,JSON.stringify(variant)]);
    const variants=result.manifest.packaging;
    await db.query(`insert into model_experiments (channel_id,experiment_type,hypothesis,variant_a,variant_b,variant_c,winner,outcome) values ($1,'packaging_bandit',$2,$3::jsonb,$4::jsonb,$5::jsonb,$6,$7::jsonb)`,[channelId,`Bounded packaging exploration improves ${contentFormat} outcome while preserving periodic exploration.`,JSON.stringify(variants[0] ?? {}),JSON.stringify(variants[1] ?? {}),JSON.stringify(variants[2] ?? {}),result.manifest.selectedPackagingId,JSON.stringify({productionRunId,contentFormat,selection:result.manifest.packagingSelection ?? null,status:'assigned'})]);
    await db.query(`insert into model_experiments (channel_id,experiment_type,hypothesis,variant_a,winner,outcome) values ($1,'structural_bandit',$2,$3::jsonb,$4,$5::jsonb)`,[channelId,`One-axis bounded structural exploration can improve ${contentFormat} retention and unit economics.`,JSON.stringify(structuralExperiment),arm.arm,JSON.stringify({productionRunId,contentFormat,axis:arm.axis,arm:arm.arm,mode:structuralExperiment.mode,status:'assigned'})]);
    for(const asset of result.manifest.assets) await productionRepo.addAsset({productionRunId,sceneId:asset.sceneId,assetType:asset.mimeType,uri:asset.uri,provider:asset.provider,model:asset.model,generated:asset.generated,sourceIds:asset.sourceIds,costUsd:asset.costUsd});
    for(const thumbnail of result.manifest.thumbnails) await productionRepo.addAsset({productionRunId,sceneId:`thumbnail:${thumbnail.packagingId}`,assetType:'image/jpeg',uri:thumbnail.uri,provider:thumbnail.provider,model:thumbnail.model,generated:true,sourceIds:[],costUsd:thumbnail.costUsd,metadata:{packagingId:thumbnail.packagingId,text:thumbnail.text ?? null}});
  }
  if(result.qa) await productionRepo.addQaReport({productionRunId,passed:result.qa.passed,score:result.qa.score,containsSyntheticMedia:result.qa.containsSyntheticMedia,blockers:result.qa.blockers,report:result.qa});
  if(result.externalId) await new PublicationRepository(db).create({productionRunId,channelId,youtubeVideoId:result.externalId,state:'private',contentFormat,containsSyntheticMedia:result.qa?.containsSyntheticMedia ?? false,metadata:{renderUri:result.renderUri,contentFormat,selectedPackagingId:result.manifest?.selectedPackagingId,packagingGuidance:packagingGuidance ?? null,productionProfile,packagingSelection:result.manifest?.packagingSelection ?? null,structuralLearning,structuralExperiment}});
  if(opportunityId && result.state==='READY_FOR_REVIEW') await db.query(`update opportunities set status='produced',recommended_format=coalesce(recommended_format,$2) where id=$1`,[opportunityId,contentFormat]);
  console.log(JSON.stringify({productionRunId,contentFormat,state:result.state,qa:result.qa?.score,costUsd:result.manifest?.actualCostUsd,thumbnails:result.manifest?.thumbnails.length ?? 0,renderUri:result.renderUri,youtubeVideoId:result.externalId ?? null,learnedPackaging:Boolean(packagingGuidance),productionProfile,packagingSelection:result.manifest?.packagingSelection ?? null,structuralLearning,structuralExperiment},null,2));
} catch(error) {
  if(productionRunId) await db.query(`update production_runs set state='BLOCKED',metadata=metadata || $2::jsonb,updated_at=now() where id=$1`,[productionRunId,JSON.stringify({error:error instanceof Error?error.message:String(error),contentFormat})]);
  throw error;
} finally { await db.close(); }
