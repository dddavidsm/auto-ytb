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
try {
  const channelRow = await db.query(`insert into channels (youtube_channel_id,title,language,country,niche,is_owned) values ($1,$2,$3,$4,$5,true) on conflict (youtube_channel_id) do update set title=excluded.title,language=excluded.language,country=excluded.country,niche=excluded.niche,is_owned=true,updated_at=now() returning id`,[process.env.YOUTUBE_CHANNEL_ID || null, channel.id, channel.language, channel.region, channel.id]);
  const channelId=channelRow.rows[0].id;
  const ideaRow=await db.query(`insert into content_ideas (format,working_title,premise,target_viewer,hook_hypothesis,status) values ('long',$1,$2,$3,$4,'production') returning id`,[topic,topic,channel.targetViewer,'Generated after research']);
  const contentIdeaId=ideaRow.rows[0].id;
  const productionRepo=new ProductionRepository(db);
  productionRunId=await productionRepo.createRun({contentIdeaId,state:'RESEARCH',metadata:{topic,channelConfig:channel.id}});

  const result=await runContentPipeline({
    projectId:productionRunId,
    topic,
    language:channel.language,
    targetDurationSec:Number(channel.targetDurationSec || 660),
    voice:process.env.VOICE_ID || channel.voice,
    maxCostUsd:Number(process.env.MAX_PRODUCTION_COST_USD || channel.maxProductionCostUsd || 18),
    search:runtime.search,
    model:runtime.model,
    voiceProvider:runtime.voice,
    imageProvider:runtime.image,
    videoProvider:runtime.video,
    store:runtime.store,
    renderer:runtime.renderer,
    publisher:runtime.publisher,
    autoUploadPrivate:process.env.AUTO_UPLOAD_PRIVATE === 'true',
  });

  await productionRepo.updateRun(productionRunId,{state:result.state,totalCostUsd:result.manifest?.actualCostUsd ?? 0,metadata:{events:result.events,renderUri:result.renderUri}});
  let researchDossierId=null;
  if(result.dossier){
    researchDossierId=await new ResearchRepository(db).create({topic,researchConfidence:result.dossier.researchConfidence,executiveSummary:result.dossier.executiveSummary,blockingIssues:result.dossier.blockingIssues,dossier:result.dossier});
  }
  if(result.manifest?.script){
    await new ScriptRepository(db).create({contentIdeaId,researchDossierId,language:result.manifest.script.language,targetDurationSeconds:result.manifest.script.targetDurationSec,script:result.manifest.script});
    for(const variant of result.manifest.packaging) await db.query(`insert into packaging_variants (content_idea_id,variant_id,title,thumbnail_concept,thumbnail_text,score,metadata) values ($1,$2,$3,$4,$5,$6,$7::jsonb) on conflict (content_idea_id,variant_id) do update set title=excluded.title,thumbnail_concept=excluded.thumbnail_concept,thumbnail_text=excluded.thumbnail_text,score=excluded.score,metadata=excluded.metadata`,[contentIdeaId,variant.id,variant.title,variant.thumbnailConcept,variant.thumbnailText ?? null,(variant.curiosity+variant.clarity+variant.credibility+variant.differentiation)/4,JSON.stringify(variant)]);
    for(const asset of result.manifest.assets) await productionRepo.addAsset({productionRunId,sceneId:asset.sceneId,assetType:asset.mimeType,uri:asset.uri,provider:asset.provider,model:asset.model,generated:asset.generated,sourceIds:asset.sourceIds,costUsd:asset.costUsd});
  }
  if(result.qa) await productionRepo.addQaReport({productionRunId,passed:result.qa.passed,score:result.qa.score,containsSyntheticMedia:result.qa.containsSyntheticMedia,blockers:result.qa.blockers,report:result.qa});
  if(result.externalId) await new PublicationRepository(db).create({productionRunId,channelId,youtubeVideoId:result.externalId,state:'private',containsSyntheticMedia:result.qa?.containsSyntheticMedia ?? false,metadata:{renderUri:result.renderUri}});
  console.log(JSON.stringify({productionRunId,state:result.state,qa:result.qa?.score,costUsd:result.manifest?.actualCostUsd,renderUri:result.renderUri,youtubeVideoId:result.externalId ?? null},null,2));
} catch(error) {
  if(productionRunId) await db.query(`update production_runs set state='BLOCKED',metadata=metadata || $2::jsonb,updated_at=now() where id=$1`,[productionRunId,JSON.stringify({error:error instanceof Error?error.message:String(error)})]);
  throw error;
} finally { await db.close(); }
