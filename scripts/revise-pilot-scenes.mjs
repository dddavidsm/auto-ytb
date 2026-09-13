import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createLiveRuntime } from '../packages/runtime-node/factory.mjs';
import { DurableProductionRepository } from '../packages/persistence/dist/index.js';
import { ffmpegFontOption, pathFromUri } from '../packages/runtime-node/file-path.mjs';

const runId=process.argv.find((value)=>value.startsWith('--run-id='))?.slice(9);
if(!runId)throw new Error('Use --run-id=<production-run-id>');
const selected=new Set(['beat_1-s1','beat_1-s2','beat_5-s1']);
const sourcePath=resolve('.data/storage/projects',runId,'manifest.json');
const manifest=JSON.parse(await readFile(sourcePath,'utf8'));
const revisionRoot=resolve('.data/storage/projects',runId,'revision-1');
await mkdir(revisionRoot,{recursive:true});
const run=(command,args)=>new Promise((resolvePromise,reject)=>{const child=spawn(command,args,{stdio:['ignore','ignore','pipe']});let stderr='';child.stderr.on('data',(chunk)=>stderr+=chunk.toString());child.on('error',reject);child.on('close',(code)=>code===0?resolvePromise():reject(new Error(`${command} exited ${code}: ${stderr.slice(-1000)}`)));});
const reasons={
  'beat_1-s1':'HERO semantic QC found fabricated interface text and weak evidence legibility; replace with deterministic evidence card.',
  'beat_1-s2':'IMPORTANT semantic QC found fabricated terminal text; replace with deterministic evidence card.',
  'beat_5-s1':'IMPORTANT payoff semantic QC found weak visual relevance; replace with a deterministic audit finding card.'
};
const beatOverrides={beat_1:'Technical diagram showing isolated sandbox boxes, a boundary, a red path crossing it, and external benchmark data.',beat_5:'Technical diagram showing the task objective versus the score target, with a reward-hacking path toward the score.'};
const graphicFilters={
  'beat_1-s1':['drawbox=x=iw*0.10:y=ih*0.18:w=iw*0.30:h=ih*0.58:color=0x101a29:t=6','drawbox=x=iw*0.60:y=ih*0.28:w=iw*0.28:h=ih*0.38:color=0x261a1b:t=6','drawbox=x=iw*0.16:y=ih*0.31:w=iw*0.18:h=ih*0.10:color=0x63e6be@0.75:t=fill','drawbox=x=iw*0.16:y=ih*0.49:w=iw*0.18:h=ih*0.10:color=0x63e6be@0.55:t=fill','drawbox=x=iw*0.16:y=ih*0.67:w=iw*0.18:h=ih*0.04:color=0x63e6be@0.38:t=fill','drawbox=x=iw*0.40:y=ih*0.45:w=iw*0.20:h=ih*0.025:color=0xff5964:t=fill','drawbox=x=iw*0.49:y=ih*0.39:w=iw*0.018:h=ih*0.15:color=0xff5964:t=fill','drawbox=x=iw*0.66:y=ih*0.40:w=iw*0.16:h=ih*0.06:color=0xffc857@0.80:t=fill','drawbox=x=iw*0.66:y=ih*0.52:w=iw*0.13:h=ih*0.06:color=0xff5964@0.80:t=fill'],
  'beat_1-s2':['drawbox=x=iw*0.12:y=ih*0.20:w=iw*0.20:h=ih*0.48:color=0x101a29:t=6','drawbox=x=iw*0.40:y=ih*0.20:w=iw*0.20:h=ih*0.48:color=0x101a29:t=6','drawbox=x=iw*0.68:y=ih*0.20:w=iw*0.20:h=ih*0.48:color=0x261a1b:t=6','drawbox=x=iw*0.17:y=ih*0.30:w=iw*0.10:h=ih*0.08:color=0x63e6be:t=fill','drawbox=x=iw*0.45:y=ih*0.30:w=iw*0.10:h=ih*0.08:color=0x63e6be:t=fill','drawbox=x=iw*0.73:y=ih*0.30:w=iw*0.10:h=ih*0.08:color=0xff5964:t=fill','drawbox=x=iw*0.33:y=ih*0.44:w=iw*0.34:h=ih*0.018:color=0xff5964:t=fill','drawbox=x=iw*0.48:y=ih*0.39:w=iw*0.04:h=ih*0.12:color=0xff5964:t=fill','drawbox=x=iw*0.20:y=ih*0.60:w=iw*0.60:h=ih*0.012:color=0xffc857@0.72:t=fill'],
  'beat_5-s1':['drawbox=x=iw*0.15:y=ih*0.22:w=iw*0.70:h=ih*0.48:color=0x101a29:t=6','drawbox=x=iw*0.22:y=ih*0.34:w=iw*0.48:h=ih*0.035:color=0xffc857:t=fill','drawbox=x=iw*0.22:y=ih*0.43:w=iw*0.38:h=ih*0.035:color=0x63e6be@0.78:t=fill','drawbox=x=iw*0.22:y=ih*0.52:w=iw*0.27:h=ih*0.035:color=0x63e6be@0.55:t=fill','drawbox=x=iw*0.22:y=ih*0.61:w=iw*0.50:h=ih*0.035:color=0xff5964@0.85:t=fill','drawbox=x=iw*0.72:y=ih*0.39:w=iw*0.035:h=ih*0.25:color=0xff5964:t=fill','drawbox=x=iw*0.76:y=ih*0.50:w=iw*0.07:h=ih*0.035:color=0xff5964:t=fill']
};
const imagePrompts={
  'beat_1-s1':'Cinematic editorial reconstruction of a computing sandbox boundary being breached: black server rack interior, three isolated glowing blue containment chambers on the left, one clean red breach signal breaking through a divider toward a bright benchmark repository on the right. No screen, no terminal, no readable text, no people, no logos, no watermark. High-contrast evidence-led documentary still, coherent dark navy and amber channel palette, 16:9.',
  'beat_1-s2':'Cinematic editorial reconstruction of three isolated dark server modules with a clear red cross-boundary path escaping toward an external repository. Show containment, boundary, and consequence through geometry and light. No screen, no terminal, no readable text, no people, no logos, no watermark. Evidence-led documentary still, dark navy, amber and restrained red palette, 16:9.',
  'beat_5-s1':'Cinematic editorial reconstruction of an audit finding: dark server room, a bright target indicator on the right, a red path crossing a containment boundary from isolated blue modules, visual metaphor for optimizing a score instead of the task. No screen, no terminal, no readable text, no people, no logos, no watermark. Clean evidence-led documentary still, coherent dark navy and amber channel palette, 16:9.'
};
const programmaticFilters={
  'beat_1-s1':['drawbox=x=iw*0.08:y=ih*0.18:w=iw*0.34:h=ih*0.58:color=0x101a29:t=6','drawbox=x=iw*0.14:y=ih*0.29:w=iw*0.22:h=ih*0.13:color=0x63e6be@0.36:t=fill','drawbox=x=iw*0.14:y=ih*0.49:w=iw*0.22:h=ih*0.13:color=0x63e6be@0.24:t=fill','drawbox=x=iw*0.58:y=ih*0.25:w=iw*0.32:h=ih*0.44:color=0x101a29:t=6','drawbox=x=iw*0.42:y=ih*0.45:w=iw*0.19:h=ih*0.035:color=0xff5964:t=fill','drawbox=x=iw*0.50:y=ih*0.39:w=iw*0.025:h=ih*0.16:color=0xff5964:t=fill','drawtext=text=\'ISOLATED SANDBOXES\':fontcolor=0x63e6be:fontsize=48:x=iw*0.13:y=ih*0.23','drawtext=text=\'BOUNDARY\':fontcolor=0xff5964:fontsize=42:x=iw*0.43:y=ih*0.37','drawtext=text=\'EXTERNAL DATA\':fontcolor=0xffc857:fontsize=48:x=iw*0.62:y=ih*0.31'],
  'beat_1-s2':['drawbox=x=iw*0.09:y=ih*0.20:w=iw*0.22:h=ih*0.48:color=0x101a29:t=6','drawbox=x=iw*0.39:y=ih*0.20:w=iw*0.22:h=ih*0.48:color=0x101a29:t=6','drawbox=x=iw*0.69:y=ih*0.20:w=iw*0.22:h=ih*0.48:color=0x261a1b:t=6','drawbox=x=iw*0.17:y=ih*0.39:w=iw*0.06:h=ih*0.06:color=0x63e6be:t=fill','drawbox=x=iw*0.47:y=ih*0.39:w=iw*0.06:h=ih*0.06:color=0x63e6be:t=fill','drawbox=x=iw*0.77:y=ih*0.39:w=iw*0.06:h=ih*0.06:color=0xff5964:t=fill','drawbox=x=iw*0.31:y=ih*0.41:w=iw*0.08:h=ih*0.012:color=0xffc857:t=fill','drawbox=x=iw*0.61:y=ih*0.41:w=iw*0.08:h=ih*0.012:color=0xff5964:t=fill','drawtext=text=\'SANDBOX A\':fontcolor=0x63e6be:fontsize=44:x=iw*0.13:y=ih*0.27','drawtext=text=\'SANDBOX B\':fontcolor=0x63e6be:fontsize=44:x=iw*0.43:y=ih*0.27','drawtext=text=\'OUTSIDE\':fontcolor=0xff5964:fontsize=44:x=iw*0.74:y=ih*0.27','drawtext=text=\'NO OUTBOUND PATH\':fontcolor=0xffc857:fontsize=42:x=iw*0.35:y=ih*0.77'],
  'beat_5-s1':['drawbox=x=iw*0.10:y=ih*0.20:w=iw*0.34:h=ih*0.50:color=0x101a29:t=6','drawbox=x=iw*0.56:y=ih*0.20:w=iw*0.34:h=ih*0.50:color=0x261a1b:t=6','drawbox=x=iw*0.18:y=ih*0.38:w=iw*0.18:h=ih*0.07:color=0x63e6be:t=fill','drawbox=x=iw*0.64:y=ih*0.38:w=iw*0.18:h=ih*0.07:color=0xffc857:t=fill','drawbox=x=iw*0.43:y=ih*0.50:w=iw*0.14:h=ih*0.035:color=0xff5964:t=fill','drawtext=text=\'TASK\':fontcolor=0x63e6be:fontsize=52:x=iw*0.23:y=ih*0.29','drawtext=text=\'SCORE\':fontcolor=0xffc857:fontsize=52:x=iw*0.70:y=ih*0.29','drawtext=text=\'REWARD HACKING\':fontcolor=0xff5964:fontsize=48:x=iw*0.39:y=ih*0.78']
};
const runtime=createLiveRuntime(process.env);
const changed=[];
for(const scene of manifest.scenes){
  if(!selected.has(scene.id))continue;
  const beatId=String(scene.id).split('-s')[0];
  scene.kind='image';
  scene.importanceClass=scene.id==='beat_1-s1'?'HERO':'IMPORTANT';
  scene.instruction='Clean original evidence card with concise verified labels; no simulated terminal, prompt, or production metadata text.';
  const beat=manifest.script?.beats?.find((candidate)=>candidate.id===beatId);
  if(beat&&beatOverrides[beatId])beat.visualIntent=beatOverrides[beatId];
  const asset=manifest.assets.find((candidate)=>candidate.sceneId===scene.id);
  let revisedAsset;
  if(process.env.REVISION_USE_GEMINI==='true'&&runtime.image&&imagePrompts[scene.id]){
    try{revisedAsset=await runtime.image.generate({prompt:imagePrompts[scene.id],aspectRatio:'16:9'});}catch(error){console.log(`Image revision fallback for ${scene.id}: ${error instanceof Error?error.message:String(error)}`);}
  }
  if(!revisedAsset){const graphicPath=join(revisionRoot,`${scene.id}.png`);const font=ffmpegFontOption();const prefix=font?`${font}:`:'';const filters=programmaticFilters[scene.id].map((filter)=>{if(!filter.startsWith('drawtext='))return filter;return filter.replace('drawtext=',`drawtext=${prefix}`).replaceAll(':x=iw*',':x=w*').replaceAll(':y=ih*',':y=h*');});await run(process.env.FFMPEG_BIN||'ffmpeg',['-y','-f','lavfi','-i','color=c=0x070b12:s=1920x1080','-frames:v','1','-vf',filters.join(','),'-pix_fmt','rgb24',graphicPath]);revisedAsset={uri:pathToFileURL(graphicPath).href,mimeType:'image/png',bytes:0,provider:'ffmpeg-local',model:'programmatic-evidence-card'};}
  if(asset){const revisedCost=revisedAsset.provider==='ffmpeg-local'?0:Number(revisedAsset.metadata?.costUsd??0.067);asset.uri=revisedAsset.uri;asset.mimeType=revisedAsset.mimeType;asset.provider=revisedAsset.provider;asset.model=revisedAsset.model;asset.generated=Boolean(revisedAsset.provider!=='ffmpeg-local');asset.costUsd=revisedCost;asset.metadata={...(asset.metadata??{}),strategy:revisedAsset.provider==='ffmpeg-local'?'PROGRAMMATIC_GRAPHIC':'AI_IMAGE',revision:'RevisionRun-1',revisionReason:reasons[scene.id],costUsd:revisedCost};}
  changed.push({sceneId:scene.id,reason:reasons[scene.id],strategy:revisedAsset.provider==='ffmpeg-local'?'PROGRAMMATIC_GRAPHIC':'AI_IMAGE',provider:revisedAsset.provider,costUsd:revisedAsset.provider==='ffmpeg-local'?0:0.067});
}
const manifestPath=join(revisionRoot,'manifest.json');
await writeFile(manifestPath,`${JSON.stringify(manifest,null,2)}\n`,'utf8');
const rendered=await runtime.renderer.render({manifestUri:pathToFileURL(manifestPath).href,outputKey:`projects/${runId}/revision-1/final-v2.mp4`});
const inspection=await runtime.renderer.inspect({fileUri:rendered.uri,expectedWidth:1920,expectedHeight:1080,expectedDurationSeconds:Number(manifest.voice?.durationSeconds??63),requireAudio:true});
manifest.renderUri=rendered.uri;
manifest.revision={parentRunId:runId,revisionRunId:randomUUID(),version:'v2',changedScenes:changed,createdAt:new Date().toISOString(),inspection};
await writeFile(manifestPath,`${JSON.stringify(manifest,null,2)}\n`,'utf8');
if(runtime.db){const durable=new DurableProductionRepository(runtime.db);await durable.saveReport(runId,'RevisionRun',{revisionRunId:manifest.revision.revisionRunId,parentRunId:runId,selectedSceneIds:changed.map((item)=>item.sceneId),reasons:changed.map((item)=>item.reason),changedScenes:changed,additionalExternalCostUsd:0,renderUri:rendered.uri,inspection});await durable.updateRun(runId,{status:'PARTIAL',currentStage:'RENDER',failureStage:undefined,failureReason:undefined,resumeFrom:undefined});await runtime.db.close();}
console.log(JSON.stringify({runId,revisionRunId:manifest.revision.revisionRunId,changedScenes:changed,renderUri:rendered.uri,renderPath:pathFromUri(rendered.uri),inspection},null,2));
