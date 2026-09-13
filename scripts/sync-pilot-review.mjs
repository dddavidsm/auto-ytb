import { mkdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createLiveRuntime } from '../packages/runtime-node/factory.mjs';
import { pathFromUri } from '../packages/runtime-node/file-path.mjs';
import { FileArtifactStore, FileDurableProductionStore } from '../packages/persistence/dist/index.js';

const arg=(name,fallback)=>process.argv.find((value)=>value.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const runId=arg('run-id');
if(!runId)throw new Error('Use --run-id=<production-run-id>');
const manifestPath=resolve(arg('manifest',resolve('.data/storage/projects',runId,'revision-1','manifest.json')));
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
const runtime=createLiveRuntime(process.env);
if(!runtime.db)throw new Error('DATABASE_URL is required to sync the review snapshot');
const db=runtime.db;
const runRow=(await db.query(`select id,video_id,channel_id,format,mode,status,state,budget_usd,estimated_cost_usd,actual_cost_usd,started_at,completed_at,created_at,updated_at,current_stage,failure_stage,failure_reason,resume_from,metadata,config_snapshot from production_runs where id=$1`,[runId])).rows[0];
if(!runRow)throw new Error(`Unknown production run ${runId}`);
const reportRows=await db.query(`select report_type,payload from production_reports where production_run_id=$1`,[runId]);
const dbReports=Object.fromEntries(reportRows.rows.map((row)=>[row.report_type,row.payload]));
const report=dbReports.PublicationCandidateReport??{};
const renderPath=pathFromUri(report.evidence?.renderPath??runRow.metadata?.renderUri??manifest.renderUri);
if(!renderPath)throw new Error('Final render path is unavailable');
const root=resolve('.data/production-runs',runId);const artifactStore=new FileArtifactStore('.data/production-artifacts');const durable=new FileDurableProductionStore('.data/production-runs');
await mkdir(root,{recursive:true});
const now=new Date().toISOString();
const run={id:runId,videoId:runRow.video_id??runId,channelId:runRow.channel_id??'klyverio',format:manifest.contentFormat??runRow.format??'DOCUMENTARY',mode:runRow.mode??'FINAL',status:report.status==='PUBLICATION_CANDIDATE'?'COMPLETED':(runRow.status??'BLOCKED'),budget:Number(runRow.budget_usd??5),estimatedCost:Number(runRow.estimated_cost_usd??0),actualCost:Number(runRow.actual_cost_usd??report.cost?.conservativeTotalUsd??0),currency:'USD',currentStage:'REPORT',failureStage:report.status==='PUBLICATION_CANDIDATE'?undefined:'QC',failureReason:report.status==='PUBLICATION_CANDIDATE'?undefined:(report.blockers??[]).join('; '),resumeFrom:undefined,startedAt:runRow.started_at??now,completedAt:runRow.completed_at??now,createdAt:runRow.created_at??now,updatedAt:now,configSnapshot:{contentFormat:manifest.contentFormat,aspectRatio:manifest.aspectRatio,contentArchetype:manifest.contentArchetype?.id??null,opportunityId:report.evidence?.opportunityId??null,renderPath,revision:manifest.revision?.id??null}};
const existing=await durable.load(runId);if(existing)await durable.saveRun(run);else await durable.createRun(run);
const artifacts=[];
async function addFile(input){try{const info=await stat(input.sourcePath);if(!info.isFile())return null;const artifact=await artifactStore.putFile(input);artifacts.push(artifact);return artifact;}catch{return null;}}
const finalArtifact=await addFile({artifactId:'final-video',runId,type:'RENDER',mimeType:'video/mp4',provider:'ffmpeg-local',model:'local',sourcePath:renderPath,cost:0,isDraft:false,isFinal:true,lifecycle:'FINAL',metadata:{durationSeconds:manifest.voice?.durationSeconds??null,contentFormat:manifest.contentFormat}});
const voicePath=pathFromUri(manifest.voice?.uri);if(voicePath)await addFile({artifactId:'final-voice',runId,type:'VOICE',mimeType:manifest.voice.mimeType??'audio/wav',provider:manifest.voice.provider??'gemini-tts',model:manifest.voice.model,sourcePath:voicePath,cost:Number(manifest.voice.costUsd??0),isDraft:false,isFinal:true,lifecycle:'FINAL',duration:manifest.voice.durationSeconds,metadata:{voiceId:manifest.voice.voiceId??null,alignmentCoverage:manifest.voice.metadata?.alignmentCoverage??null}});
for(const asset of (manifest.assets??[])){const assetPath=pathFromUri(asset.uri);if(!assetPath||!asset.sceneId||!asset.mimeType||asset.mimeType.startsWith('application/'))continue;const type=asset.mimeType.startsWith('video/')?'VIDEO':asset.mimeType.startsWith('audio/')?'SFX':'IMAGE';await addFile({artifactId:asset.id,runId,sceneId:asset.sceneId,type,mimeType:asset.mimeType,provider:asset.provider??'local',model:asset.model??'local',sourcePath:assetPath,cost:Number(asset.costUsd??0),isDraft:false,isFinal:true,lifecycle:'FINAL',metadata:{strategy:asset.metadata?.strategy??asset.strategy??null,revision:asset.metadata?.revision??null}});}
for(const [index,thumbnail] of (manifest.thumbnails??[]).entries()){const thumbnailPath=pathFromUri(thumbnail.uri);if(thumbnailPath)await addFile({artifactId:`thumbnail-${thumbnail.packagingId??index}`,runId,sceneId:`thumbnail:${thumbnail.packagingId??index}`,type:'THUMBNAIL',mimeType:thumbnail.mimeType??'image/jpeg',provider:thumbnail.provider??'gemini-image',model:thumbnail.model,sourcePath:thumbnailPath,cost:Number(thumbnail.costUsd??0),isDraft:false,isFinal:true,lifecycle:'FINAL',metadata:{packagingId:thumbnail.packagingId??null,title:manifest.packaging?.find((item)=>item.id===thumbnail.packagingId)?.title??null}});}
const thumbnailPaths=(manifest.thumbnails??[]).map((item)=>pathFromUri(item.uri)).filter(Boolean);
let contactSheetPath=null;
if(thumbnailPaths.length){
  contactSheetPath=resolve(root,'contact-sheet.jpg');await mkdir(root,{recursive:true});
  const args=['-y',...thumbnailPaths.flatMap((path)=>['-i',path]),'-filter_complex',`[0:v]scale=640:360:force_original_aspect_ratio=increase,crop=640:360[a];[1:v]scale=640:360:force_original_aspect_ratio=increase,crop=640:360[b];[a][b]hstack=inputs=2[out]`,'-map','[out]','-frames:v','1','-q:v','3',contactSheetPath];
  await new Promise((resolvePromise,reject)=>{
    const child=spawn(process.env.FFMPEG_BIN||'ffmpeg',args,{stdio:['ignore','ignore','pipe']});let error='';
    child.stderr.on('data',(chunk)=>error+=chunk.toString());child.on('error',reject);
    child.on('close',(code)=>code===0?resolvePromise():reject(new Error(error.slice(-1200))));
  });
}
const contact=contactSheetPath?await addFile({artifactId:'thumbnail-contact-sheet',runId,type:'THUMBNAIL',mimeType:'image/jpeg',provider:'ffmpeg-local',model:'local',sourcePath:contactSheetPath,cost:0,isDraft:false,isFinal:true,lifecycle:'FINAL',metadata:{candidates:thumbnailPaths.length}}):null;
const sceneTasks=(manifest.scenes??[]).map((scene,index)=>{const asset=manifest.assets?.find((item)=>item.sceneId===scene.id);const artifact=artifacts.find((item)=>item.sceneId===scene.id);return{id:`scene-${index}`,runId,taskKey:`scene-${scene.id}`,kind:String(asset?.provider??scene.kind??'VISUAL').toUpperCase(),sceneId:scene.id,dependencies:index?['voice',`scene-${manifest.scenes[index-1].id}`]:['voice'],provider:asset?.provider??'ffmpeg-local',model:asset?.model??'local',inputHash:'live-manifest',configHash:'live-manifest',artifactHash:artifact?.hash,artifactId:artifact?.artifactId,attempt:1,status:'COMPLETE',estimatedCost:Number(asset?.costUsd??0),actualCost:Number(asset?.costUsd??0),fallbackStrategy:{preferred:scene.strategy??scene.kind??'LOCAL'},metadata:{importance:scene.importanceClass??null,narration:manifest.script?.beats?.find((beat)=>scene.id===beat.id||scene.id.startsWith(`${beat.id}-s`))?.narration??null},updatedAt:now};});
const tasks=[{id:'voice',runId,taskKey:'voice',kind:'VOICE',dependencies:[],provider:manifest.voice?.provider??'gemini-tts',model:manifest.voice?.model??null,inputHash:'live-manifest',configHash:'live-manifest',artifactId:artifacts.find((item)=>item.artifactId==='final-voice')?.artifactId,artifactHash:artifacts.find((item)=>item.artifactId==='final-voice')?.hash,attempt:1,status:'COMPLETE',estimatedCost:Number(manifest.voice?.costUsd??0),actualCost:Number(manifest.voice?.costUsd??0),updatedAt:now},...sceneTasks,{id:'captions',runId,taskKey:'captions',kind:'CAPTIONS',dependencies:['voice'],provider:'ffmpeg-local',model:'local',inputHash:'live-manifest',configHash:'live-manifest',attempt:1,status:'COMPLETE',estimatedCost:0,actualCost:0,updatedAt:now},{id:'render',runId,taskKey:'render',kind:'RENDER',dependencies:['voice',...sceneTasks.map((task)=>task.taskKey)],provider:'ffmpeg-local',model:'local',artifactId:finalArtifact?.artifactId,artifactHash:finalArtifact?.hash,attempt:1,status:'COMPLETE',estimatedCost:0,actualCost:0,updatedAt:now}];
await durable.saveSubtasks(runId,tasks);
const gates=Object.entries(report.dimensions??{}).map(([gateId,status])=>({id:`gate-${gateId.toLowerCase()}`,runId,gateId,status,message:`${gateId} ${status}`,critical:true,payload:{source:'real-pilot-quality-review'},createdAt:now}));await durable.saveQualityGates(runId,gates);
const reports={...dbReports,VisualStrategyPlan:{scenes:(manifest.scenes??[]).map((scene)=>({sceneId:scene.id,importance:{class:scene.importanceClass??'SUPPORT'},preferredStrategy:scene.strategy??scene.kind,selectedProvider:manifest.assets?.find((asset)=>asset.sceneId===scene.id)?.provider??'ffmpeg-local'}))},ThumbnailContactSheet:contact?{artifactId:contact.artifactId,candidates:thumbnailPaths.length,packagingId:manifest.selectedPackagingId,provider:'ffmpeg-local'}:undefined,PilotReviewReport:{status:report.status,blockers:report.blockers??[],dimensions:Object.fromEntries(Object.entries(report.dimensions??{}).map(([key,value])=>[key,{status:value}]))}};for(const [type,payload] of Object.entries(reports)){if(payload!==undefined)await durable.saveReport(runId,type,payload);}
if(report.status==='PUBLICATION_CANDIDATE')await db.query(`update production_runs set status='COMPLETED',state='COMPLETED',budget_usd=greatest(coalesce(budget_usd,0),5),current_stage='REPORT',failure_stage=null,failure_reason=null,resume_from=null,updated_at=now() where id=$1`,[runId]);
console.log(JSON.stringify({runId,status:run.status,finalArtifact:finalArtifact?.path??null,artifactCount:artifacts.length,sceneCount:sceneTasks.length,contactSheet:contact?.path??null},null,2));await db.close();
