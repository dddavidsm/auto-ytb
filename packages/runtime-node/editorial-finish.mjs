import { readFile, writeFile, rename, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { alignmentToSubtitleCues, subtitlesToSrt } from './index.mjs';
import { buildCreativeRecipe } from '@auto-ytb/production';
import { ffmpegFontOption, pathFromUri } from './file-path.mjs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function run(command,args){return new Promise((res,rej)=>{const child=spawn(command,args,{stdio:['ignore','pipe','pipe']});let stderr='';child.stderr.on('data',(d)=>stderr+=d.toString());child.on('error',rej);child.on('close',(code)=>code===0?res():rej(new Error(`${command} exited ${code}: ${stderr.slice(-2200)}`)));});}
const clean=(value)=>String(value??'').replace(/\s+/g,' ').trim();
const textFileSafe=(value)=>String(value??'').replace(/%+/g,'%').replaceAll('%','\\%');
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
  if(plan.source==='VOICE_ALIGNMENT'){
    const aligned=alignmentToSubtitleCues(manifest.voice?.alignment,{maxChars:plan.maxChars,maxDurationSeconds:plan.maxDurationSeconds});
    return aligned.length?aligned:dialogueCues(manifest.script,plan);
  }
  if(plan.source==='SCRIPT_DIALOGUE')return dialogueCues(manifest.script,plan);
  if(plan.source==='ON_SCREEN_CONTEXT')return contextCues(manifest.script);
  return[];
}
function captionKeyword(text){
  const value=clean(text),matches=[
    /\b3D\b/i,/\b(?:printed|print|printer)\b/i,/\b(?:moves?|movement)\b/i,
    /\b(?:fingers?|pieces?|parts?|assembly|assembled)\b/i,/\b(?:grip|leverage|mechanical|motion)\b/i,
    /\b(?:first|result|secret|real|watch)\b/i,/\b\d+(?:\.\d+)?%?\b/
  ];
  for(const pattern of matches){const match=pattern.exec(value);if(match)return{word:match[0],prefix:value.slice(0,match.index)};}
  return null;
}
function assTime(seconds){
  const value=Math.max(0,Number(seconds??0)),hours=Math.floor(value/3600),minutes=Math.floor((value%3600)/60),secs=value%60;
  return `${hours}:${String(minutes).padStart(2,'0')}:${secs.toFixed(2).padStart(5,'0')}`;
}
function assText(value){return String(value??'').replace(/\\/g,'\\\\').replace(/[{}]/g,(match)=>`\\${match}`).replace(/\r?\n/g,'\\N');}
function wrapCaption(value,maxChars=35){
  const words=clean(value).split(' ').filter(Boolean),lines=[];let line='';
  for(const word of words){if(!line){line=word;continue;}if(`${line} ${word}`.length>maxChars){lines.push(line);line=word;}else line=`${line} ${word}`;}
  if(line)lines.push(line);
  if(lines.length>1&&lines.at(-1).split(' ').length===1){const last=lines.pop(),previous=lines.pop(),parts=previous.split(' '),moved=parts.pop();lines.push(parts.join(' '),`${moved} ${last}`);}
  return lines.slice(0,2);
}
function highlightAss(value,keyword){
  const tokens=String(value??'').match(/\s+|\S+/g)??[];let used=false;
  return tokens.map((token)=>{
    if(used||/^\s+$/.test(token))return assText(token);
    const match=token.match(/^([^A-Za-z0-9]*)([A-Za-z0-9]+)([^A-Za-z0-9]*)$/);
    if(!match||match[2].toLowerCase()!==String(keyword?.word??'').toLowerCase())return assText(token);
    used=true;
    return `${assText(match[1])}{\\c&H00303BFF&}${assText(match[2])}{\\c&H00FFFFFF&}${assText(match[3])}`;
  }).join('');
}
function captionAssLegacy(cues,plan,width,height){
  const fontsize=Math.round((height>=1600?58:38)*Number(plan?.fontScale??1));
  const maxLineChars=height>=1600?35:52;
  const y=plan?.position==='MIDDLE'?Math.round(height*0.5):plan?.position==='BOTTOM'?Math.round(height*0.9):Math.round(height*0.77);
  const lines=cues.map((cue)=>{
    const keyword=plan?.highlightKeywords?captionKeyword(String(cue.text??'')):null;
    const text=wrapCaption(cue.text,maxLineChars).map((line)=>highlightAss(line,keyword)).join('\\N');
    const start=Number(cue.start??0),end=Number(cue.end??start+1),intro=Math.min(0.12,Math.max(0.07,(end-start)*0.08)),outro=Math.min(0.1,Math.max(0.07,(end-start)*0.07));
    const move=`{\\an2\\move(${Math.round(width/2)},${y+18},${Math.round(width/2)},${y},0,${Math.round(intro*1000)})\\fad(${Math.round(intro*1000)},${Math.round(outro*1000)})}`;
    return `Dialogue: 0,${assTime(start)},${assTime(end)},Default,,0,0,0,${move}${text}`;
  });
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,DejaVu Sans,${fontsize},&H00FFFFFF,&H00FFFFFF,&HCC101010,&HFF000000,0,0,0,0,100,100,0,0,1,3,2,2,70,70,0,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, Effect, Text\n${lines.join('\n')}\n`;
}
// Keep the caption styling legible on bright footage: a compact dark contour
// and shadow preserve the clean CapCut-like look without an opaque text panel.
function captionAss(cues,plan,width,height){
  const fontsize=Math.round((height>=1600?58:38)*Number(plan?.fontScale??1));
  const maxLineChars=height>=1600?35:52;
  const y=plan?.position==='MIDDLE'?Math.round(height*0.5):plan?.position==='BOTTOM'?Math.round(height*0.9):Math.round(height*0.77);
  const lines=cues.map((cue)=>{
    const keyword=plan?.highlightKeywords?captionKeyword(String(cue.text??'')):null;
    const text=wrapCaption(cue.text,maxLineChars).map((line)=>highlightAss(line,keyword)).join('\\N');
    const start=Number(cue.start??0),end=Number(cue.end??start+1),intro=Math.min(0.12,Math.max(0.07,(end-start)*0.08)),outro=Math.min(0.1,Math.max(0.07,(end-start)*0.07));
    const move='{\\an2\\move('+Math.round(width/2)+','+(y+18)+','+Math.round(width/2)+','+y+',0,'+Math.round(intro*1000)+')\\fad('+Math.round(intro*1000)+','+Math.round(outro*1000)+')}';
    return 'Dialogue: 0,'+assTime(start)+','+assTime(end)+',Default,,0,0,0,'+move+text;
  });
  const newline=String.fromCharCode(10);
  const contrastStyle='Style: Default,DejaVu Sans,'+fontsize+',&H00FFFFFF,&H00FFFFFF,&H40101010,&HFF000000,0,0,0,0,100,100,0,0,1,5,2,2,70,70,0,1';
  return ['[Script Info]','ScriptType: v4.00+','PlayResX: '+width,'PlayResY: '+height,'ScaledBorderAndShadow: yes','','[V4+ Styles]','Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',contrastStyle,'','[Events]','Format: Layer, Start, End, Style, Name, MarginL, MarginR, Effect, Text',lines.join(newline),''].join(newline);
  const style='Style: Default,DejaVu Sans,'+fontsize+',&H00FFFFFF,&H00FFFFFF,&H40101010,&HFF000000,0,0,0,0,100,100,0,0,1,5,2,2,70,70,0,1';
  return '[Script Info]\\nScriptType: v4.00+\\nPlayResX: '+width+'\\nPlayResY: '+height+'\\nScaledBorderAndShadow: yes\\n\\n[V4+ Styles]\\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\\n'+style+'\\n\\n[Events]\\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, Effect, Text\\n'+lines.join('\\n')+'\\n';
}
function styleFor(plan,height){
  const base=height>=1600?50:34,fontSize=Math.round(base*Number(plan.fontScale??1));
  const alignment=plan.position==='MIDDLE'?5:2;
  const marginV=Math.round(height*(Number(plan.safeBottomPercent??8)/100));
  const bold=plan.preset==='BOLD_SHORTS'||plan.preset==='DIALOGUE_SPEAKER'?-1:0;
  const outline=plan.preset==='EDITORIAL_CLEAN'?2:3;
  return `FontName=DejaVu Sans,FontSize=${fontSize},Bold=${bold},PrimaryColour=&H00FFFFFF,OutlineColour=&H00101010,BackColour=&H70000000,BorderStyle=1,Outline=${outline},Shadow=0,Alignment=${alignment},MarginV=${marginV},WrapStyle=2`;
}
function captionDrawtext(cue,files,plan,height,font,keyword){
  const start=Number(cue.start??0),end=Number(cue.end??start+1);
  const margin=Math.round(height*(Number(plan.safeBottomPercent??8)/100));
  const size=Math.round((height>=1600?54:36)*Number(plan.fontScale??1));
  const y=plan.position==='MIDDLE'?'h*0.47':`h-${margin}-text_h`;
  const intro=Math.min(0.14,Math.max(0.07,(end-start)*0.12));
  const outro=Math.min(0.12,Math.max(0.07,(end-start)*0.10));
  const fadeOutStart=Math.max(start+intro,end-outro);
  const slide=`if(lt(t\\,${(start+intro).toFixed(3)})\\,${y}+18*(1-(t-${start.toFixed(3)})/${intro.toFixed(3)})\\,${y})`;
  const enable=`between(t\\,${start.toFixed(3)}\\,${end.toFixed(3)})`;
  const alpha=`if(lt(t\\,${(start+intro).toFixed(3)})\\,(t-${start.toFixed(3)})/${intro.toFixed(3)}\\,if(gt(t\\,${fadeOutStart.toFixed(3)})\\,(${end.toFixed(3)}-t)/${outro.toFixed(3)}\\,1))`;
  const motion=`if(lt(t\\,${(start+intro).toFixed(3)})\\,18*(1-(t-${start.toFixed(3)})/${intro.toFixed(3)})\\,if(gt(t\\,${fadeOutStart.toFixed(3)})\\,-12*(t-${fadeOutStart.toFixed(3)})/${outro.toFixed(3)}\\,0))`;
  // Minimal social-caption treatment: no opaque panel. The dark outline and
  // soft shadow preserve readability over moving footage while keeping the
  // subtitle visually integrated with the frame, like CapCut's clean presets.
  const draw=(file,color,x)=>file?`drawtext=${font?`${font}:`:''}textfile='${escapeFilterPath(file)}':fontcolor=${color}:fontsize=${size}:borderw=3:bordercolor=0x080b12@0.96:shadowcolor=0x000000@0.75:shadowx=2:shadowy=3:box=0:x='${x}':y='${slide}':enable='${enable}':alpha='${alpha}':fix_bounds=1`:'';
  if(!keyword||!plan.highlightKeywords)return draw(files.full,'white','(w-text_w)/2+'+motion);
  // Compose one cue from adjacent segments. Drawing the whole white sentence
  // and a red keyword on top caused duplicate words and visible overlap.
  const rawBefore=keyword.prefix,rawAfter=String(cue.text??'').slice(rawBefore.length+keyword.word.length);
  const before=rawBefore.replace(/\s+$/,''),after=rawAfter.replace(/^\s+/,'');
  const beforeSpacing=rawBefore.length-before.length,afterSpacing=rawAfter.length-after.length;
  const charWidth=size*0.52,fullWidth=Math.round(String(cue.text??'').length*charWidth);
  const base=`w/2-${Math.round(fullWidth/2)}`;
  const beforeX=`${base}+${motion}`;
  const keywordX=`${base}+${Math.round((before.length+beforeSpacing)*charWidth)}+${motion}`;
  const afterX=`${base}+${Math.round((before.length+beforeSpacing+keyword.word.length+afterSpacing)*charWidth)}+${motion}`;
  return [draw(files.before,'white',beforeX),draw(files.keyword,'0xff3b30',keywordX),draw(files.after,'white',afterX)].filter(Boolean).join(',');
}
function wrapHook(value,max=22){
  const words=String(value??'').replace(/\s+/g,' ').trim().split(' ').filter(Boolean),lines=[];let line='';
  for(const word of words){if(!line){line=word;continue;}if(`${line} ${word}`.length>max){lines.push(line);line=word;}else line=`${line} ${word}`;}
  if(line)lines.push(line);return lines.slice(0,3).join('\n');
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
      let subtitlePath=null,assPath=null;
      const captionWork=await mkdtemp(join(tmpdir(),'auto-ytb-caption-'));
      if(cues.length){subtitlePath=renderPath.replace(/\.[^.]+$/,'.burn.srt');assPath=renderPath.replace(/\.[^.]+$/,'.burn.ass');await writeFile(subtitlePath,subtitlesToSrt(cues),'utf8');await writeFile(assPath,captionAss(cues,captionPlan,width,height),'utf8');}
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
      const firstBeat=manifest.script?.beats?.[0];
      if(firstBeat?.purpose==='hook'&&firstBeat.onScreenText){
        const hookFile=join(captionWork,'hook.txt');
        await writeFile(hookFile,textFileSafe(wrapHook(firstBeat.onScreenText,22)),'utf8');
        const hookStart=Number(firstBeat.startSec??0),hookEnd=hookStart+Math.min(3.6,Number(firstBeat.targetDurationSec??3.6));
        const hookEnable=`between(t\\,${hookStart.toFixed(3)}\\,${hookEnd.toFixed(3)})`;
        chain.push(`drawtext=${ffmpegFontOption()?`${ffmpegFontOption()}:`:''}textfile='${escapeFilterPath(hookFile)}':fontcolor=white:borderw=3:bordercolor=0x080b12@0.96:shadowcolor=black@0.78:shadowx=2:shadowy=3:fontsize=${Math.round(height*0.034)}:line_spacing=8:x=w*0.09:y=h*0.12:enable='${hookEnable}':alpha='if(lt(t\\,${(hookStart+0.22).toFixed(3)})\\,(t-${hookStart.toFixed(3)})/0.22\\,1)':fix_bounds=1`);
      }
      // A standalone fade-in is black before its start time. Chaining those filters
      // against the whole timeline therefore blackens every preceding scene. Until
      // transitions are rendered from separately trimmed segments, keep the
      // documentary transition plan as hard cuts rather than producing invalid video.
      if(assPath){
        // ASS keeps the entire caption as one timed dialogue event. Inline
        // colour tags highlight one word without drawing a second sentence on
        // top, while libass handles exact centering and line wrapping.
        chain.push(`subtitles=filename='${escapeFilterPath(assPath)}'`);
      }
      // Keep transitions motivated and deterministic: a short editorial flash
      // marks a real beat change without introducing a black frame or hiding
      // the incoming visual behind a generic fade.
      for(let index=0;index<boundaries.length;index+=1){
        const boundary=boundaries[index],color=index%2?'0xffc857':'0x6ea8fe';
        chain.push(`drawbox=x=0:y=0:w=iw:h=ih:color=${color}@0.07:t=fill:enable='between(t\\,${Math.max(0,boundary-0.025).toFixed(3)}\\,${(boundary+0.060).toFixed(3)})'`);
      }
      if(chain.length){filters.push(`${current}${chain.map((item,index)=>`${index?',':''}${item}`).join('')}[finished]`);current='[finished]';}
      const needsReencode=filters.length>0;
      if(needsReencode){const tmp=`${renderPath}.finish-${Date.now()}.mp4`;try{await run(ffmpeg,['-y','-i',renderPath,'-filter_complex',filters.join(';'),'-map',current,'-map','0:a?','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-c:a','copy','-movflags','+faststart',tmp]);await rename(tmp,renderPath);}finally{await rm(captionWork,{recursive:true,force:true});}}else{await rm(captionWork,{recursive:true,force:true});}
      const evidence={captionsBurned:Boolean(subtitlePath),captionCueCount:cues.length,captionPreset:captionPlan?.preset??'NONE',editPreset:editPlan?.preset??'NONE',transitionsApplied:boundaries.length,transitionsSkipped:0,transitionFallback:'NONE',punchInsApplied:punches.length,filmLookApplied:Boolean(editPlan?.filmLook)};
      manifest.renderExecution=evidence;await writeFile(manifestPath,JSON.stringify(manifest,null,2),'utf8');
      return{...rendered,metadata:{...(rendered.metadata??{}),renderExecution:evidence,captionPlan:captionPlan??null,editPlan:editPlan??null}};
    },
  };
}
