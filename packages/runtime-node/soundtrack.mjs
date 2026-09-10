import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { selectLicensedSoundtrack } from '@auto-ytb/production';
import { pathFromUri } from './file-path.mjs';

async function run(command,args){await new Promise((res,rej)=>{const child=spawn(command,args,{stdio:['ignore','pipe','pipe']});let stderr='';child.stderr.on('data',(d)=>stderr+=d.toString());child.on('error',rej);child.on('close',(code)=>code===0?res():rej(new Error(`${command} exited ${code}: ${stderr.slice(-1800)}`)));});}
const number=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;

async function loadCatalog(path){
  if(!path)return[];
  const raw=JSON.parse(await readFile(resolve(path),'utf8'));
  const assets=Array.isArray(raw)?raw:Array.isArray(raw.assets)?raw.assets:[];
  return assets.filter((asset)=>asset&&asset.id&&asset.kind&&asset.uri);
}

export async function mixTimedSfx({ffmpeg='ffmpeg',renderUri,sfx=[],baseAudio=true,durationSeconds=0}){
  if(!sfx.length)return renderUri;
  const renderPath=pathFromUri(renderUri);if(!renderPath)throw new Error('Timed SFX mixing currently requires a local rendered MP4');
  const usable=sfx.map((cue)=>({...cue,path:pathFromUri(cue.uri)})).filter((cue)=>cue.path);
  if(!usable.length)return renderUri;
  const requestedDuration=Math.max(0,number(durationSeconds,0));
  const syntheticBaseDuration=Math.max(0.2,requestedDuration||Math.max(...usable.map((cue)=>number(cue.endSec,0)),1));
  const hasExplicitDuration=requestedDuration>0;
  const tmp=`${renderPath}.sfx-${Date.now()}.mp4`;
  const args=['-y','-i',renderPath];
  for(const cue of usable){if(cue.loop)args.push('-stream_loop','-1');args.push('-i',cue.path);}
  const filters=[];
  let baseLabel='[0:a]';
  if(!baseAudio){filters.push(`anullsrc=r=48000:cl=stereo:d=${syntheticBaseDuration}[base]`);baseLabel='[base]';}
  usable.forEach((cue,index)=>{
    const inputIndex=index+1,delay=Math.max(0,Math.round(number(cue.startSec,0)*1000)),gain=Math.max(0.02,Math.min(0.7,number(cue.gain,0.2)));
    const cueLimit=hasExplicitDuration||!baseAudio?Math.max(0.1,Math.min(syntheticBaseDuration-number(cue.startSec,0),number(cue.endSec,syntheticBaseDuration)-number(cue.startSec,0))):Math.max(0.1,number(cue.endSec,0)-number(cue.startSec,0));
    filters.push(`[${inputIndex}:a]volume=${gain}${cue.loop?`,atrim=duration=${cueLimit}`:''},adelay=${delay}|${delay}[sfx${index}]`);
  });
  const inputs=[baseLabel,...usable.map((_,index)=>`[sfx${index}]`)].join('');
  const amixDuration=baseAudio&&!hasExplicitDuration?'first':'longest';
  const trim=hasExplicitDuration||!baseAudio?`,atrim=duration=${syntheticBaseDuration}`:'';
  filters.push(`${inputs}amix=inputs=${usable.length+1}:duration=${amixDuration}:normalize=0${trim},alimiter=limit=0.95[aout]`);
  args.push('-filter_complex',filters.join(';'),'-map','0:v:0','-map','[aout]','-c:v','copy','-c:a','aac','-b:a','192k','-movflags','+faststart','-shortest',tmp);
  await run(ffmpeg,args);await rename(tmp,renderPath);return renderUri;
}

export function withLicensedSoundtrack(renderer,options={}){
  const catalogPath=String(options.catalogPath??'').trim();
  if(!catalogPath)return renderer;
  const ffmpeg=options.ffmpeg??'ffmpeg';
  return {
    name:`${renderer.name}+licensed-soundtrack`,
    inspect:renderer.inspect?.bind(renderer),
    async render(input){
      const manifestPath=pathFromUri(input.manifestUri);if(!manifestPath)throw new Error('Licensed soundtrack requires a local/file manifest');
      const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
      const catalog=await loadCatalog(catalogPath);
      const requireZeroMarginalCost=options.requireZeroMarginalCost!==false;
      const safeCatalog=requireZeroMarginalCost?catalog.filter((asset)=>number(asset.costUsd,0)<=0):catalog;
      const audioMode=manifest.executionPlan?.audioMode??'NARRATION_LED';
      const plan=selectLicensedSoundtrack({script:manifest.script,contentFormat:manifest.contentFormat,catalog:safeCatalog,maxAudioCostUsd:number(options.maxAudioCostUsd,1.5),enableMusic:options.enableMusic!==false,enableSfx:options.enableSfx!==false,audioMode,archetypeId:manifest.executionPlan?.archetypeId??manifest.contentArchetype?.id});
      if(!plan.rightsReady)throw new Error('Soundtrack plan contains audio without CLEARED rights');
      manifest.soundtrack=plan;manifest.music=plan.music;manifest.sfx=plan.sfx;
      await writeFile(manifestPath,JSON.stringify(manifest,null,2),'utf8');
      const rendered=await renderer.render(input);
      const finalUri=await mixTimedSfx({ffmpeg,renderUri:rendered.uri,sfx:plan.sfx,baseAudio:Boolean(manifest.voice?.uri),durationSeconds:number(manifest.script?.targetDurationSec,rendered.durationSeconds??0)});
      return {...rendered,uri:finalUri,costUsd:number(rendered.costUsd,0)+plan.estimatedCostUsd,metadata:{...(rendered.metadata??{}),soundtrack:{rightsReady:plan.rightsReady,music:plan.music?.assetId??null,sfx:plan.sfx.map((cue)=>({assetId:cue.assetId,startSec:cue.startSec,loop:Boolean(cue.loop)})),estimatedCostUsd:plan.estimatedCostUsd,selectionNotes:plan.selectionNotes,audioMode},sfxMixed:plan.sfx.length>0}};
    },
  };
}
