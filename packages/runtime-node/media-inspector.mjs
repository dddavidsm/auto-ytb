import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

function localPath(uri){
  if(String(uri).startsWith('file://')) return fileURLToPath(uri);
  if(String(uri).startsWith('/')||String(uri).startsWith('.')) return resolve(uri);
  throw new Error(`Final media inspection requires local/file URI, got ${uri}`);
}
function capture(command,args){return new Promise((resolvePromise,reject)=>{const child=spawn(command,args,{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',(chunk)=>{stdout+=chunk.toString();});child.stderr.on('data',(chunk)=>{stderr+=chunk.toString();});child.on('error',reject);child.on('close',(code)=>code===0?resolvePromise({stdout,stderr}):reject(new Error(`${command} exited ${code}: ${stderr.slice(-2400)}`)));});}
function durations(text,pattern){const values=[];for(const match of text.matchAll(pattern)){const value=Number(match[1]);if(Number.isFinite(value))values.push(value);}return values;}
const round=(value,digits=2)=>{const p=10**digits;return Math.round(Number(value||0)*p)/p;};

export async function inspectMediaWithFfmpeg(input,options={}){
  const ffmpeg=options.ffmpeg||'ffmpeg',ffprobe=options.ffprobe||'ffprobe',path=localPath(input.fileUri);
  const probe=await capture(ffprobe,['-v','error','-show_entries','format=duration:stream=index,codec_type,width,height,sample_rate,channels','-of','json',path]);
  const info=JSON.parse(probe.stdout||'{}'),streams=Array.isArray(info.streams)?info.streams:[];
  const video=streams.find((stream)=>stream.codec_type==='video'),audio=streams.find((stream)=>stream.codec_type==='audio');
  const durationSeconds=Number(info.format?.duration||0),width=Number(video?.width||0),height=Number(video?.height||0),hasVideo=Boolean(video),hasAudio=Boolean(audio);
  let blackSeconds=0,longestBlackSeconds=0,silenceSeconds=0,longestSilenceSeconds=0;
  if(hasVideo){const detected=await capture(ffmpeg,['-hide_banner','-nostats','-i',path,'-vf','blackdetect=d=0.8:pix_th=0.10','-an','-f','null','-']).catch(()=>({stdout:'',stderr:''}));const values=durations(detected.stderr,/black_duration:([0-9.]+)/g);blackSeconds=values.reduce((sum,value)=>sum+value,0);longestBlackSeconds=Math.max(0,...values);}
  if(hasAudio){const detected=await capture(ffmpeg,['-hide_banner','-nostats','-i',path,'-af','silencedetect=n=-42dB:d=1.2','-vn','-f','null','-']).catch(()=>({stdout:'',stderr:''}));const values=durations(detected.stderr,/silence_duration:\s*([0-9.]+)/g);silenceSeconds=values.reduce((sum,value)=>sum+value,0);longestSilenceSeconds=Math.max(0,...values);}
  const issues=[];let score=100;
  if(!hasVideo){issues.push('missing-video-stream');score-=100;}
  if(input.requireAudio&&!hasAudio){issues.push('missing-audio-stream');score-=100;}
  if(hasVideo&&(width<input.expectedWidth||height<input.expectedHeight)){issues.push(`resolution-below-target:${width}x${height}`);score-=35;}
  const expected=Math.max(1,Number(input.expectedDurationSeconds||0)),durationDelta=durationSeconds>0?Math.abs(durationSeconds-expected)/expected:1;
  if(durationDelta>0.08){issues.push(`duration-mismatch:${(durationDelta*100).toFixed(1)}%`);score-=30;}else if(durationDelta>0.04)score-=8;
  if(longestBlackSeconds>1.5){issues.push(`long-black-frame:${longestBlackSeconds.toFixed(2)}s`);score-=25;}else if(durationSeconds>0&&blackSeconds>durationSeconds*0.04)score-=8;
  if(input.requireAudio&&longestSilenceSeconds>3.2){issues.push(`long-audio-silence:${longestSilenceSeconds.toFixed(2)}s`);score-=25;}else if(input.requireAudio&&durationSeconds>0&&silenceSeconds>durationSeconds*0.08)score-=8;
  score=Math.max(0,Math.round(score));const passed=score>=85&&!issues.some((issue)=>/missing-|resolution-below|duration-mismatch|long-black|long-audio/.test(issue));
  return{passed,score,width,height,durationSeconds:round(durationSeconds),hasVideo,hasAudio,blackSeconds:round(blackSeconds),longestBlackSeconds:round(longestBlackSeconds),silenceSeconds:round(silenceSeconds),longestSilenceSeconds:round(longestSilenceSeconds),issues,metrics:{durationDelta:round(durationDelta,4),sampleRate:audio?.sample_rate?Number(audio.sample_rate):null,channels:audio?.channels?Number(audio.channels):null}};
}

export function withFinalMediaInspection(renderer,options={}){
  return{
    name:renderer.name,
    render:(input)=>renderer.render(input),
    inspect:(input)=>inspectMediaWithFfmpeg(input,options),
  };
}
