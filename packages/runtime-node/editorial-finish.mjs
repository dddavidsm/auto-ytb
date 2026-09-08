import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { alignmentToSubtitleCues, subtitlesToSrt } from './index.mjs';
import { buildCreativeRecipe } from '@auto-ytb/production';

function pathFromUri(uri){if(String(uri??'').startsWith('file://'))return new URL(uri).pathname;if(String(uri??'').startsWith('/')||String(uri??'').startsWith('.'))return resolve(String(uri));return null;}
function run(command,args){return new Promise((res,rej)=>{const child=spawn(command,args,{stdio:['ignore','pipe','pipe']});let stderr='';child.stderr.on('data',(d)=>stderr+=d.toString());child.on('error',rej);child.on('close',(code)=>code===0?res():rej(new Error(`${command} exited ${code}: ${stderr.slice(-2200)}`)));});}
const clean=(value)=>String(value??'').replace(/\s+/g,' ').trim();
const escapeFilterPath=(path)=>String(path).replaceAll('\\','/').replaceAll(':','\\:').replaceAll("'","\\'");

function dialogueCues(script,plan){
  const cues=[];
  for(const beat of script?.beats??[]){
    const lines=String(beat.narration??'').split(/\n+/).map((line)=>line.trim()).filter(Boolean);
    const turns=lines.map((line)=>{const match=line.match(/^\[([^\]]+)\]\s*(.+)$/);return match?{speaker:match[1].trim(),text:match[2].trim()}:{speaker:null,text:line};}).filter((turn)=>turn.text);
    if(!turns.length)continue;
    const weights=turns.map((turn)=>Math.max(1,turn.text.length)),total=weights.reduce((a,b)=>a+b,0);let cursor=Number(beat.startSec??0);
    turns.forEach((turn,index)=>{const duration=Math.max(0.55,Number(beat.targetDurationSec??0)*(weights[index]/Math.max(1,total)));const end=Math.min(Number(beat.startSec??0)+Number(beat.targetDurationSec??0),cursor+duration);cues.push({text:plan.speakerAware&&turn.speaker?`${turn.speaker}: ${turn.text}`:turn.text,start:cursor,end});cursor=end;});
  }
  return cues;
}
function contextCues(script){
  const cues=[];
  for(const beat of script?.beats??[]){const text=clean(beat.onScreenText);if(!text)continue;cues.push({text,start:Number(beat.startSec??0),end:Number(beat.startSec??0)+Math.min(Number(beat.targetDurationSec??2.8),4.5)});}
  return cues;
}
function captionCues(manifest,plan){
  if(!plan?.enabled||!plan?.burnIn)return[];
  if(plan.source==='VOICE_ALIGNMENT')return alignmentToSubtitleCues(manifest.voice?.alignment,{maxChars:plan.maxChars,maxDurationSeconds:plan.maxDurationSeconds});
  if(plan.source==='SCRIPT_DIALOGUE')return dialogueCues(manifest.script,plan);
  if(plan.source==='ON_SCREEN_CONTEXT')return contextCues(manifest.script);
  return[];
}
function styleFor(plan,height){
  const base=height>=1600?50:34,fontSize=Math.round(base*Number(plan.fontScale??1));
  const alignment=plan.position==='MIDDLE'?5:2;
  const marginV=Math.round(height*(Number(plan.safeBottomPercent??8)/100));
  const bold=plan.preset==='BOLD_SHORTS'||plan.preset==='DIALOGUE_SPEAKER'?-1:0;
  const outline=plan.preset==='EDITORIAL_CLEAN'?2:3;
  return `FontName=DejaVu Sans,FontSize=${fontSize},Bold=${bold},PrimaryColour=&H00FFFFFF,OutlineColour=&H00101010,BackColour=&H70000000,BorderStyle=1,Outline=${outline},Shadow=0,Alignment=${alignment},MarginV=${marginV},WrapStyle=2`;
}
function beatForScene(manifest,scene){return(manifest.script?.beats??[]).find((beat)=>scene.id===beat.id||scene.id.startsWith(`${beat.id}-s`));}
function punchIntervals(manifest,plan){
  if(!plan?.punchInAnchors)return[];
  const seen=new Set(),out=[];
  for(const scene of manifest.scenes??[]){const beat=beatForScene(manifest,scene);if(!beat||seen.has(beat.id)||!['hook','reveal','payoff'].includes(beat.purpose))continue;seen.add(beat.id);out.push([Number(scene.startSec??0),Number(scene.startSec??0)+Math.min(Number(scene.durationSec??0),beat.purpose==='hook'?3.2:2.4)]);if(out.length>=4)break;}
  return out;
}
function transitionBoundaries(manifest,plan){
  if(!plan||plan.transitionMode==='HARD_CUT'||Number(plan.transitionDurationSeconds??0)<=0)return[];
  const scenes=manifest.scenes??[],out=[];
  for(let i=0;i<scenes.length-1;i+=1){const next=scenes[i+1],beat=beatForScene(manifest,next);if(plan.transitionMode==='SOFT_FADE'||['reveal','payoff'].includes(beat?.purpose))out.push(Number(next.startSec??0));if(out.length>=10)break;}
  return out;
}

export function withArchetypeEditorialFinish(renderer,options={}){
  const ffmpeg=options.ffmpeg??'ffmpeg';
  return{
    name:`${renderer.name}+archetype-finish`,
    inspect:renderer.inspect?.bind(renderer),
    async render(input){
      const manifestPath=pathFromUri(input.manifestUri);if(!manifestPath)throw new Error('Archetype editorial finishing requires a local/file manifest');
      const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
      const execution=manifest.executionPlan;
      if(execution&&(!manifest.captionPlan||!manifest.editPlan)){const recipe=buildCreativeRecipe(execution,manifest.contentFormat);manifest.captionPlan??=recipe.captionPlan;manifest.editPlan??=recipe.editPlan;await writeFile(manifestPath,JSON.stringify(manifest,null,2),'utf8');}
      const rendered=await renderer.render(input);
      const renderPath=pathFromUri(rendered.uri);if(!renderPath)return rendered;
      const captionPlan=manifest.captionPlan,editPlan=manifest.editPlan;
      const cues=captionCues(manifest,captionPlan);
      const width=Number(manifest.frame?.width??(manifest.contentFormat==='SHORT_VERTICAL'?1080:1920)),height=Number(manifest.frame?.height??(manifest.contentFormat==='SHORT_VERTICAL'?1920:1080));
      const punches=punchIntervals(manifest,editPlan),boundaries=transitionBoundaries(manifest,editPlan);
      let subtitlePath=null;
      if(cues.length){subtitlePath=renderPath.replace(/\.[^.]+$/,'.burn.srt');await writeFile(subtitlePath,subtitlesToSrt(cues),'utf8');}
      const filters=[];let current='[0:v]';
      if(punches.length){
        const enable=punches.map(([start,end])=>`between(t\\,${start.toFixed(3)}\\,${end.toFixed(3)})`).join('+');
        const scale=Math.max(1.005,Math.min(1.08,Number(editPlan?.punchInScale??1.025)));
        filters.push(`${current}split=2[base][zoomsrc]`);
        filters.push(`[zoomsrc]scale=ceil(iw*${scale}/2)*2:ceil(ih*${scale}/2)*2,crop=${width}:${height}:(in_w-out_w)/2:(in_h-out_h)/2[zoomed]`);
        filters.push(`[base][zoomed]overlay=0:0:enable='${enable}'[punched]`);current='[punched]';
      }
      const chain=[];
      if(editPlan?.filmLook){chain.push('eq=contrast=1.025:saturation=0.975:brightness=-0.004');const grain=Math.max(0,Math.min(6,Number(editPlan.filmGrain??0)));if(grain>0)chain.push(`noise=alls=${grain}:allf=t`);}
      const fadeDuration=Math.max(0.05,Math.min(0.35,Number(editPlan?.transitionDurationSeconds??0.12)));
      for(const boundary of boundaries){const outStart=Math.max(0,boundary-fadeDuration);chain.push(`fade=t=out:st=${outStart.toFixed(3)}:d=${fadeDuration.toFixed(3)}`,`fade=t=in:st=${boundary.toFixed(3)}:d=${fadeDuration.toFixed(3)}`);}
      if(subtitlePath)chain.push(`subtitles=filename='${escapeFilterPath(subtitlePath)}':force_style='${styleFor(captionPlan,height)}'`);
      if(chain.length){filters.push(`${current}${chain.map((item,index)=>`${index?',':''}${item}`).join('')}[finished]`);current='[finished]';}
      const needsReencode=filters.length>0;
      if(needsReencode){const tmp=`${renderPath}.finish-${Date.now()}.mp4`;await run(ffmpeg,['-y','-i',renderPath,'-filter_complex',filters.join(';'),'-map',current,'-map','0:a?','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-c:a','copy','-movflags','+faststart',tmp]);await rename(tmp,renderPath);}
      const evidence={captionsBurned:Boolean(subtitlePath),captionCueCount:cues.length,captionPreset:captionPlan?.preset??'NONE',editPreset:editPlan?.preset??'NONE',transitionsApplied:boundaries.length,punchInsApplied:punches.length,filmLookApplied:Boolean(editPlan?.filmLook)};
      manifest.renderExecution=evidence;await writeFile(manifestPath,JSON.stringify(manifest,null,2),'utf8');
      return{...rendered,metadata:{...(rendered.metadata??{}),renderExecution:evidence,captionPlan:captionPlan??null,editPlan:editPlan??null}};
    },
  };
}
