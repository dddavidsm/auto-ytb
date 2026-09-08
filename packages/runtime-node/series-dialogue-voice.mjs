import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { NodeUploadAssetLoader } from './index.mjs';
import { bindVoiceProviderToSeries, normalizeSeriesVoiceCast, selectPrimarySeriesVoice } from './series-voice.mjs';

const text=(value)=>String(value??'').trim();
const lower=(value)=>text(value).toLowerCase();
function stableSeed(seriesKey,voice){const digest=createHash('sha256').update(`${text(seriesKey)}:${voice.continuityKey||voice.key}:${voice.voiceId||'fallback'}`).digest();return digest.readUInt32BE(0);}
function run(command,args){return new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:['ignore','ignore','pipe']});let stderr='';child.stderr.on('data',(chunk)=>stderr=(stderr+chunk.toString()).slice(-4000));child.on('error',reject);child.on('exit',(code)=>code===0?resolve():reject(new Error(`${command} failed ${code}: ${stderr}`)));});}

function speakerFromLabel(label,cast,primary){
  const wanted=lower(label);
  if(!wanted)return{voice:primary,unknown:false,label:text(label)};
  if(['narrator','narration','voiceover','voice-over'].includes(wanted)){
    const narrator=cast.find((item)=>/narrator|host/i.test(item.role))??primary;
    return{voice:narrator,unknown:!narrator,label:text(label)};
  }
  const exact=cast.find((item)=>lower(item.name)===wanted||lower(item.key)===wanted);
  if(exact)return{voice:exact,unknown:false,label:text(label)};
  const fuzzy=cast.find((item)=>wanted.includes(lower(item.name))||lower(item.name).includes(wanted));
  return{voice:fuzzy??primary,unknown:!fuzzy,label:text(label)};
}

export function parseSeriesDialogueTurns(rawText,contextValue){
  const context=contextValue&&typeof contextValue==='object'?contextValue:{};
  const cast=normalizeSeriesVoiceCast(context.voiceCast),primary=selectPrimarySeriesVoice(context);
  const lines=String(rawText??'').replace(/\r/g,'').split('\n');
  const turns=[];let current=null;
  const flush=()=>{if(current?.text?.trim())turns.push({...current,text:current.text.trim()});current=null;};
  for(const rawLine of lines){
    const line=rawLine.trim();
    if(!line){if(current)current.text+='\n';continue;}
    const tagged=line.match(/^\[([^\]]{1,100})\]\s*(.*)$/)??line.match(/^([^:\[\]]{1,80}):\s+(.+)$/);
    if(tagged){flush();const resolved=speakerFromLabel(tagged[1],cast,primary);current={speakerLabel:text(tagged[1]),voice:resolved.voice,unknownSpeaker:resolved.unknown,text:text(tagged[2])};continue;}
    if(current)current.text+=`${current.text?' ':''}${line}`;
    else current={speakerLabel:primary?.name??'Narrator',voice:primary,unknownSpeaker:false,text:line};
  }
  flush();
  if(!turns.length&&text(rawText))turns.push({speakerLabel:primary?.name??'Narrator',voice:primary,unknownSpeaker:false,text:text(rawText)});
  return turns;
}

function shiftAlignment(alignment,offset,characters,starts,ends){
  const chars=alignment?.characters??[],rawStarts=alignment?.characterStartTimesSeconds??[],rawEnds=alignment?.characterEndTimesSeconds??[];
  if(chars.length!==rawStarts.length||chars.length!==rawEnds.length)return;
  for(let i=0;i<chars.length;i+=1){characters.push(chars[i]);starts.push(Number(rawStarts[i])+offset);ends.push(Number(rawEnds[i])+offset);}
}

export function bindDialogueVoiceProviderToSeries(provider,contextValue,options={}){
  const context=contextValue&&typeof contextValue==='object'?contextValue:{};
  const cast=normalizeSeriesVoiceCast(context.voiceCast),primary=selectPrimarySeriesVoice(context);
  const single=bindVoiceProviderToSeries(provider,context);
  if(!context.required||cast.length<2||!primary)return single;
  const store=options.store,ffmpeg=options.ffmpeg||'ffmpeg',loader=options.loader??new NodeUploadAssetLoader();
  if(!store)return single;
  return{
    name:provider.name,
    seriesVoiceContext:{seriesKey:text(context.seriesKey),primary,cast,multiSpeaker:true},
    async synthesize(input){
      const turns=parseSeriesDialogueTurns(input.text,context);
      const distinct=new Set(turns.map((turn)=>turn.voice?.key).filter(Boolean));
      if(turns.length<2||distinct.size<2)return single.synthesize(input);
      const work=await mkdtemp(join(tmpdir(),'auto-ytb-dialogue-'));
      try{
        const files=[],characters=[],starts=[],ends=[],speakerProofs=[];let offset=0,totalCost=0,totalBytes=0;
        for(let index=0;index<turns.length;index+=1){
          const turn=turns[index],voice=turn.voice??primary,resolvedVoiceId=voice?.voiceId||input.voice;
          if(!voice||!resolvedVoiceId)throw new Error(`No resolvable series voice for dialogue speaker ${turn.speakerLabel||'unknown'}`);
          const seed=stableSeed(context.seriesKey,voice);
          const asset=await provider.synthesize({...input,text:turn.text,voice:resolvedVoiceId,voiceSettings:voice.settings,seed,seriesVoice:{characterKey:voice.key,characterName:voice.name,continuityKey:voice.continuityKey}});
          const loaded=await loader.load(asset.uri),path=join(work,`turn-${String(index).padStart(3,'0')}.mp3`);await writeFile(path,loaded.body);files.push(path);
          shiftAlignment(asset.alignment,offset,characters,starts,ends);
          const duration=Math.max(0,Number(asset.durationSeconds??0));offset+=duration;totalCost+=Math.max(0,Number(asset.costUsd??0));totalBytes+=Number(asset.bytes??loaded.size??0);
          speakerProofs.push({turn:index+1,speakerLabel:turn.speakerLabel,characterKey:voice.key,characterName:voice.name,continuityKey:voice.continuityKey,resolvedVoiceId,canonicalVoiceId:voice.voiceId,usedFallbackVoice:!voice.voiceId,provider:voice.provider,seed,unknownSpeaker:Boolean(turn.unknownSpeaker),durationSeconds:duration});
        }
        const listPath=join(work,'concat.txt');await writeFile(listPath,files.map((path)=>`file '${path.replaceAll("'","'\\''")}'`).join('\n'));
        const outputPath=join(work,'dialogue.mp3');await run(ffmpeg,['-y','-f','concat','-safe','0','-i',listPath,'-c:a','libmp3lame','-b:a','128k',outputPath]);
        const bytes=new Uint8Array(await readFile(outputPath));
        const key=`voice/dialogue-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`,stored=await store.put({key,contentType:'audio/mpeg',data:bytes});
        const unknownSpeakers=[...new Set(speakerProofs.filter((item)=>item.unknownSpeaker).map((item)=>item.speakerLabel))];
        return{
          id:key.replace(/[^a-z0-9]/gi,'-'),uri:stored.uri,mimeType:'audio/mpeg',bytes:stored.bytes??bytes.byteLength,provider:provider.name,model:'multi-speaker-series-dialogue',durationSeconds:offset,alignment:{characters,characterStartTimesSeconds:starts,characterEndTimesSeconds:ends},language:input.language,voiceId:'multi-speaker',costUsd:totalCost,
          metadata:{voiceContinuity:{required:true,multiSpeaker:true,seriesKey:text(context.seriesKey),turnCount:turns.length,speakerCount:distinct.size,speakerProofs,unknownSpeakers,usedFallbackVoice:speakerProofs.some((item)=>item.usedFallbackVoice)},dialogue:{turns:turns.map((turn,index)=>({turn:index+1,speakerLabel:turn.speakerLabel,characterKey:turn.voice?.key??null,textLength:turn.text.length})),sourceBytes:totalBytes}},
        };
      }finally{await rm(work,{recursive:true,force:true});}
    },
  };
}
